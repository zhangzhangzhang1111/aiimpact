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
        callGraphDepth: context.callGraph?.depth || 2,
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
    `| 调用链深度 | ${context.callGraph?.depth || 2} 层 |`,
    `| 改动文件数 | ${context.changedFiles.length} |`,
    `| 改动函数数 | ${context.changedFunctions.length} |`,
    '',
    '## 2. 变更基线与范围',
    '',
    '### 2.1 变更摘要',
    '',
    agentOutputs.diffSummary,
    '',
    '### 2.2 范围边界',
    '',
    '- 范围内：本次 diff 直接修改的文件、识别出的函数、调用链上下游、项目业务知识中命中的业务约束。',
    '- 范围外：未被 diff、调用链、业务知识或人工补充说明覆盖的模块；这些模块需要在评审会上确认是否追加分析。',
    '',
    '## 3. 影响追踪矩阵',
    '',
    renderImpactTraceabilityMatrix(context),
    '',
    '## 4. 改动函数与文件',
    '',
    renderChangedFunctions(context),
    '',
    '## 5. 调用链与传播路径',
    '',
    agentOutputs.callGraphSummary,
    '',
    '## 6. 业务、需求、接口与数据影响',
    '',
    '### 6.1 项目业务知识与特殊说明',
    '',
    ...(context.knowledge.length
      ? context.knowledge.map((item) => `- ${item.source}`)
      : ['- 未找到项目业务知识或特殊说明']),
    '',
    '### 6.2 业务影响面结论',
    '',
    agentOutputs.knowledgeImpact,
    '',
    '### 6.3 接口、数据与配置检查',
    '',
    '- 接口契约：检查入参、出参、错误码、兼容性、调用方重试和超时策略。',
    '- 数据影响：检查读写表、缓存键、消息 topic、幂等键、迁移脚本和回滚数据策略。',
    '- 配置影响：检查开关、灰度、环境变量、默认值、动态配置和跨环境差异。',
    '',
    '## 7. 非功能与运行风险',
    '',
    '| 风险维度 | 检查问题 | 结论 |',
    '| --- | --- | --- |',
    '| 性能容量 | 是否改变热路径、循环、批处理、IO、缓存或数据库访问规模？ | 待评估 |',
    '| 稳定可靠 | 是否新增失败路径、重试、超时、降级、资源释放或状态一致性风险？ | 待评估 |',
    '| 安全合规 | 是否影响鉴权、权限、敏感数据、审计日志、依赖或输入校验？ | 待评估 |',
    '| 可观测性 | 是否需要补充日志、指标、链路追踪、告警或仪表盘？ | 待评估 |',
    '| 兼容性 | 是否影响 ABI/API、配置、协议、存储格式或多版本共存？ | 待评估 |',
    '',
    '## 8. 测试影响与回归策略',
    '',
    '- 直接验证：覆盖所有改动函数的正向、异常、边界和空值路径。',
    '- 上游回归：按调用链回归业务入口、接口入口、定时任务、消息消费和批处理入口。',
    '- 下游回归：覆盖依赖服务、数据库、缓存、文件、消息、Lua/C/C++ 边界和资源释放。',
    '- 非代码回归：检查配置、数据、脚本、文档、监控、发布流程和回滚流程。',
    '- 证据要求：每个高风险影响项必须关联测试用例、执行结果、缺陷或豁免说明。',
    '',
    '## 9. 发布、监控与回滚建议',
    '',
    '- 发布策略：建议使用灰度、分批、可观测阈值和人工确认点。',
    '- 监控策略：关注错误率、延迟、吞吐、资源占用、关键业务量、告警噪声和下游失败。',
    '- 回滚策略：确认代码、配置、数据、缓存和消息的回滚步骤可独立执行。',
    '',
    '## 10. 待确认事项与签署',
    '',
    '| 角色 | 确认内容 | 结论 |',
    '| --- | --- | --- |',
    '| 开发负责人 | 改动范围、调用链、风险等级准确 | 待确认 |',
    '| 测试负责人 | 测试范围、回归策略、退出准则充分 | 待确认 |',
    '| 业务/产品负责人 | 业务影响、用户影响、发布窗口可接受 | 待确认 |',
    '| 运维/发布负责人 | 监控、灰度、回滚方案可执行 | 待确认 |',
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
    '## 3. 影响面感知审核清单',
    '',
    '- 影响面报告中的高风险链路是否都有测试、监控和回滚证据。',
    '- 改动函数是否存在未覆盖的上游调用入口或下游副作用。',
    '- 非功能风险是否已经落实到性能、安全、稳定性和兼容性检查。',
    '',
    '## 4. 标准匹配与问题清单',
    '',
    agentOutputs.codeReview,
    '',
    '## 5. 审核结论与放行条件',
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
    '## 1. 测试计划标识与范围',
    '',
    `- 分支：${context.request.branch}`,
    `- 对比 commit：${context.request.baseCommit}`,
    `- 改动文件：${context.changedFiles.length}`,
    `- 改动函数：${context.changedFunctions.length}`,
    '- 测试目标：验证本次变更满足业务预期，且没有破坏已集成或已测试的软件能力。',
    '- 测试依据：git diff、调用链分析、项目业务知识、语言评审标准、影响面报告。',
    '',
    '## 2. 测试项、特性范围与排除项',
    '',
    '### 2.1 测试项',
    '',
    renderChangedFiles(context),
    '',
    '### 2.2 需测试特性',
    '',
    '- 改动函数直接承担的业务能力。',
    '- 调用链上游入口覆盖的用户流程、接口流程、任务流程和消息流程。',
    '- 项目业务知识或特殊说明中标记为关键、敏感、不可破坏的能力。',
    '',
    '### 2.3 暂不测试或需人工确认项',
    '',
    '- 未被工具识别到调用关系、且缺少业务知识映射的模块。',
    '- 需要外部系统、生产数据、硬件或特殊权限才能验证的场景。',
    '',
    '## 3. 风险优先级与测试策略',
    '',
    '| 风险等级 | 判定条件 | 测试策略 |',
    '| --- | --- | --- |',
    '| P0 高 | 核心交易、资金、鉴权、数据一致性、跨语言边界、不可逆数据写入 | 必测正向/异常/边界/回滚，必须有负责人签署 |',
    '| P1 中 | 公共模块、共享接口、批处理、配置、缓存、消息 | 必测直接功能和调用链回归 |',
    '| P2 低 | 局部实现、日志、非关键展示、低频工具链 | 冒烟验证和针对性回归 |',
    '',
    '## 4. 测试设计矩阵',
    '',
    '| 测试类型 | 设计依据 | 覆盖要求 | 执行结果 |',
    '| --- | --- | --- | --- |',
    '| 功能测试 | 业务知识、需求、验收条件 | 正向主流程、异常流程、边界值、状态迁移 | 待执行 |',
    '| 接口/集成测试 | 调用链、接口契约、下游依赖 | 入参出参、错误码、超时、重试、幂等 | 待执行 |',
    '| 回归测试 | 上游调用、下游依赖、历史缺陷 | 直接入口、间接入口、关键业务链路 | 待执行 |',
    '| 非功能测试 | 风险矩阵、运行指标 | 性能、稳定性、安全、兼容性、可观测性 | 待执行 |',
    '| 数据/配置测试 | 数据写入、迁移、缓存、动态配置 | 默认值、灰度值、回滚值、脏数据 | 待执行 |',
    '',
    '## 5. 功能测试清单',
    '',
    agentOutputs.testChecklist,
    '',
    '## 6. 测试用例规格表',
    '',
    '| 用例ID | 关联影响项/函数 | 前置条件 | 测试数据 | 步骤摘要 | 预期结果 | 优先级 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...renderTestCaseRows(context),
    '',
    '## 7. 准入、暂停、恢复与退出准则',
    '',
    '### 7.1 准入准则',
    '',
    '- 代码已合并到可测试分支，构建通过，基础静态检查无阻断问题。',
    '- diff、调用链、影响面、评审标准和测试环境信息已生成。',
    '- P0/P1 影响项已明确负责人、测试数据和执行环境。',
    '',
    '### 7.2 暂停与恢复准则',
    '',
    '- 暂停：构建不可用、核心环境不可用、阻断缺陷未修复、关键测试数据不可用。',
    '- 恢复：阻断条件解除，缺陷修复已重新部署，受影响用例从失败点重新执行。',
    '',
    '### 7.3 退出准则',
    '',
    '- P0/P1 用例全部执行并有结果，高风险项无未关闭阻断缺陷。',
    '- 所有失败用例均有缺陷、豁免或延期说明。',
    '- 回归范围、上线验证、监控和回滚方案已确认。',
    '',
    '## 8. 回归测试清单',
    '',
    '- 回归改动函数的直接调用入口。',
    '- 回归调用链上游业务入口和下游依赖模块。',
    '- 回归项目业务知识或特殊说明中提到的关键场景。',
    '- 回归错误处理、超时、空数据、权限、并发和资源释放。',
    '',
    '## 9. 执行记录、缺陷记录与测试证据',
    '',
    '| 记录项 | 要求 |',
    '| --- | --- |',
    '| 执行记录 | 记录执行人、时间、环境、版本、结果、失败截图/日志 |',
    '| 缺陷记录 | 记录复现步骤、实际结果、预期结果、影响范围、严重级别、关联用例 |',
    '| 测试证据 | 保存接口响应、日志、监控截图、数据库校验、自动化报告和流水线链接 |',
    '',
    '## 10. 覆盖追踪与审批',
    '',
    '| 追踪项 | 覆盖证据 | 状态 |',
    '| --- | --- | --- |',
    '| 改动函数 -> 用例 | 见第 6 节用例规格表 | 待确认 |',
    '| 调用链影响 -> 回归项 | 见第 4/8 节 | 待确认 |',
    '| 业务知识 -> 功能测试 | 见第 5 节 | 待确认 |',
    '| 风险项 -> 退出准则 | 见第 3/7 节 | 待确认 |',
    '',
    '## 11. 上线验证',
    '',
    '- 确认产物中的 diff.patch、call-graph.json、影响面报告、代码评审报告均已生成。',
    '- 确认关键日志、指标、告警和回滚路径可用。',
    '- 确认生产配置、灰度策略和数据兼容性已经检查。',
    '',
  ].join('\n');
}

