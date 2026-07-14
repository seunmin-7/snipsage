# SnapGrok Chrome Extension MVP

SnapGrok captures the **visible area of the active Chrome tab**, sends it to a local Node.js backend together with a shortcut-specific instruction and calculated word limit, then displays the Grok response in a temporary Chrome popup window.

## Important Chrome limitations

This package is a working Chrome-extension MVP, but Chrome's security model imposes three boundaries:

1. **Automatic capture is limited to the visible active Chrome tab.** A Chrome extension cannot silently capture the whole monitor or another desktop application. Chrome's desktop-capture API always opens a user picker. A native companion or Electron version is required for true one-keystroke whole-screen capture.
2. **Chrome owns shortcut bindings.** The extension displays the current bindings, but users change them at `chrome://extensions/shortcuts`.
3. **An extension cannot truly quit itself.** Ctrl+Shift+Z therefore pauses SnapGrok and closes its response windows. Clicking the extension icon and pressing Resume enables it again.

## Folder layout

```text
snapgrok-chrome-extension/
├── README.md
├── server/
│   ├── .env.example
│   ├── package.json
│   ├── start-server.bat
│   ├── start-server.ps1
│   └── src/
│       ├── data-store.js
│       ├── env.js
│       ├── server.js
│       └── xai.js
└── extension/
    ├── manifest.json
    ├── service-worker.js
    ├── popup.html / popup.css / popup.js
    ├── instruction.html / instruction.js
    ├── output-settings.html / output-settings.js
    ├── output.html / output.css / output.js
    ├── editor.css
    ├── shared.js
    └── quit-listener.js
```

## 1. Install Node.js

Install Node.js 20 or newer. Confirm in PowerShell or Command Prompt:

```powershell
node --version
npm --version
```

## 2. Configure the xAI keys

Open the `server` folder.

1. Copy `.env.example` and rename the copy to `.env`.
2. Open `.env` in a text editor.
3. Replace this line with your inference API key:

```env
XAI_API_KEY=paste_your_xai_api_key_here
```

Never put the key in any file inside `extension/`. Anyone can inspect extension source code.

### Optional live credit display

xAI exposes prepaid balance through its Management API, which requires a **separate management key** and team ID. Add these to `.env`:

```env
XAI_MANAGEMENT_API_KEY=your_management_key
XAI_TEAM_ID=your_team_id
```

The UI shows exact prepaid USD credit. If `XAI_OUTPUT_USD_PER_MILLION_TOKENS` is set, it additionally shows an output-token-only estimate. That estimate excludes image and input costs and is not an account token quota.

### Optional no-cost UI test

Set:

```env
MOCK_XAI=true
```

The extension will complete the workflow without making a paid API call.

## 3. Start the backend

In the `server` folder:

```powershell
npm start
```

There are no third-party npm dependencies. On Windows you can also double-click `start-server.bat` after creating `.env`.

A successful launch prints:

```text
SnapGrok server: http://127.0.0.1:8787
```

Leave that terminal open while using the extension.

Test the server in a browser:

```text
http://127.0.0.1:8787/api/health
```

## 4. Load the extension into Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select the `extension` folder, not the project root.
5. Pin SnapGrok to the toolbar.
6. Click the SnapGrok icon. The settings interface opens immediately.

## 5. Configure shortcuts

The four suggested Chrome-focused shortcuts are:

- Ctrl+Shift+A
- Ctrl+Shift+B
- Ctrl+Shift+C
- Ctrl+Shift+D

Click a green shortcut button or **Customize keys** to open `chrome://extensions/shortcuts`. Chrome may leave a binding empty when it conflicts with another extension or browser command.

Chrome permits only four suggested shortcuts in a manifest. “Pause SnapGrok” is therefore defined without a preset binding. Assign Ctrl+Shift+Z manually on the Chrome shortcut page for browser-level handling. The included page listener also recognizes Ctrl+Shift+Z on ordinary websites.

## 6. Use the app

1. Keep the backend terminal running.
2. Open the Chrome tab containing the task.
3. Press one of the four shortcuts.
4. The extension captures the visible tab, opens an “Analyzing…” response window, calls the local backend, and replaces the loading text with Grok's response.
5. The response window closes after the configured duration. Set the duration to `0` to keep it open.

The output uses approximately 10pt Times New Roman. The output-settings page estimates how many words fit in the selected window. The backend also truncates at that word boundary, so the limit is enforced even if the model exceeds the prompt instruction.

## Data retention

- **Delete data after each case enabled:** the server sends the request to xAI but does not write the screenshot or response to disk.
- **Disabled:** each case is written under `server/data/cases/` as an image and JSON metadata file.
- **Clear all retained data:** deletes the locally saved case files.
- The xAI request uses `store: false`, independently of the local retention choice.

## Troubleshooting

### Server offline

Confirm the terminal is still running and the extension's Backend URL is `http://127.0.0.1:8787`.

### XAI_API_KEY is missing

Create `server/.env`, paste the key, save it, and restart the backend.

### Shortcut does nothing

Open `chrome://extensions/shortcuts`, verify the command has a key, and check for conflicts. The A–D shortcuts are Chrome-scoped, so they are intended to run while Chrome has focus.

### Screenshot is not the whole monitor

That is an intentional browser-security limitation. This build captures only the visible active tab. Use the Electron/native version for other applications or the complete monitor.

### Response window is too small

Open that shortcut's Output Window settings and increase width or height. The word limit recalculates immediately.

## Before deploying to other users

This development server deliberately has no account authentication because it listens only on `127.0.0.1`. Before hosting it publicly, add authentication, per-user quotas, rate limiting, abuse controls, HTTPS, encrypted secret management, a real database, and a privacy policy. Do not expose the current `/api/data` or `/api/analyze` endpoints directly to the internet.
