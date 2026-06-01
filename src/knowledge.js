import fs from 'node:fs/promises';
import path from 'node:path';

import { sanitizePathPart } from './artifactPaths.js';

const PROJECT_KNOWLEDGE_FILES = [
  '.aiimpact/business.md',
  '.aiimpact/special-notes.md',
  '.aiimpact/knowledge.md',
  'aiimpact.md',
];

export async function loadProjectKnowledge({ repoDir, projectName, knowledgeDir = 'knowledge/projects' }) {
  const snippets = [];

  for (const relative of PROJECT_KNOWLEDGE_FILES) {
    const content = await readOptional(path.join(repoDir, relative));
    if (content) {
      snippets.push({ source: `repository:${relative}`, content });
    }
  }

  const localName = `${sanitizePathPart(projectName)}.md`;
  const localContent = await readOptional(path.resolve(knowledgeDir, localName));
  if (localContent) {
    snippets.push({ source: `service:${knowledgeDir}/${localName}`, content: localContent });
  }

  return snippets;
}

export async function loadLanguageStandards({ languages, standardsDir = 'standards' }) {
  const standards = [];
  const files = {
    lua: 'lua.md',
    'c/c++': 'c_cpp.md',
  };

  for (const language of languages) {
    const fileName = files[language];
    if (!fileName) continue;
    const content = await readOptional(path.resolve(standardsDir, fileName));
    if (content) standards.push({ language, source: `${standardsDir}/${fileName}`, content });
  }

  return standards;
}

async function readOptional(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}
