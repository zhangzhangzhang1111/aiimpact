import path from 'node:path';

export function sanitizePathPart(value) {
  return String(value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'unknown';
}

export function createTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function createArtifactPaths({ dataRoot = '/data', projectName, branch, timestamp }) {
  const safeProject = sanitizePathPart(projectName);
  const safeBranch = sanitizePathPart(branch);
  const runName = `${safeProject}_${safeBranch}_${timestamp || createTimestamp()}`;
  const projectDir = path.posix.join(dataRoot, 'impact', safeProject);
  const runDir = path.posix.join(projectDir, runName);

  return {
    safeProject,
    safeBranch,
    runName,
    impactRoot: path.posix.join(dataRoot, 'impact'),
    projectDir,
    runDir,
    workspaceDir: path.posix.join(dataRoot, 'impact', '_workspaces', safeProject, runName),
    markdownReport: path.posix.join(runDir, 'impact-report.md'),
    reviewReport: path.posix.join(runDir, 'code-review.md'),
    testChecklist: path.posix.join(runDir, 'test-checklist.md'),
    summaryJson: path.posix.join(runDir, 'summary.json'),
    diffFile: path.posix.join(runDir, 'diff.patch'),
    callGraphFile: path.posix.join(runDir, 'call-graph.json'),
  };
}
