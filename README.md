# SitePinger

A clean, modern macOS desktop application for monitoring website availability — built with Electron and Node.js.

![SitePinger Screenshot](assets/screenshot.png)

---

## Features

- Monitor any HTTP/HTTPS URL at a configurable interval
- Detects **Online** (HTTP 2xx–3xx) vs **Offline** status
- Measures and displays **response time** in milliseconds
- Response time colour-coding: green < 300 ms · orange < 1 s · red ≥ 1 s
- **Desktop notification** when a site transitions from Online → Offline
- **Ping history** — last 10 results with time, status, response time, HTTP code
- Graceful handling of DNS errors, timeouts, and connection refusals
- Prevents duplicate intervals (safe to click Start multiple times)
- Keyboard shortcut: press **Enter** in the URL field to start monitoring

---

## Project Structure

```
WebPinger/
├── main.js          ← Electron main process (window, menu, IPC, notifications)
├── renderer.js      ← UI logic (validation, axios pinging, history)
├── index.html       ← App markup
├── styles.css       ← Modern dark-theme styles
├── package.json     ← Dependencies + electron-builder config
├── assets/          ← (optional) icon.icns for branded builds
└── dist/            ← Generated after running `npm run build`
```

---

## Step-by-Step Guide

### 1 — Install Dependencies

Make sure you have **Node.js ≥ 18** and **npm** installed.

```bash
# Navigate to the project folder
cd /path/to/WebPinger

# Install all dependencies (Electron, electron-builder, axios)
npm install
```

> This creates a `node_modules/` folder. First run may take 1–3 minutes while Electron downloads its binary.

---

### 2 — Run the App (Development)

```bash
npm start
```

The SitePinger window will open immediately. No build step required for development.

**Try it out:**
1. Enter a URL — e.g. `https://github.com`
2. Set an interval — e.g. `5` seconds
3. Click **Start Monitoring**
4. Watch the status badge and history update in real time
5. Click **Stop** when done

---

### 3 — Build the macOS App (.app / .dmg)

#### Basic build (produces `.app` + `.dmg` + `.zip`)

```bash
npm run build
```

Output lands in the `dist/` folder:

```
dist/
├── SitePinger-1.0.0-arm64.dmg        ← Installer for Apple Silicon
├── SitePinger-1.0.0-x64.dmg          ← Installer for Intel Mac
├── SitePinger-1.0.0-arm64-mac.zip
└── SitePinger-1.0.0-x64-mac.zip
```

#### DMG only

```bash
npm run build:dmg
```

#### ZIP only

```bash
npm run build:zip
```

#### Installing the built app

1. Open the generated `.dmg` file in `dist/`
2. Drag **SitePinger** to your **Applications** folder
3. Double-click to launch — no terminal required

> **Gatekeeper note:** On first launch macOS may show _"unidentified developer"_. Right-click the app → **Open** → **Open** to allow it. This is expected for unsigned apps; code-signing requires an Apple Developer account.

---

### Optional — Add a Custom App Icon

1. Create a 1024×1024 PNG icon
2. Convert it to `.icns` format:
   ```bash
   mkdir MyIcon.iconset
   # Add all required sizes (16, 32, 64, 128, 256, 512, 1024) named icon_NxN.png
   iconutil -c icns MyIcon.iconset -o assets/icon.icns
   ```
3. Re-run `npm run build` — electron-builder will pick up `assets/icon.icns` automatically.

---

## Requirements

| Tool | Minimum Version |
|------|----------------|
| Node.js | 18.x |
| npm | 9.x |
| macOS | 11 Big Sur |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 29 |
| HTTP requests | axios 1.7 |
| UI | Vanilla HTML / CSS / JS |
| Packaging | electron-builder 24 |
