const elements = {
  slotList: document.querySelector("#slotList"),
  deleteAfterUse: document.querySelector("#deleteAfterUse"),
  clearData: document.querySelector("#clearData"),
  serverUrl: document.querySelector("#serverUrl"),
  balanceValue: document.querySelector("#balanceValue"),
  balanceNote: document.querySelector("#balanceNote"),
  refreshBalance: document.querySelector("#refreshBalance"),
  saveAll: document.querySelector("#saveAll"),
  pauseResume: document.querySelector("#pauseResume"),
  manageShortcuts: document.querySelector("#manageShortcuts"),
  saveMessage: document.querySelector("#saveMessage"),
  serverStatus: document.querySelector("#serverStatus"),
};

let settings;
let commandMap = new Map();

initialize().catch(showFatalError);

async function initialize() {
  [settings] = await Promise.all([SnapGrok.getSettings(), loadCommands()]);
  elements.deleteAfterUse.checked = settings.deleteAfterUse;
  elements.serverUrl.value = settings.serverUrl;
  renderSlots();
  updatePauseButton();
  bindEvents();
  await Promise.allSettled([refreshHealth(), refreshBalance()]);
}

async function loadCommands() {
  const commands = await chrome.commands.getAll();
  commandMap = new Map(commands.map((command) => [command.name, command.shortcut || "Not assigned"]));
}

function renderSlots() {
  elements.slotList.replaceChildren();
  settings.slots.forEach((slot, index) => {
    const row = document.createElement("article");
    row.className = "slot-row";

    const shortcut = document.createElement("button");
    shortcut.className = "shortcut-button";
    shortcut.type = "button";
    shortcut.textContent = commandMap.get(`run-shortcut-${index + 1}`) || "Not assigned";
    shortcut.title = "Chrome controls extension key bindings. Click to open the shortcut manager.";
    shortcut.addEventListener("click", openShortcutManager);

    const instruction = document.createElement("button");
    instruction.className = "instruction-button";
    instruction.type = "button";
    instruction.innerHTML = `
      <span class="slot-title">${escapeHtml(slot.name || `Shortcut ${index + 1}`)}</span>
      <span class="slot-summary">${escapeHtml(slot.instruction || "Add name & instruction")}</span>
    `;
    instruction.addEventListener("click", () => openEditor("instruction.html", index, 620, 520));

    const output = document.createElement("button");
    output.className = "output-button";
    output.type = "button";
    output.innerHTML = `
      <span class="slot-title">Output window</span>
      <span class="slot-summary">${slot.output.width}×${slot.output.height}px · ≈${slot.output.wordLimit} words · ${slot.output.durationSeconds || "manual"}s</span>
    `;
    output.addEventListener("click", () => openEditor("output-settings.html", index, 540, 520));

    const test = document.createElement("button");
    test.className = "test-button";
    test.type = "button";
    test.textContent = "Test";
    test.title = "Run this shortcut on the visible active tab";
    test.addEventListener("click", async () => {
      await saveMainSettings(false);
      const response = await chrome.runtime.sendMessage({ type: "RUN_SLOT", slotIndex: index });
      if (!response?.ok) showMessage(response?.error || "Unable to run shortcut.", true);
      window.close();
    });

    row.append(shortcut, instruction, output, test);
    elements.slotList.append(row);
  });
}

function bindEvents() {
  elements.saveAll.addEventListener("click", () => saveMainSettings(true));
  elements.refreshBalance.addEventListener("click", refreshBalance);
  elements.clearData.addEventListener("click", clearData);
  elements.manageShortcuts.addEventListener("click", openShortcutManager);
  elements.pauseResume.addEventListener("click", togglePause);

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== "local" || !changes.settings) return;
    settings = SnapGrok.normalizeSettings(changes.settings.newValue);
    elements.deleteAfterUse.checked = settings.deleteAfterUse;
    elements.serverUrl.value = settings.serverUrl;
    renderSlots();
    updatePauseButton();
  });
}

