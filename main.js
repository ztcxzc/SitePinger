'use strict';

const { app, BrowserWindow, Notification, ipcMain, Menu } = require('electron');
const path = require('path');
const fs   = require('fs');
const axios = require('axios');

// ── File logger (works in both dev and packaged builds) ──────────────────────
const logPath = path.join(app.getPath('userData'), 'sitepinger.log');
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
  process.stdout.write(line);
  try { fs.appendFileSync(logPath, line); } catch (_) {}
}

let mainWindow = null;

// ── Build a minimal native menu (keeps Cmd+C/V/Q working on macOS) ──────────
function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Create the main browser window ──────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 780,
    height: 720,
    minWidth: 600,
    minHeight: 580,
    titleBarStyle: 'hiddenInset',   // macOS traffic-light buttons inset
    backgroundColor: '#0d1117',
    show: false,                    // show only after content is ready
    webPreferences: {
      nodeIntegration: true,        // allows require() in renderer
      contextIsolation: false,      // paired with nodeIntegration
      devTools: true,               // always on so we can inspect errors
    },
  });

  mainWindow.loadFile('index.html');

  // Show window once DOM is painted (avoids white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  buildMenu();
  createWindow();

  // macOS: re-create window when dock icon is clicked and no windows are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (non-macOS platforms)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ── IPC: Ping Handler ───────────────────────────────────────────────────────
// Renderer invokes 'ping-site' with a URL; main process performs the HTTP
// request via axios (no CORS restrictions) and returns the result object.
// Implements retry logic to handle slow servers / cold starts (e.g. Render).

const PING_TIMEOUT   = 15_000;  // 15 s per attempt
const MAX_RETRIES    = 3;
const RETRY_DELAY_MS = 2_000;   // 2 s between retries

// Browser-like headers so servers don't block the request
const REQUEST_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

function classifyError(err) {
  if (!err) return 'Unknown error';
  const c = err.code || '';
  if (c === 'ECONNABORTED' || c === 'ETIMEDOUT') return `Timeout (15 s)`;
  if (c === 'ENOTFOUND')    return `DNS not found`;
  if (c === 'ECONNREFUSED') return `Connection refused`;
  if (c === 'ECONNRESET')   return `Connection reset`;
  if (c.includes('CERT') || c.includes('SSL') || c.includes('TLS'))
    return `SSL error: ${c}`;
  if (err.message) return err.message.slice(0, 80);
  return `Error: ${c}`;
}

ipcMain.handle('ping-site', async (_event, url) => {
  const { performance } = require('perf_hooks');

  const makeRequest = (method) =>
    axios.request({
      method,
      url,
      timeout: PING_TIMEOUT,
      validateStatus: () => true,  // never throw on HTTP error status
      headers: REQUEST_HEADERS,
      maxRedirects: 10,
    });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let lastErr  = null;
  let totalMs  = 0;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const start = performance.now();
    log(`Attempt ${attempt}/${MAX_RETRIES} → ${url}`);

    try {
      let response;
      try {
        response = await makeRequest('HEAD');
        console.log(`[SitePinger]   HEAD → ${response.status}`);
      } catch (headErr) {
        // HEAD blocked or timed out — fall back to GET
        console.log(`[SitePinger]   HEAD failed (${headErr.code}), trying GET…`);
        response = await makeRequest('GET');
        console.log(`[SitePinger]   GET  → ${response.status}`);
      }

      totalMs = Math.round(performance.now() - start);
      const httpStatus = response.status;
      const online     = httpStatus >= 200 && httpStatus < 400;
      log(`  → ${online ? 'ONLINE' : 'OFFLINE'} (${httpStatus}) in ${totalMs} ms`);
      return { online, durationMs: totalMs, httpStatus, errorMsg: null, attempts: attempt };

    } catch (err) {
      totalMs  = Math.round(performance.now() - start);
      lastErr  = err;
      log(`  ✗ Attempt ${attempt} failed in ${totalMs} ms: [${err.code}] ${err.message}`);

      if (attempt < MAX_RETRIES) {
        log(`  Waiting ${RETRY_DELAY_MS} ms before retry…`);
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  // All retries exhausted
  const errorMsg = classifyError(lastErr);
  log(`All ${MAX_RETRIES} attempts failed. Final error: [${lastErr?.code}] ${lastErr?.message}`);
  return { online: false, durationMs: totalMs, httpStatus: null, errorMsg, attempts: MAX_RETRIES };
});

// ── IPC: Log path (so renderer can show where debug log is) ─────────────────
ipcMain.handle('get-log-path', () => logPath);

// ── IPC: Desktop Notification ────────────────────────────────────────────────
// Renderer sends 'show-notification' when a site goes offline
ipcMain.on('show-notification', (_event, { title, body }) => {
  if (Notification.isSupported()) {
    const n = new Notification({ title, body, silent: false });
    n.show();
    n.on('click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  }
});
