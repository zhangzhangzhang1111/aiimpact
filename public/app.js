const ARTIFACTS = [
  ['impactReport', '影响面报告'],
  ['testChecklist', '测试清单'],
  ['reviewReport', '代码评审'],
  ['diffFile', 'Git Diff'],
  ['callGraphFile', '调用链 JSON'],
  ['summaryJson', '摘要 JSON'],
];

const state = {
  jobs: [],
  selectedJobId: undefined,
  selectedArtifact: 'impactReport',
};

const els = {
  refreshButton: document.querySelector('#refreshButton'),
  queueConcurrency: document.querySelector('#queueConcurrency'),
  queueActive: document.querySelector('#queueActive'),
  queuePending: document.querySelector('#queuePending'),
  jobCount: document.querySelector('#jobCount'),
  jobList: document.querySelector('#jobList'),
  emptyState: document.querySelector('#emptyState'),
  jobDetail: document.querySelector('#jobDetail'),
  detailTitle: document.querySelector('#detailTitle'),
  detailMeta: document.querySelector('#detailMeta'),
  detailStatus: document.querySelector('#detailStatus'),
  progressBar: document.querySelector('#progressBar'),
  progressText: document.querySelector('#progressText'),
  progressHistory: document.querySelector('#progressHistory'),
  artifactTabs: document.querySelector('#artifactTabs'),
  artifactContent: document.querySelector('#artifactContent'),
};

els.refreshButton.addEventListener('click', refresh);
setInterval(refresh, 3000);
refresh();

async function refresh() {
  const response = await fetch('/api/jobs');
  const body = await response.json();
  state.jobs = body.jobs || [];
  if (!state.selectedJobId && state.jobs.length > 0) {
    state.selectedJobId = state.jobs[0].id;
  }
  renderQueue(body.queue || {});
  renderJobs();
  await renderSelectedJob();
}

function renderQueue(queue) {
  els.queueConcurrency.textContent = queue.concurrency ?? '-';
  els.queueActive.textContent = queue.active ?? '-';
  els.queuePending.textContent = queue.pending ?? '-';
  els.jobCount.textContent = state.jobs.length;
}

function renderJobs() {
  els.jobList.innerHTML = '';
  if (state.jobs.length === 0) {
    els.jobList.innerHTML = '<div class="empty-state">暂无分析任务</div>';
    return;
  }

  for (const job of state.jobs) {
    const button = document.createElement('button');
    button.className = `job-item ${job.id === state.selectedJobId ? 'active' : ''}`;
    button.type = 'button';
    button.innerHTML = `
      <strong>${escapeHtml(job.request?.projectName || job.id)}</strong>
      <span>${escapeHtml(job.request?.branch || '-')} · ${escapeHtml(job.status)}</span>
      <span>${escapeHtml(job.progress?.message || job.createdAt || '')}</span>
    `;
    button.addEventListener('click', () => {
      state.selectedJobId = job.id;
      state.selectedArtifact = 'impactReport';
      renderJobs();
      renderSelectedJob();
    });
    els.jobList.append(button);
  }
}

async function renderSelectedJob() {
  const job = state.jobs.find((item) => item.id === state.selectedJobId);
  if (!job) {
    els.emptyState.classList.remove('hidden');
    els.jobDetail.classList.add('hidden');
    return;
  }

  els.emptyState.classList.add('hidden');
  els.jobDetail.classList.remove('hidden');
  els.detailTitle.textContent = job.request?.projectName || job.id;
  els.detailMeta.textContent = `${job.request?.branch || '-'} · ${job.request?.baseCommit || '-'} · ${job.id}`;
  els.detailStatus.textContent = job.status;
  els.detailStatus.className = `status ${job.status}`;

  const percent = Math.max(0, Math.min(100, job.progress?.percent ?? statusPercent(job.status)));
  els.progressBar.style.width = `${percent}%`;
  els.progressText.textContent = `${percent}%`;
  renderProgressHistory(job.progress?.history || []);
  renderArtifactTabs(job);
  await loadArtifact(job);
}

function renderProgressHistory(history) {
  els.progressHistory.innerHTML = '';
  for (const item of history.slice(-6)) {
    const li = document.createElement('li');
    li.textContent = `${item.stage}: ${item.message || ''}`;
    els.progressHistory.append(li);
  }
}

function renderArtifactTabs(job) {
  els.artifactTabs.innerHTML = '';
  for (const [key, label] of ARTIFACTS) {
    if (!job.result?.[key]) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.className = key === state.selectedArtifact ? 'active' : '';
    button.addEventListener('click', async () => {
      state.selectedArtifact = key;
      renderArtifactTabs(job);
      await loadArtifact(job);
    });
    els.artifactTabs.append(button);
  }
}

async function loadArtifact(job) {
  if (!job.result?.[state.selectedArtifact]) {
    els.artifactContent.textContent = job.status === 'completed' ? '该任务没有对应产物。' : '任务完成后可查看产物内容。';
    return;
  }

  const response = await fetch(`/api/jobs/${job.id}/artifacts/${state.selectedArtifact}`);
  els.artifactContent.textContent = response.ok ? await response.text() : '产物读取失败。';
}

function statusPercent(status) {
  if (status === 'completed') return 100;
  if (status === 'running') return 40;
  if (status === 'failed') return 100;
  return 0;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
