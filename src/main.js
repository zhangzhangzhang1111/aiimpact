import { analyzeProject } from './analyzer.js';
import { loadConfig } from './config.js';
import { JobStore } from './jobStore.js';
import { AnalysisQueue } from './queue.js';
import { createHttpServer } from './server.js';

const config = await loadConfig();
const port = Number(process.env.PORT || config.port || 3000);
const host = process.env.HOST || config.host || '0.0.0.0';
const queue = new AnalysisQueue({ concurrency: Number(config.concurrency || 2) });
const jobs = new JobStore();
const server = createHttpServer({
  queue,
  jobs,
  analyzer: analyzeProject,
  config,
});

server.listen(port, host, () => {
  console.log(`linuxaiimpact listening on http://${host}:${port}`);
  console.log(`data root: ${config.dataRoot}`);
  console.log(`queue concurrency: ${queue.concurrency}`);
});
