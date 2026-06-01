import fs from 'node:fs/promises';

export async function writeReports({ paths, context, agentOutputs }) {
  await fs.mkdir(paths.runDir, { recursive: true });
  await fs.writeFile(paths.diffFile, context.diff, 'utf8');
  await fs.writeFile(paths.callGraphFile, JSON.stringify(context.callGraph, null, 2), 'utf8');
  await fs.writeFile(paths.markdownReport, renderImpactReport({ context, agentOutputs }), 'utf8');
  await fs.writeFile(paths.reviewReport, renderReviewReport({ context, agentOutputs }), 'utf8');
  await fs.writeFile(paths.testChecklist, renderTestChecklist({ context, agentOutputs }), 'utf8');
  await fs.writeFile(
    paths.summaryJson,
    JSON.stringify(
      {
        request: context.request,
        headCommit: context.headCommit,
        languages: context.languages,
        changedFiles: context.changedFiles,
        changedFunctions: context.changedFunctions,
        artifacts: {
          impactReport: paths.markdownReport,
          reviewReport: paths.reviewReport,
          testChecklist: paths.testChecklist,
          diff: paths.diffFile,
          callGraph: paths.callGraphFile,
        },
      },
      null,
      2,
    ),
    'utf8',
  );
}

function renderImpactReport({ context, agentOutputs }) {
  return [
    `# ${context.request.projectName} 影响面分析报告`,
    '',
    '## 1. 基本信息',
    '',
    `| 字段 | 值 |`,
    `| --- | --- |`,
    `| 项目 | ${context.request.projectName} |`,
    `| 分支 | ${context.request.branch} |`,
    `| 对比 commit | ${context.request.baseCommit} |`,
    `| HEAD | ${context.headCommit} |`,
    `| 语言 | ${context.languages.join(', ') || '未识别'} |`,
    '',
    '## 2. 改动摘要',
    '',
    agentOutputs.diffSummary,
    '',
    '## 3. 改动函数与文件',
    '',
    renderChangedFunctions(context),
    '',
    '## 4. 调用链影响',
    '',
    agentOutputs.callGraphSummary,
    '',
    '## 5. 项目业务知识与特殊说明',
    '',
    ...(context.knowledge.length
      ? context.knowledge.map((item) => `- ${item.source}`)
      : ['- 未找到项目业务知识或特殊说明']),
    '',
    '## 6. 业务影响面结论',
    '',
    agentOutputs.knowledgeImpact,
    '',
    '## 7. 风险等级与处理建议',
    '',
    '- 高风险：涉及核心交易、资金、鉴权、数据一致性、跨语言边界或线上关键路径时必须专项验证。',
    '- 中风险：涉及共享模块、公共接口、配置和批处理任务时需要回归上下游。',
    '- 低风险：仅局部实现变更时仍需覆盖改动函数直接测试和基本回归。',
    '',
  ].join('\n');
}

function renderReviewReport({ context, agentOutputs }) {
  return [
    `# ${context.request.projectName} 代码评审报告`,
    '',
    '## 1. 语言与标准',
    '',
    `- 分支：${context.request.branch}`,
    `- 语言：${context.languages.join(', ') || '未识别'}`,
    ...(context.standards.length
      ? context.standards.map((item) => `- 已加载：${item.language} -> ${item.source}`)
      : ['- 未匹配到语言评审标准']),
    '',
    '## 2. 影响面输入',
    '',
    renderChangedFunctions(context),
    '',
    '## 3. 标准匹配与问题清单',
    '',
    agentOutputs.codeReview,
    '',
    '## 4. 审核结论',
    '',
    '- 必须确认所有高风险项有测试或明确豁免说明。',
    '- 必须确认 Lua、C/C++ 对应评审标准中的阻断项已检查。',
    '- 必须确认影响面报告中的业务链路均有回归策略。',
    '',
  ].join('\n');
}

function renderTestChecklist({ context, agentOutputs }) {
  return [
    `# ${context.request.projectName} 测试清单`,
    '',
    '## 1. 测试范围',
    '',
    `- 分支：${context.request.branch}`,
    `- 对比 commit：${context.request.baseCommit}`,
    `- 改动文件：${context.changedFiles.length}`,
    `- 改动函数：${context.changedFunctions.length}`,
    '',
    '## 2. 功能测试清单',
    '',
    agentOutputs.testChecklist,
    '',
    '## 3. 回归测试清单',
    '',
    '- 回归改动函数的直接调用入口。',
    '- 回归调用链上游业务入口和下游依赖模块。',
    '- 回归项目业务知识或特殊说明中提到的关键场景。',
    '- 回归错误处理、超时、空数据、权限、并发和资源释放。',
    '',
    '## 4. 上线验证',
    '',
    '- 确认产物中的 diff.patch、call-graph.json、影响面报告、代码评审报告均已生成。',
    '- 确认关键日志、指标、告警和回滚路径可用。',
    '- 确认生产配置、灰度策略和数据兼容性已经检查。',
    '',
  ].join('\n');
}

function renderChangedFunctions(context) {
  if (!context.changedFunctions.length) {
    return '- 未从 diff hunk 中识别到函数名，请人工结合 diff.patch 复核。';
  }
  return [
    '| 语言 | 文件 | 函数/符号 | 行号线索 |',
    '| --- | --- | --- | --- |',
    ...context.changedFunctions.map(
      (item) => `| ${item.language} | ${item.file} | ${item.symbol} | ${item.lineHint || ''} |`,
    ),
  ].join('\n');
}