async function saveMainSettings(showConfirmation) {
  settings.deleteAfterUse = elements.deleteAfterUse.checked;
  settings.serverUrl = normalizeServerUrl(elements.serverUrl.value);
  settings = await SnapGrok.saveSettings(settings);
  elements.serverUrl.value = settings.serverUrl;
  if (showConfirmation) showMessage("Settings saved.");
  await Promise.allSettled([refreshHealth(), refreshBalance()]);
}

async function openEditor(file, slotIndex, width, height) {
  await saveMainSettings(false);
  await chrome.windows.create({
    url: chrome.runtime.getURL(`${file}?slot=${slotIndex}`),
    type: "popup",
    width,
    height,
    focused: true,
  });
}

async function openShortcutManager() {
  await chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
}

async function togglePause() {
  const nextPaused = !settings.paused;
  if (nextPaused) {
    await chrome.runtime.sendMessage({ type: "PAUSE_EXTENSION" });
  } else {
    await chrome.runtime.sendMessage({ type: "RESUME_EXTENSION" });
  }
  settings = await SnapGrok.getSettings();
  updatePauseButton();
  showMessage(settings.paused ? "Extension paused." : "Extension resumed.");
}

function updatePauseButton() {
  elements.pauseResume.textContent = settings.paused ? "Resume extension" : "Pause extension";
}

async function refreshHealth() {
  const serverUrl = normalizeServerUrl(elements.serverUrl.value || settings.serverUrl);
  try {
    const response = await fetch(`${serverUrl}/api/health`);
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || "Server unavailable.");
    elements.serverStatus.textContent = payload.mockMode
      ? "Server connected · mock mode"
      : `Server connected · ${payload.model}`;
    elements.serverStatus.className = "status-pill good";
  } catch {
    elements.serverStatus.textContent = "Server offline";
    elements.serverStatus.className = "status-pill bad";
  }
}

async function refreshBalance() {
  elements.balanceValue.textContent = "Loading…";
  elements.balanceNote.textContent = "";
  const serverUrl = normalizeServerUrl(elements.serverUrl.value || settings.serverUrl);

  try {
    const response = await fetch(`${serverUrl}/api/balance`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Balance request failed.");

    if (!payload.configured) {
      elements.balanceValue.textContent = "Not configured";
      elements.balanceNote.textContent = payload.message || "Add the Management API settings to server/.env.";
      return;
    }

    elements.balanceValue.textContent = `$${Number(payload.creditUsd).toFixed(2)} prepaid credit`;
    elements.balanceNote.textContent = payload.estimatedOutputTokens
      ? `≈ ${Number(payload.estimatedOutputTokens).toLocaleString()} output tokens at $${payload.estimateBasisUsdPerMillionOutputTokens}/1M; input and image costs are excluded.`
      : "Exact credit shown. Token equivalent is omitted because model prices differ.";
  } catch (error) {
    elements.balanceValue.textContent = "Unavailable";
    elements.balanceNote.textContent = error.message;
  }
}

async function clearData() {
  const confirmed = confirm("Delete every screenshot, response, and metadata file retained by the local server?");
  if (!confirmed) return;

  await saveMainSettings(false);
  try {
    const response = await fetch(`${settings.serverUrl}/api/data`, { method: "DELETE" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Delete request failed.");
    showMessage(`Deleted ${payload.deletedFiles} retained file(s).`);
  } catch (error) {
    showMessage(error.message, true);
  }
}

function normalizeServerUrl(value) {
  const trimmed = String(value || "").trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(trimmed)) throw new Error("Backend URL must begin with http:// or https://");
  return trimmed;
}

function showMessage(message, isError = false) {
  elements.saveMessage.textContent = message;
  elements.saveMessage.style.color = isError ? "#9f2020" : "#1f6a2b";
  setTimeout(() => {
    if (elements.saveMessage.textContent === message) elements.saveMessage.textContent = "";
  }, 3500);
}

function showFatalError(error) {
  console.error(error);
  elements.slotList.textContent = error.message || "Unable to initialize extension.";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
