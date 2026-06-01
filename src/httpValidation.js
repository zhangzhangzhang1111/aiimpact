const REQUIRED_ANALYZE_FIELDS = ['projectName', 'gitUrl', 'branch', 'baseCommit'];

export function validateAnalyzeRequest(payload) {
  const body = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const errors = REQUIRED_ANALYZE_FIELDS
    .filter((field) => typeof body[field] !== 'string' || body[field].trim() === '')
    .map((field) => `${field} is required`);

  if (typeof body.gitUrl === 'string' && body.gitUrl.trim() !== '') {
    const gitUrl = body.gitUrl.trim();
    const validUrl =
      gitUrl.startsWith('http://') ||
      gitUrl.startsWith('https://') ||
      gitUrl.startsWith('git@') ||
      gitUrl.startsWith('ssh://') ||
      gitUrl.endsWith('.git') ||
      gitUrl.startsWith('/');
    if (!validUrl) {
      errors.push('gitUrl must be an http(s), ssh, git, or absolute local repository URL');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    value: {
      projectName: body.projectName?.trim(),
      gitUrl: body.gitUrl?.trim(),
      branch: body.branch?.trim(),
      baseCommit: body.baseCommit?.trim(),
      aiProfile: body.aiProfile?.trim(),
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
    },
  };
}
