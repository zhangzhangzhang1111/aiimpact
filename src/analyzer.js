import fs from 'node:fs/promises';

import { AiClient } from './ai/client.js';
import { createArtifactPaths, createTimestamp } from './artifactPaths.js';
import { runAnalysisAgents } from './agents.js';
import { detectLanguages, extractChangedFunctions, parseNameStatus } from './diffParser.js';
import { prepareRepository } from './gitRepository.js';
import { loadLanguageStandards, loadProjectKnowledge } from './knowledge.js';
import { collectCallGraph } from './toolAdapters.js';
import { writeReports } from './reportWriter.js';

export async function analyzeProject({ jobId, request, config, progress = () => {} }) {
  progress({ stage: 'prepare', message: '准备分析产物目录', percent: 8 });
  const paths = createArtifactPaths({
    dataRoot: config.dataRoot,
    projectName: request.projectName,
    branch: request.branch,
    timestamp: createTimestamp(),
  });
  await fs.mkdir(paths.runDir, { recursive: true });

  progress({ stage: 'git_diff', message: '拉取仓库并获取 git diff', percent: 18 });
  const repository = await prepareRepository({
    gitUrl: request.gitUrl,
    branch: request.branch,
    baseCommit: request.baseCommit,
    workspaceDir: paths.workspaceDir,
  });

  const changedFiles = parseNameStatus(repository.nameStatus);
  const changedPaths = changedFiles.map((item) => item.path);
  const { languages, filesByLanguage } = detectLanguages(changedPaths);
  const changedFunctions = extractChangedFunctions(repository.diff);
  progress({ stage: 'language_scan', message: '识别语言、变更文件和改动函数', percent: 35 });

  const [knowledge, standards, callGraph] = await Promise.all([
    loadProjectKnowledge({
      repoDir: repository.repoDir,
      projectName: request.projectName,
      knowledgeDir: config.knowledgeDir,
    }),
    loadLanguageStandards({ languages, standardsDir: config.standardsDir }),
    collectCallGraph({
      repoDir: repository.repoDir,
      changedFunctions,
      languages,
      filesByLanguage,
      options: config.callGraph || {},
    }),
  ]);
  progress({ stage: 'call_graph', message: '完成两层调用链和代码片段采集', percent: 62 });

  const context = {
    jobId,
    request,
    headCommit: repository.headCommit,
    diff: repository.diff,
    diffPreview: repository.diff.slice(0, 12000),
    changedFiles,
    changedFunctions,
    languages,
    filesByLanguage,
    knowledge,
    standards,
    callGraph,
  };

  const aiClient = new AiClient({
    config: config.ai || {},
    requestedProfile: request.aiProfile,
  });
  progress({ stage: 'ai_analysis', message: '调用 AI agent 生成影响面、测试和评审内容', percent: 78 });
  const agentOutputs = await runAnalysisAgents({ aiClient, context });
  progress({ stage: 'write_reports', message: '写入报告和落地产物文件', percent: 92 });
  await writeReports({ paths, context, agentOutputs });

  return {
    runName: paths.runName,
    runDir: paths.runDir,
    summaryJson: paths.summaryJson,
    impactReport: paths.markdownReport,
    reviewReport: paths.reviewReport,
    testChecklist: paths.testChecklist,
    diffFile: paths.diffFile,
    callGraphFile: paths.callGraphFile,
  };
}
