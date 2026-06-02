import fs from 'node:fs/promises';

import { AiClient } from './ai/client.js';
import { createArtifactPaths, createTimestamp } from './artifactPaths.js';
import { runAnalysisAgents } from './agents.js';
import { detectLanguages, extractChangedFunctions, parseNameStatus } from './diffParser.js';
import { prepareRepository } from './gitRepository.js';
import { loadLanguageStandards, loadProjectKnowledge } from './knowledge.js';
import { collectCallGraph } from './toolAdapters.js';
import { writeReports } from './reportWriter.js';

export async function analyzeProject({ jobId, request, config }) {
  const paths = createArtifactPaths({
    dataRoot: config.dataRoot,
    projectName: request.projectName,
    branch: request.branch,
    timestamp: createTimestamp(),
  });
  await fs.mkdir(paths.runDir, { recursive: true });

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
  const agentOutputs = await runAnalysisAgents({ aiClient, context });
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
