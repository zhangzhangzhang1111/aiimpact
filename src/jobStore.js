import { randomUUID } from 'node:crypto';

export class JobStore {
  constructor() {
    this.jobs = new Map();
  }

  create(request) {
    const now = new Date().toISOString();
    const job = {
      id: `job_${randomUUID().replace(/-/g, '')}`,
      status: 'queued',
      request,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  update(id, patch) {
    const current = this.jobs.get(id);
    if (!current) return undefined;
    const next = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(id, next);
    return next;
  }

  get(id) {
    return this.jobs.get(id);
  }

  list() {
    return Array.from(this.jobs.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
