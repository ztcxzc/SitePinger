'use strict';

/**
 * renderer.js — SitePinger Multi-Pinger UI Logic
 *
 * Supports up to MAX_PINGERS independent monitors.
 * All HTTP requests are delegated to the main process via IPC.
 */

const { ipcRenderer } = require('electron');

// ── Constants ─────────────────────────────────────────────────────────────
const MAX_PINGERS = 300;
const MAX_HISTORY = 10;

// ── State ─────────────────────────────────────────────────────────────────
let nextId         = 1;
const pingers      = new Map();  // id → pinger object
let activePingerId = null;

// ── DOM Refs ──────────────────────────────────────────────────────────────
const pingerList   = document.getElementById('pingerList');
const emptyState   = document.getElementById('emptyState');
const pingerDetail = document.getElementById('pingerDetail');

// Control panel
const urlInput      = document.getElementById('urlInput');
const intervalInput = document.getElementById('intervalInput');
const startBtn      = document.getElementById('startBtn');
const stopBtn       = document.getElementById('stopBtn');
const errorMessage  = document.getElementById('errorMessage');

// Status
const pingDot      = document.getElementById('pingDot');
const statusBadge  = document.getElementById('statusBadge');
const responseTime = document.getElementById('responseTime');
const lastCheck    = document.getElementById('lastCheck');
const checkCount   = document.getElementById('checkCount');
const activeUrlBar = document.getElementById('activeUrlBar');
const activeUrl    = document.getElementById('activeUrl');
const historyList  = document.getElementById('historyList');
const historyCount = document.getElementById('historyCount');

// Modal & buttons
const addPingerBtn = document.getElementById('addPingerBtn');
const emptyAddBtn  = document.getElementById('emptyAddBtn');
const limitModal   = document.getElementById('limitModal');
const modalClose   = document.getElementById('modalClose');

// ── Pinger Factory ────────────────────────────────────────────────────────
function makePinger(id) {
  return {
    id,
    url:            '',
    intervalSec:    5,
    status:         'idle',   // 'idle' | 'online' | 'offline'
    running:        false,
    intervalHandle: null,
    lastStatus:     null,
    durationMs:     null,
    httpStatus:     null,
    lastCheck:      null,
    totalChecks:    0,
    history:        [],
    errorMsg:       null,
  };
}

// ── URL Validation ────────────────────────────────────────────────────────
function normaliseUrl(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = (trimmed.startsWith('http://') || trimmed.startsWith('https://'))
    ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost') return null;
    return withScheme;
  } catch { return null; }
}

// ── IPC Ping ──────────────────────────────────────────────────────────────
async function doPing(url) {
  return ipcRenderer.invoke('ping-site', url);
}

// ── Add Pinger ────────────────────────────────────────────────────────────
function addPinger() {
  if (pingers.size >= MAX_PINGERS) {
    limitModal.classList.remove('hidden');
    return;
  }
  const id = nextId++;
  pingers.set(id, makePinger(id));
  appendSidebarItem(id);
  selectPinger(id);
}

// ── Delete Pinger ─────────────────────────────────────────────────────────
function deletePinger(id) {
  const p = pingers.get(id);
  if (!p) return;

  if (p.intervalHandle) { clearInterval(p.intervalHandle); p.intervalHandle = null; }
  pingers.delete(id);
  document.getElementById(`pi-${id}`)?.remove();

  if (activePingerId === id) {
    activePingerId = null;
    const ids = [...pingers.keys()];
    if (ids.length > 0) selectPinger(ids[ids.length - 1]);
    else showEmpty();
  }
}

// ── Select Pinger ─────────────────────────────────────────────────────────
function selectPinger(id) {
  // Persist unsaved inputs from previous non-running pinger
  if (activePingerId !== null && pingers.has(activePingerId)) {
    const prev = pingers.get(activePingerId);
    if (!prev.running) {
      prev.url         = urlInput.value;
      prev.intervalSec = parseInt(intervalInput.value, 10) || 5;
    }
  }

  // Highlight sidebar item
  document.querySelectorAll('.pinger-item').forEach(el => el.classList.remove('active'));
  document.getElementById(`pi-${id}`)?.classList.add('active');

  activePingerId = id;
  const p = pingers.get(id);

  emptyState.classList.add('hidden');
  pingerDetail.classList.remove('hidden');

  // Populate panel from pinger state
  urlInput.value      = p.url;
  intervalInput.value = p.intervalSec;

  setStatus(p.status);
  responseTime.textContent = p.durationMs != null ? `${p.durationMs} ms` : '—';
  responseTime.style.color = msColor(p.durationMs);
  lastCheck.textContent    = p.lastCheck || '—';
  checkCount.textContent   = p.totalChecks;
  errorMessage.textContent = p.errorMsg || '';

  if (p.running && p.url) {
    activeUrl.textContent = p.url;
    activeUrlBar.classList.remove('hidden');
  } else {
    activeUrlBar.classList.add('hidden');
  }

  setInputsEnabled(!p.running);
  renderHistory(p.history);
}

