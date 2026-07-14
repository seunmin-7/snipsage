importScripts("shared.js");

const COMMAND_TO_SLOT = {
  "run-shortcut-1": 0,
  "run-shortcut-2": 1,
  "run-shortcut-3": 2,
  "run-shortcut-4": 3,
};

chrome.runtime.onInstalled.addListener(async () => {
  await SnapGrok.getSettings();
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "pause-extension") {
    pauseExtension().catch(console.error);
    return;
  }

  const slotIndex = COMMAND_TO_SLOT[command];
  if (slotIndex !== undefined) processShortcut(slotIndex).catch(handleUnexpectedError);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "PAUSE_EXTENSION") {
    pauseExtension()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "RESUME_EXTENSION") {
    SnapGrok.updateSettings((settings) => {
      settings.paused = false;
      return settings;
    })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "RUN_SLOT" && Number.isInteger(message.slotIndex)) {
    processShortcut(message.slotIndex)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

async function notify(title, message) {
  try {
    await chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title,
      message,
      priority: 0,
    });
  } catch {
    // Notifications are helpful but not required for the core workflow.
  }
}

async function handleUnexpectedError(error) {
  console.error(error);
  await notify("SnapGrok error", error.message || "Unexpected error.");
}

async function pauseExtension() {
  await SnapGrok.updateSettings((settings) => {
    settings.paused = true;
    return settings;
  });

  const windows = await chrome.windows.getAll({ populate: true });
  const ownOutputPrefix = chrome.runtime.getURL("output.html");
  await Promise.all(
    windows
      .filter((window) => window.tabs?.some((tab) => tab.url?.startsWith(ownOutputPrefix)))
      .map((window) => chrome.windows.remove(window.id).catch(() => {})),
  );
  await notify("SnapGrok paused", "Click the extension icon and press Resume to use shortcuts again.");
}

async function processShortcut(slotIndex) {
  const settings = await SnapGrok.getSettings();
  if (settings.paused) {
    await notify("SnapGrok is paused", "Open the extension settings and press Resume.");
    return;
  }

  const slot = settings.slots[slotIndex];
  if (!slot) throw new Error("Shortcut configuration not found.");
  if (!slot.instruction.trim()) {
    await notify("Instruction missing", `Add an instruction for shortcut ${slotIndex + 1}.`);
    return;
  }

  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!activeTab?.windowId) throw new Error("No active Chrome tab was found.");

  const imageDataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, {
    format: "jpeg",
    quality: 86,
  });

  const jobId = crypto.randomUUID();
  const jobKey = `job:${jobId}`;
  const wordLimit = SnapGrok.estimateWordLimit(slot.output.width, slot.output.height);
  const job = {
    id: jobId,
    status: "loading",
    title: slot.name || `Shortcut ${slotIndex + 1}`,
    text: "Analyzing screenshot…",
    createdAt: Date.now(),
    durationSeconds: slot.output.durationSeconds,
    wordLimit,
    model: null,
    usage: null,
  };
  await chrome.storage.session.set({ [jobKey]: job });

  const sourceWindow = await chrome.windows.get(activeTab.windowId).catch(() => null);
  const width = SnapGrok.clampNumber(slot.output.width, 280, 1200, 520);
  const height = SnapGrok.clampNumber(slot.output.height, 180, 900, 360);
  const left = sourceWindow?.left != null && sourceWindow?.width != null
    ? Math.max(sourceWindow.left + sourceWindow.width - width - 18, 0)
    : undefined;
  const top = sourceWindow?.top != null ? Math.max(sourceWindow.top + 18, 0) : undefined;

  const outputWindow = await chrome.windows.create({
    url: chrome.runtime.getURL(`output.html?jobId=${encodeURIComponent(jobId)}`),
    type: "popup",
    width,
    height,
    left,
    top,
    focused: false,
  });

  if (outputWindow?.id) {
    job.windowId = outputWindow.id;
    await chrome.storage.session.set({ [jobKey]: job });
  }

  try {
    const response = await fetch(`${settings.serverUrl.replace(/\/$/, "")}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageDataUrl,
        shortcutName: slot.name,
        instruction: slot.instruction,
        maxWords: wordLimit,
        deleteAfterUse: settings.deleteAfterUse,
        sourceUrl: activeTab.url || null,
        sourceTitle: activeTab.title || null,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Backend returned HTTP ${response.status}.`);

    await chrome.storage.session.set({
      [jobKey]: {
        ...job,
        status: "complete",
        text: payload.text || "No response text was returned.",
        completedAt: Date.now(),
        model: payload.model || null,
        usage: payload.usage || null,
        storedCaseId: payload.storedCaseId || null,
      },
    });
  } catch (error) {
    await chrome.storage.session.set({
      [jobKey]: {
        ...job,
        status: "error",
        text: error.message || "Unknown request error.",
        completedAt: Date.now(),
      },
    });
  }
}
