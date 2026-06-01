import fs from 'node:fs/promises';
import path from 'node:path';

import { runCommand } from './shell.js';

export async function prepareRepository({ gitUrl, branch, baseCommit, workspaceDir }) {
  await fs.rm(workspaceDir, { recursive: true, force: true });
  await fs.mkdir(path.dirname(workspaceDir), { recursive: true });

  await runCommand('git', ['clone', '--branch', branch, '--single-branch', gitUrl, workspaceDir]);
  await runCommand('git', ['fetch', '--all', '--tags'], { cwd: workspaceDir, allowFailure: true });

  const head = await runCommand('git', ['rev-parse', 'HEAD'], { cwd: workspaceDir });
  const diff = await runCommand('git', ['diff', '--unified=80', `${baseCommit}...HEAD`], {
    cwd: workspaceDir,
  });
  const nameStatus = await runCommand('git', ['diff', '--name-status', `${baseCommit}...HEAD`], {
    cwd: workspaceDir,
  });

  return {
    repoDir: workspaceDir,
    headCommit: head.stdout.trim(),
    diff: diff.stdout,
    nameStatus: nameStatus.stdout,
  };
}
