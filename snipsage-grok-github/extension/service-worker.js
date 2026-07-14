const BACKEND_URL = "http://localhost:3000/api/analyze";

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "start-snipping") {
    await startSnippingInActiveTab();
  }
});

chrome.action.onClicked?.addListener(async () => {
  await startSnippingInActiveTab();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "CAPTURE_VISIBLE_TAB") {
    captureVisibleTab(sender)
      .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
      .catch((error) => sendResponse({ ok: false, error: normalizeError(error) }));
    return true;
  }

  if (message?.type === "ANALYZE_SNIP") {
    analyzeSnip(message.imageDataUrl)
      .then((result) => sendResponse({ ok: true, requestId: result.requestId }))
      .catch((error) => sendResponse({ ok: false, error: normalizeError(error) }));
    return true;
  }

  return false;
});

async function startSnippingInActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    return;
  }

  try {
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["content-script.css"]
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content-script.js"]
    });

    await chrome.tabs.sendMessage(tab.id, { type: "START_SNIPPING" });
  } catch (error) {
    await showExtensionError(
      "Snipping is unavailable on this page. Chrome blocks extensions on internal pages such as chrome:// and the Chrome Web Store."
    );
    console.error("Unable to start snipping:", error);
  }
}

async function captureVisibleTab(sender) {
  const windowId = sender?.tab?.windowId;

  if (typeof windowId !== "number") {
    throw new Error("Could not identify the active browser window.");
  }

  return chrome.tabs.captureVisibleTab(windowId, {
    format: "png"
  });
}

async function analyzeSnip(imageDataUrl) {
  validateImageDataUrl(imageDataUrl);

  const requestId = crypto.randomUUID();
  const storageKey = requestStorageKey(requestId);

  await chrome.storage.local.set({
    [storageKey]: {
      status: "loading",
      createdAt: Date.now()
    }
  });

  await openResultWindow(requestId);

  void sendToBackend({ requestId, storageKey, imageDataUrl });

  return { requestId };
}

async function sendToBackend({ requestId, storageKey, imageDataUrl }) {
  try {
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ imageDataUrl })
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw new Error(payload?.error || `Backend returned HTTP ${response.status}.`);
    }

    if (typeof payload?.answer !== "string" || !payload.answer.trim()) {
      throw new Error("The model returned an empty answer.");
    }

    await chrome.storage.local.set({
      [storageKey]: {
        status: "success",
        answer: payload.answer.trim(),
        model: payload.model || null,
        completedAt: Date.now()
      }
    });
  } catch (error) {
    await chrome.storage.local.set({
      [storageKey]: {
        status: "error",
        error: normalizeError(error),
        completedAt: Date.now()
      }
    });
  }

  // Keep the latest few results available long enough for their windows to load.
  await cleanupOldRequests(requestId);
}

async function openResultWindow(requestId) {
  const url = chrome.runtime.getURL(`result.html?id=${encodeURIComponent(requestId)}`);

  await chrome.windows.create({
    url,
    type: "popup",
    width: 350,
    height: 440,
    focused: true
  });
}

async function showExtensionError(message) {
  const requestId = crypto.randomUUID();
  const storageKey = requestStorageKey(requestId);

  await chrome.storage.local.set({
    [storageKey]: {
      status: "error",
      error: message,
      completedAt: Date.now()
    }
  });

  await openResultWindow(requestId);
}

async function cleanupOldRequests(currentRequestId) {
  const all = await chrome.storage.local.get(null);
  const entries = Object.entries(all)
    .filter(([key]) => key.startsWith("snipsage_request_"))
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => {
      const aTime = a.value?.completedAt || a.value?.createdAt || 0;
      const bTime = b.value?.completedAt || b.value?.createdAt || 0;
      return bTime - aTime;
    });

  const removable = entries
    .filter(({ key }) => key !== requestStorageKey(currentRequestId))
    .slice(8);

  if (removable.length > 0) {
    await chrome.storage.local.remove(removable.map(({ key }) => key));
  }
}

function requestStorageKey(requestId) {
  return `snipsage_request_${requestId}`;
}

function validateImageDataUrl(value) {
  if (typeof value !== "string") {
    throw new Error("The selected image was missing.");
  }

  if (!/^data:image\/(png|jpeg|webp);base64,/i.test(value)) {
    throw new Error("The selected image format is not supported.");
  }

  // Approximate 10 MB client-side limit for the prototype.
  if (value.length > 14_000_000) {
    throw new Error("The selected image is too large. Select a smaller region.");
  }
}

function normalizeError(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "An unexpected error occurred.";
}
