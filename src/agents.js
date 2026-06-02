export async function runAnalysisAgents({ aiClient, context }) {
  const diffSummary = await aiClient.complete('diff', {
    system: '你是代码差异分析 agent，负责提炼本次 git diff 的技术改动、语言、文件和关键函数。',
    user: JSON.stringify(pickContext(context, ['request', 'languages', 'changedFiles', 'changedFunctions']), null, 2),
    fallback: buildDiffFallback(context),
  });

  const callGraphSummary = await aiClient.complete('callGraph', {
    system: '你是调用链分析 agent，负责基于内部 LuaLS adapter、codegraph adapter 和静态降级结果总结默认两层上下游影响，重点使用链路节点里的函数代码片段。',
    user: JSON.stringify(pickContext(context, ['changedFunctions', 'callGraph']), null, 2),
    fallback: buildCallGraphFallback(context),
  });

  const knowledgeImpact = await aiClient.complete('businessImpact', {
    system: '你是业务影响面分析 agent，负责结合项目业务知识、特殊说明、两层调用链函数和代码片段输出功能影响。',
    user: JSON.stringify(pickContext(context, ['knowledge', 'changedFunctions', 'callGraph']), null, 2),
    fallback: buildBusinessFallback(context),
  });

  const testChecklist = await aiClient.complete('testChecklist', {
    system: '你是测试设计 agent，负责输出全面业务功能测试清单、回归范围、异常路径和上线验证。',
    user: JSON.stringify(pickContext(context, ['request', 'changedFunctions', 'callGraph', 'knowledge']), null, 2),
    fallback: buildTestFallback(context),
  });

  const codeReview = await aiClient.complete('review', {
    system: '你是代码审核 agent，负责结合语言审核标准、diff、影响面和调用链输出审核意见。',
    user: JSON.stringify(pickContext(context, ['languages', 'standards', 'changedFunctions', 'diffPreview']), null, 2),
    fallback: buildReviewFallback(context),
  });

  return {
    diffSummary,
    callGraphSummary,
    knowledgeImpact,
    testChecklist,
    codeReview,
  };
}

function pickContext(context, keys) {
  return Object.fromEntries(keys.map((key) => [key, context[key]]));
}

function buildDiffFallback(context) {
  return [
    '## 差异摘要',
    '',
    `- 项目：${context.request.projectName}`,
    `- 分支：${context.request.branch}`,
    `- 对比 commit：${context.request.baseCommit}`,
    `- 语言：${context.languages.join(', ') || '未识别'}`,
    `- 变更文件数：${context.changedFiles.length}`,
    `- 改动函数数：${context.changedFunctions.length}`,
  ].join('\n');
}

function buildCallGraphFallback(context) {
  const lines = ['## 调用链影响', ''];
  for (const entry of context.callGraph.entries) {
    lines.push(`- ${entry.language} ${entry.file}:${entry.symbol}`);
    lines.push(`  - 上游线索：${entry.callers?.length || 0} 条`);
    lines.push(`  - 下游调用：${entry.callees?.slice(0, 10).join(', ') || '未识别'}`);
  }
  if (context.callGraph.tools?.length) {
    lines.push('', '### 工具状态');
    for (const tool of context.callGraph.tools) {
      lines.push(`- ${tool.tool}: ${tool.status}${tool.reason ? ` (${tool.reason})` : ''}`);
    }
  }
  return lines.join('\n');
}

function buildBusinessFallback(context) {
  const lines = ['## 业务影响面', ''];
  if (context.knowledge.length === 0) {
    lines.push('- 未找到项目业务知识或特殊说明，按代码调用链和变更范围进行保守分析。');
  } else {
    lines.push(`- 已读取 ${context.knowledge.length} 份项目业务知识/特殊说明。`);
  }
  for (const fn of context.changedFunctions) {
    lines.push(`- ${fn.symbol} 可能影响 ${fn.file} 所在模块及其上下游调用路径。`);
  }
  return lines.join('\n');
}

function buildTestFallback(context) {
  const lines = ['## 业务功能测试清单', ''];
  lines.push('- 验证所有改动文件对应的核心正向业务流程。');
  lines.push('- 覆盖改动函数的边界值、异常输入、权限或状态机分支。');
  lines.push('- 按调用链回归上游入口和下游依赖，包括失败重试、超时和空数据。');
  lines.push('- 对 Lua/C/C++ 变更补充内存、并发、资源释放和错误码回归。');
  for (const file of context.changedFiles) {
    lines.push(`- 文件级回归：${file.path} (${file.status})`);
  }
  return lines.join('\n');
}

function buildReviewFallback(context) {
  const lines = ['## 代码评审标准匹配', ''];
  for (const standard of context.standards) {
    lines.push(`### ${standard.language}`);
    lines.push(`- 已加载标准：${standard.source}`);
  }
  lines.push('- 检查 diff 是否缺少错误处理、日志、测试、资源释放和兼容性说明。');
  lines.push('- 对跨语言调用边界检查 ABI、内存所有权、空指针、线程安全和错误码。');
  return lines.join('\n');
}
