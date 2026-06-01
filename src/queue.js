export class AnalysisQueue {
  constructor({ concurrency = 2 } = {}) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error('concurrency must be a positive integer');
    }
    this.concurrency = concurrency;
    this.active = 0;
    this.pending = [];
  }

  enqueue(task) {
    if (typeof task !== 'function') {
      return Promise.reject(new Error('queued task must be a function'));
    }

    return new Promise((resolve, reject) => {
      this.pending.push({ task, resolve, reject });
      this.#drain();
    });
  }

  snapshot() {
    return {
      concurrency: this.concurrency,
      active: this.active,
      pending: this.pending.length,
    };
  }

  #drain() {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const item = this.pending.shift();
      this.active += 1;
      Promise.resolve()
        .then(item.task)
        .then(item.resolve, item.reject)
        .finally(() => {
          this.active -= 1;
          this.#drain();
        });
    }
  }
}
