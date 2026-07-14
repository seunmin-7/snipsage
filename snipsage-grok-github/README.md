# SnipSage

SnipSage is a Chrome Manifest V3 prototype that lets a user press a shortcut, drag over a visible region of a webpage, send the cropped screenshot to a local Node.js backend, and read a compact Grok response in a small popup window.

## Current features

- `Ctrl + Shift + Y` on Windows/Linux or `Command + Shift + Y` on macOS
- Click-and-drag screen-region selection
- Small Send/Cancel toolbar
- Low-distraction but visibly active selection overlay
- Accurate cropping at browser zoom and high-DPI display scales
- Compact 350 × 440 answer window
- Grok image analysis through the xAI API
- Mock mode for testing without API charges
- Plain-text, short answers designed for quick reading
- Conceptual guidance rather than direct answers when an image clearly shows an active graded or proctored assessment

## Project structure

```text
snipsage-grok-github/
├── extension/          Chrome extension source
├── server/             Node.js backend
├── .gitignore
├── SECURITY.md
├── start-server.bat    Windows helper
└── README.md
```

## Requirements

- Google Chrome desktop
- Node.js 20 or newer
- An xAI API key with access to the configured Grok model

## 1. Configure the backend

Open a terminal in the project folder, then enter:

```bat
cd server
npm install
copy .env.example .env
notepad .env
```

Inside `.env`, replace the placeholder with your own private xAI key:

```env
XAI_API_KEY=your_real_private_key
XAI_MODEL=grok-4.5
PORT=3000
MOCK_MODE=false
```

Do not paste the key into the extension, GitHub, chat messages, screenshots, or source files. The `.gitignore` excludes `server/.env`.

To test without using the API, set:

```env
MOCK_MODE=true
```

## 2. Start the backend

From the `server` folder:

```bat
npm start
```

Successful startup looks like:

```text
SnipSage server listening on http://localhost:3000
Provider: xAI
Model: grok-4.5
```

Keep that terminal window open. On Windows, after setup, you can also double-click `start-server.bat`.

You can verify the backend at:

```text
http://localhost:3000/health
```

## 3. Load the Chrome extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository's `extension` folder.
5. Open a normal webpage.
6. Press `Ctrl + Shift + Y`, drag over a region, and press **Send**.

Chrome blocks extension injection on internal pages such as `chrome://`, the Chrome Web Store, and some built-in viewers.

## Sharing through GitHub

Upload the contents of this folder to the repository root. Do **not** add your local `server/.env` file. Each person cloning the repository should create their own `.env` from `.env.example` and use their own API key.

Basic Git commands:

```bat
git init
git add .
git commit -m "Initial SnipSage prototype"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

A collaborator can then clone it:

```bat
git clone YOUR_GITHUB_REPOSITORY_URL
cd YOUR_REPOSITORY_NAME\server
npm install
copy .env.example .env
```

## Current networking limitation

The extension currently sends requests to:

```text
http://localhost:3000/api/analyze
```

Therefore, by default, each user must run the backend on their own computer. To let multiple remote users share one administrator-run backend, deploy the backend or expose it through a secure public HTTPS endpoint, then update:

- `extension/service-worker.js` → `BACKEND_URL`
- `extension/manifest.json` → `host_permissions`

Before making the server public, add authentication, rate limits, usage quotas, stricter CORS rules, and abuse protection. The current development server should not be openly exposed to the internet.

## Troubleshooting

### `npm` is not recognized

Install Node.js 20 or newer, close Command Prompt, and open a new one. Confirm:

```bat
node -v
npm -v
```

### The server starts and immediately returns to the prompt

Run:

```bat
node --check server.js
node server.js
```

The server is running only while the terminal does not return to the normal command prompt.

### `XAI_API_KEY is missing`

Ensure the file is named exactly `server/.env`, not only `.env.example` or `.env.txt`.

### `Failed to fetch`

Ensure the backend is running on port 3000. If another computer installed the extension, its `localhost` points to that other computer—not yours.

### The shortcut still works after the server is stopped

That is expected. The Chrome extension stays enabled and can display the snipping overlay, but sending will fail until the backend is running. Disable it from `chrome://extensions` when not needed.

## Security and privacy notes

- Screenshots are sent to the configured backend and then to xAI for analysis.
- The prototype does not deliberately save screenshots to disk.
- The backend accepts screenshots in memory and returns model output.
- The current development CORS configuration is permissive.
- Review xAI terms, privacy requirements, Chrome Web Store rules, and applicable assessment policies before distributing or publishing the extension.