function showEmpty() {
  activePingerId = null;
  emptyState.classList.remove('hidden');
  pingerDetail.classList.add('hidden');
  document.querySelectorAll('.pinger-item').forEach(el => el.classList.remove('active'));
}

// ── Sidebar ───────────────────────────────────────────────────────────────
function appendSidebarItem(id) {
  const el = document.createElement('div');
  el.className          = 'pinger-item';
  el.id                 = `pi-${id}`;
  el.setAttribute('role', 'listitem');
  el.innerHTML = `
    <div class="status-dot idle" id="pi-dot-${id}"></div>
    <div class="pinger-item-info">
      <span class="pinger-item-label" id="pi-lbl-${id}">New Pinger</span>
      <span class="pinger-item-running hidden" id="pi-run-${id}">live</span>
    </div>
    <button class="pinger-item-delete" aria-label="Remove pinger" tabindex="-1">×</button>
  `;

  el.addEventListener('click', (e) => {
    if (e.target.classList.contains('pinger-item-delete')) return;
    selectPinger(id);
  });
  el.querySelector('.pinger-item-delete').addEventListener('click', (e) => {
    e.stopPropagation();
    deletePinger(id);
  });

  pingerList.appendChild(el);
}

function updateSidebarItem(id) {
  const p   = pingers.get(id);
  const dot = document.getElementById(`pi-dot-${id}`);
  const lbl = document.getElementById(`pi-lbl-${id}`);
  const run = document.getElementById(`pi-run-${id}`);
  const el  = document.getElementById(`pi-${id}`);
  if (!p || !dot) return;

  dot.className   = `status-dot ${p.status}`;
  lbl.textContent = p.url
    ? p.url.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 26)
    : 'New Pinger';

  run?.classList.toggle('hidden', !p.running);
  el?.classList.toggle('active', activePingerId === id);
}

// ── Ping Cycle ────────────────────────────────────────────────────────────
async function runPingCycle(id) {
  const p = pingers.get(id);
  if (!p || !p.running) return;

  const result = await doPing(p.url);

  // Guard: pinger may have been stopped/deleted while awaiting
  if (!pingers.has(id) || !pingers.get(id).running) return;

  // Offline notification: only fires on online→offline transition
  if (p.lastStatus === 'online' && !result.online) {
    ipcRenderer.send('show-notification', {
      title: 'SitePinger — Site Down!',
      body:  `${p.url} is now OFFLINE.`,
    });
  }

  p.lastStatus  = result.online ? 'online' : 'offline';
  p.status      = p.lastStatus;
  p.durationMs  = result.durationMs;
  p.httpStatus  = result.httpStatus;
  p.lastCheck   = new Date().toLocaleTimeString();
  p.totalChecks++;
  p.errorMsg    = (!result.online && result.errorMsg) ? result.errorMsg : null;

  p.history.unshift({
    time:       p.lastCheck,
    online:     result.online,
    durationMs: result.durationMs,
    httpStatus: result.httpStatus,
    errorMsg:   result.errorMsg,
    attempts:   result.attempts,
  });
  if (p.history.length > MAX_HISTORY) p.history.pop();

  updateSidebarItem(id);

  // Update main panel only if this pinger is currently selected
  if (activePingerId === id) {
    setStatus(p.status);
    responseTime.textContent = `${p.durationMs} ms`;
    responseTime.style.color = msColor(p.durationMs);
    lastCheck.textContent    = p.lastCheck;
    checkCount.textContent   = p.totalChecks;
    errorMessage.textContent = p.errorMsg || '';
    renderHistory(p.history);
  }
}

