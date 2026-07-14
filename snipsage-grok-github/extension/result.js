const requestId = new URLSearchParams(window.location.search).get("id");
const storageKey = requestId ? `snipsage_request_${requestId}` : null;

const loadingState = document.getElementById("loadingState");
const successState = document.getElementById("successState");
const errorState = document.getElementById("errorState");
const answerText = document.getElementById("answerText");
const errorText = document.getElementById("errorText");
const modelLabel = document.getElementById("modelLabel");
const copyButton = document.getElementById("copyButton");
const closeButton = document.getElementById("closeButton");

closeButton.addEventListener("click", () => window.close());
copyButton.addEventListener("click", copyAnswer);

if (!storageKey) {
  renderError("This result window is missing its request identifier.");
} else {
  loadCurrentState();
  chrome.storage.onChanged.addListener(onStorageChanged);
}

async function loadCurrentState() {
  const stored = await chrome.storage.local.get(storageKey);
  render(stored[storageKey]);
}

function onStorageChanged(changes, areaName) {
  if (areaName !== "local" || !storageKey || !changes[storageKey]) {
    return;
  }

  render(changes[storageKey].newValue);
}

function render(value) {
  if (!value || value.status === "loading") {
    showOnly(loadingState);
    copyButton.disabled = true;
    return;
  }

  if (value.status === "success") {
    answerText.textContent = value.answer || "No answer was returned.";
    modelLabel.textContent = value.model ? `Model: ${value.model}` : "";
    showOnly(successState);
    copyButton.disabled = false;
    return;
  }

  renderError(value.error || "An unexpected error occurred.");
}

function renderError(message) {
  errorText.textContent = message;
  showOnly(errorState);
  copyButton.disabled = true;
}

function showOnly(element) {
  loadingState.hidden = element !== loadingState;
  successState.hidden = element !== successState;
  errorState.hidden = element !== errorState;
}

async function copyAnswer() {
  const text = answerText.textContent?.trim();
  if (!text) {
    return;
  }

  await navigator.clipboard.writeText(text);
  const previous = copyButton.textContent;
  copyButton.textContent = "Copied";
  setTimeout(() => {
    copyButton.textContent = previous;
  }, 1200);
}
