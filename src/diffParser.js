const LANGUAGE_BY_EXTENSION = new Map([
  ['.lua', 'lua'],
  ['.c', 'c/c++'],
  ['.h', 'c/c++'],
  ['.cc', 'c/c++'],
  ['.cpp', 'c/c++'],
  ['.cxx', 'c/c++'],
  ['.hpp', 'c/c++'],
  ['.hh', 'c/c++'],
  ['.hxx', 'c/c++'],
]);

export function parseNameStatus(output = '') {
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('\t');
      const status = parts[0];
      const filePath = parts.length >= 3 ? parts[2] : parts[1];
      return { status, path: filePath };
    })
    .filter((item) => item.path);
}

export function detectLanguages(paths = []) {
  const filesByLanguage = {};
  for (const filePath of paths) {
    const language = languageForPath(filePath);
    if (!language) continue;
    filesByLanguage[language] ||= [];
    filesByLanguage[language].push(filePath);
  }

  return {
    languages: Object.keys(filesByLanguage),
    filesByLanguage,
  };
}

export function languageForPath(filePath = '') {
  const match = String(filePath).toLowerCase().match(/(\.[^.\\/]+)$/);
  return match ? LANGUAGE_BY_EXTENSION.get(match[1]) : undefined;
}

export function extractChangedFunctions(diff = '') {
  const changed = [];
  let currentFile;

  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice('+++ b/'.length);
      continue;
    }
    if (!line.startsWith('@@') || !currentFile) continue;

    const hunk = parseHunkHeader(line);
    const language = languageForPath(currentFile);
    if (!hunk.context || !language) continue;

    const symbol = extractSymbolFromContext(hunk.context, language);
    if (symbol) {
      changed.push({
        file: currentFile,
        symbol,
        language,
        lineHint: hunk.newStart,
      });
    }
  }

  return dedupeChangedFunctions(changed);
}

function parseHunkHeader(line) {
  const match = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@\s*(.*)$/);
  return {
    newStart: match ? Number(match[1]) : undefined,
    context: match ? match[2].trim() : '',
  };
}

function extractSymbolFromContext(context, language) {
  if (language === 'lua') {
    return (
      context.match(/^function\s+([a-zA-Z_][\w.:]*)\s*\(/)?.[1] ||
      context.match(/^local\s+function\s+([a-zA-Z_][\w]*)\s*\(/)?.[1] ||
      context.match(/^([a-zA-Z_][\w.:]*)\s*=\s*function\s*\(/)?.[1]
    );
  }

  if (language === 'c/c++') {
    const normalized = context.replace(/\s+/g, ' ').trim();
    const match = normalized.match(/(?:[\w:*&<>~]+\s+)+([~a-zA-Z_][\w:]*)\s*\([^;]*\)\s*(?:const\s*)?\{/);
    return match?.[1]?.split('::').pop();
  }

  return undefined;
}

function dedupeChangedFunctions(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.file}:${item.symbol}:${item.lineHint}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