// ── Start ─────────────────────────────────────────────────────────────────
async function startPinger(id) {
  const p = pingers.get(id);
  if (!p) return;

  errorMessage.textContent = '';

  const url = normaliseUrl(urlInput.value);
  if (!url) {
    errorMessage.textContent = 'Please enter a valid URL (e.g. https://example.com).';
    urlInput.focus();
    return;
  }

  const intervalSec = parseInt(intervalInput.value, 10);
  if (isNaN(intervalSec) || intervalSec < 1 || intervalSec > 3600) {
    errorMessage.textContent = 'Interval must be between 1 and 3600 seconds.';
    intervalInput.focus();
    return;
  }

  if (p.intervalHandle) { clearInterval(p.intervalHandle); p.intervalHandle = null; }

  urlInput.value   = url;
  p.url            = url;
  p.intervalSec    = intervalSec;
  p.running        = true;
  p.totalChecks    = 0;
  p.history        = [];
  p.lastStatus     = null;
  p.errorMsg       = null;
  p.status         = 'idle';
  p.durationMs     = null;
  p.lastCheck      = null;

  checkCount.textContent   = '0';
  responseTime.textContent = '—';
  lastCheck.textContent    = '—';
  responseTime.style.color = '';
  activeUrl.textContent    = url;
  activeUrlBar.classList.remove('hidden');
  setInputsEnabled(false);
  setStatus('idle');
  renderHistory([]);
  updateSidebarItem(id);

  await runPingCycle(id);

  if (pingers.has(id) && pingers.get(id).running) {
    p.intervalHandle = setInterval(() => runPingCycle(id), intervalSec * 1000);
  }
}

// ── Stop ──────────────────────────────────────────────────────────────────
function stopPinger(id) {
  const p = pingers.get(id);
  if (!p) return;

  if (p.intervalHandle) { clearInterval(p.intervalHandle); p.intervalHandle = null; }
  p.running    = false;
  p.lastStatus = null;
  p.status     = 'idle';

  setStatus('idle');
  responseTime.style.color = '';
  activeUrlBar.classList.add('hidden');
  setInputsEnabled(true);
  updateSidebarItem(id);
}

// ── UI Helpers ────────────────────────────────────────────────────────────
function setStatus(state) {
  pingDot.className      = `ping-dot ${state}`;
  statusBadge.className  = `status-badge status-${state}`;
  statusBadge.textContent =
    state === 'idle' ? 'Idle' : state === 'online' ? 'Online' : 'Offline';
}

function setInputsEnabled(enabled) {
  urlInput.disabled      = !enabled;
  intervalInput.disabled = !enabled;
  startBtn.disabled      = !enabled;
  stopBtn.disabled       =  enabled;
}

function msColor(ms) {
  if (ms == null) return '';
  if (ms < 300)   return 'var(--green)';
  if (ms < 1000)  return 'var(--orange)';
  return 'var(--red)';
}

function renderHistory(history) {
  historyCount.textContent = `${history.length} / ${MAX_HISTORY}`;
  if (history.length === 0) {
    historyList.innerHTML = '<div class="history-empty">No pings yet — start monitoring to see results here.</div>';
    return;
  }
  historyList.innerHTML = history.map(e => {
    const cls   = e.online ? 'online' : 'offline';
    const lbl   = e.online ? 'Online' : 'Offline';
    const code  = e.httpStatus ? `HTTP ${e.httpStatus}` : (e.errorMsg || 'Error');
    const retry = e.attempts > 1 ? ` ×${e.attempts}` : '';
    return `
      <div class="history-item">
        <span class="history-time">${e.time}</span>
        <span class="history-status ${cls}">${lbl}${retry}</span>
        <span class="history-response">${e.durationMs} ms</span>
        <span class="history-code">${code}</span>
      </div>`;
  }).join('');
}

// ── Event Listeners ───────────────────────────────────────────────────────
addPingerBtn.addEventListener('click', addPinger);
emptyAddBtn.addEventListener('click',  addPinger);

startBtn.addEventListener('click', () => { if (activePingerId != null) startPinger(activePingerId); });
stopBtn.addEventListener('click',  () => { if (activePingerId != null) stopPinger(activePingerId); });

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && activePingerId != null) startPinger(activePingerId);
});

intervalInput.addEventListener('blur', () => {
  const v = parseInt(intervalInput.value, 10);
  if (isNaN(v) || v < 1) intervalInput.value = 1;
  if (v > 3600)          intervalInput.value = 3600;
});

// Modal close
modalClose.addEventListener('click', () => limitModal.classList.add('hidden'));
limitModal.addEventListener('click', (e) => {
  if (e.target === limitModal || e.target.classList.contains('modal-backdrop'))
    limitModal.classList.add('hidden');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') limitModal.classList.add('hidden');
});

// ── Init ──────────────────────────────────────────────────────────────────
addPinger();  // start with one pinger ready to use
