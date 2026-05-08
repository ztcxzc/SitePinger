<div align="center">

# SitePinger

**A clean, native macOS app for monitoring website uptime — built with Electron.**

Monitor up to 300 websites simultaneously from a single window.  
Get instant desktop alerts when any site goes down.

</div>

---

## What It Does

SitePinger is a lightweight macOS desktop application that continuously pings any number of websites and tells you the moment one goes offline. Each monitor ("pinger") runs independently — you can watch hundreds of sites at different intervals, all from one app.

- **Multi-site dashboard** — sidebar lists all your pingers, each with a live status dot  
- **Per-pinger state** — URL, interval, status, history, and response time tracked independently  
- **Instant offline alerts** — macOS native notification fires the moment a site goes from Online → Offline  
- **Response time colour-coding** — green < 300 ms · orange < 1 s · red ≥ 1 s  
- **Ping history** — last 10 results per site with timestamp, status, response time, and HTTP code  
- **Smart retry logic** — 3 retries with 2 s delay before declaring a site offline (avoids false positives)  
- **HEAD → GET fallback** — handles servers that reject HEAD requests  
- **Browser-like headers** — full User-Agent string so sites don't block monitoring traffic  
- **15-second timeout** — long enough for slow servers, short enough to detect real outages  

---

## Tech Stack

| Layer | Technology |
|---|---|
| App shell | [Electron 29](https://www.electronjs.org/) |
| HTTP requests | [axios 1.7](https://axios-http.com/) (main process only — no CORS) |
| Build tooling | [electron-builder 24](https://www.electron.build/) |
| Platform | macOS (Intel x64) |

All network requests run in the **main process** via IPC, completely bypassing browser CORS restrictions. The renderer only handles UI logic.

---

## Architecture

```
SitePinger/
├── main.js        ← Electron main: window, IPC handlers, axios pinging, notifications
├── renderer.js    ← UI logic: multi-pinger state, sidebar, history, DOM updates
├── index.html     ← App shell: sidebar layout, pinger detail panel, 300-limit modal
├── styles.css     ← Dark-theme design system (tokens, components, animations)
└── package.json   ← Dependencies + electron-builder config (macOS x64 DMG)
```

**IPC flow:**  
`renderer` → `ipcRenderer.invoke('ping-site', url)` → `main` → `axios` → returns `{ online, durationMs, httpStatus, errorMsg, attempts }`

---

## Running Locally

```bash
git clone https://github.com/ztcxzc/SitePinger.git
cd SitePinger
npm install

# Development
npm start

# Build distributable DMG (macOS Intel x64)
npm run build
# → dist/SitePinger-1.0.0.dmg
```

**Requirements:** Node.js 18+, macOS (Intel)

---

## Usage

1. Click **Add Pinger** (or the button on the empty screen) to create a new monitor
2. Enter a URL — e.g. `https://example.com` — and set an interval in seconds
3. Press **Start** (or hit Enter in the URL field)
4. The sidebar dot turns green when online, red when offline
5. Add as many pingers as you need (up to 300)
6. Click any sidebar item to inspect its history and current status
7. Click the **×** button on a sidebar item to remove that pinger

---

## How Pinging Works

Each ping attempt:

1. Sends a `HEAD` request with a browser User-Agent and a 15 s timeout
2. If the server rejects `HEAD`, falls back to `GET`
3. HTTP 1xx–3xx → **Online**; 4xx, 5xx, or no response → retried up to 3 times then **Offline**
4. Records response time, HTTP status code, and timestamp to the per-pinger history ring buffer

---

## License

MIT
