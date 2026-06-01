import fs from 'node:fs/promises';
import path from 'node:path';

export async function loadConfig() {
  const defaultConfig = await readJson(path.resolve('config/default.json'));
  const overridePath = process.env.CONFIG_PATH;
  const overrideConfig = overridePath ? await readJson(path.resolve(overridePath)) : {};
  const merged = deepMerge(defaultConfig, overrideConfig);
  if (process.env.DATA_ROOT) merged.dataRoot = process.env.DATA_ROOT;
  if (process.env.CONCURRENCY) merged.concurrency = Number(process.env.CONCURRENCY);
  return merged;
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function deepMerge(base, override) {
  const result = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = deepMerge(result[key] || {}, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}
