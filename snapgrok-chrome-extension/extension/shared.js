(() => {
  const DEFAULT_SETTINGS = {
    version: 1,
    serverUrl: "http://127.0.0.1:8787",
    deleteAfterUse: true,
    paused: false,
    slots: [
      {
        name: "Shortcut A",
        instruction: "Describe what is visible and answer the main question concisely.",
        output: { width: 520, height: 360, durationSeconds: 20, wordLimit: 220 },
      },
      {
        name: "Shortcut B",
        instruction: "Solve the problem shown. Explain the essential reasoning and provide the final answer.",
        output: { width: 600, height: 440, durationSeconds: 30, wordLimit: 330 },
      },
      {
        name: "Shortcut C",
        instruction: "Extract the important claims, methods, results, and limitations from the visible paper page.",
        output: { width: 680, height: 520, durationSeconds: 45, wordLimit: 450 },
      },
      {
        name: "Shortcut D",
        instruction: "Follow the task shown in the screenshot and return a structured, practical response.",
        output: { width: 760, height: 580, durationSeconds: 60, wordLimit: 560 },
      },
    ],
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeSettings(value) {
    const incoming = value && typeof value === "object" ? value : {};
    const normalized = clone(DEFAULT_SETTINGS);
    normalized.serverUrl = incoming.serverUrl || normalized.serverUrl;
    normalized.deleteAfterUse =
      typeof incoming.deleteAfterUse === "boolean" ? incoming.deleteAfterUse : normalized.deleteAfterUse;
    normalized.paused = typeof incoming.paused === "boolean" ? incoming.paused : normalized.paused;

    if (Array.isArray(incoming.slots)) {
      normalized.slots = normalized.slots.map((slot, index) => {
        const supplied = incoming.slots[index] || {};
        const output = supplied.output || {};
        const width = clampNumber(output.width, 280, 1200, slot.output.width);
        const height = clampNumber(output.height, 180, 900, slot.output.height);
        return {
          name: typeof supplied.name === "string" ? supplied.name : slot.name,
          instruction:
            typeof supplied.instruction === "string" ? supplied.instruction : slot.instruction,
          output: {
            width,
            height,
            durationSeconds: clampNumber(
              output.durationSeconds,
              0,
              600,
              slot.output.durationSeconds,
            ),
            wordLimit: clampNumber(
              output.wordLimit,
              20,
              2000,
              estimateWordLimit(width, height),
            ),
          },
        };
      });
    }

    return normalized;
  }

  function clampNumber(value, minimum, maximum, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(Math.max(Math.round(number), minimum), maximum);
  }

  function estimateWordLimit(width, height) {
    const safeWidth = clampNumber(width, 280, 1200, 520);
    const safeHeight = clampNumber(height, 180, 900, 360);
    const usableWidth = Math.max(safeWidth - 36, 100);
    const usableHeight = Math.max(safeHeight - 78, 80);
    const fontSizePx = (10 * 96) / 72;
    const lineHeightPx = fontSizePx * 1.28;
    const averageWordAndSpaceWidthPx = fontSizePx * 3.05;
    const wordsPerLine = Math.max(Math.floor(usableWidth / averageWordAndSpaceWidthPx), 3);
    const lines = Math.max(Math.floor(usableHeight / lineHeightPx), 3);
    return clampNumber(wordsPerLine * lines, 20, 2000, 150);
  }

  async function getSettings() {
    const stored = await chrome.storage.local.get("settings");
    const normalized = normalizeSettings(stored.settings);
    if (JSON.stringify(stored.settings || {}) !== JSON.stringify(normalized)) {
      await chrome.storage.local.set({ settings: normalized });
    }
    return normalized;
  }

  async function saveSettings(settings) {
    const normalized = normalizeSettings(settings);
    await chrome.storage.local.set({ settings: normalized });
    return normalized;
  }

  async function updateSettings(mutator) {
    const settings = await getSettings();
    const updated = await mutator(settings) || settings;
    return saveSettings(updated);
  }

  function queryParameter(name) {
    return new URLSearchParams(location.search).get(name);
  }

  self.SnapGrok = {
    DEFAULT_SETTINGS,
    normalizeSettings,
    estimateWordLimit,
    clampNumber,
    getSettings,
    saveSettings,
    updateSettings,
    queryParameter,
  };
})();