function renderChangedFiles(context) {
  if (!context.changedFiles.length) return '- 未识别到变更文件。';
  return [
    '| 状态 | 文件 |',
    '| --- | --- |',
    ...context.changedFiles.map((item) => `| ${item.status} | ${item.path} |`),
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

function renderImpactTraceabilityMatrix(context) {
  if (!context.changedFunctions.length) {
    return '- 未识别到函数级影响项，请人工基于 diff.patch 建立需求、设计、代码和测试追踪。';
  }
  return [
    '| 影响项ID | 变更对象 | 追踪来源 | 潜在受影响对象 | 测试证据要求 |',
    '| --- | --- | --- | --- | --- |',
    ...context.changedFunctions.map((item, index) => {
      const id = `IA-${String(index + 1).padStart(3, '0')}`;
      return `| ${id} | ${item.symbol} | ${item.file}:${item.lineHint || ''} | 上游调用、下游依赖、接口契约、业务规则、数据读写 | 至少 1 个直接用例 + 1 个调用链回归用例 |`;
    }),
  ].join('\n');
}

function renderTestCaseRows(context) {
  if (!context.changedFunctions.length) {
    return ['| TC-001 | diff.patch 人工复核 | 测试环境可用 | 典型业务数据 | 执行冒烟流程 | 无新增阻断异常 | P1 |'];
  }
  return context.changedFunctions.map((item, index) => {
    const id = `TC-${String(index + 1).padStart(3, '0')}`;
    return `| ${id} | ${item.symbol} | 相关服务和依赖可用 | 正常/异常/边界数据 | 执行 ${item.symbol} 直接或上游入口 | 结果符合业务规则且无副作用 | P1 |`;
  });
}
