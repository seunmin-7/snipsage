const jobId = SnapGrok.queryParameter("jobId");
const jobKey = `job:${jobId}`;
const title = document.querySelector("#title");
const status = document.querySelector("#status");
const responseElement = document.querySelector("#response");
const metadata = document.querySelector("#metadata");
const copyButton = document.querySelector("#copy");
let closeTimer = null;
let currentText = "";

initialize().catch((error) => render({ status: "error", title: "SnapGrok", text: error.message }));

async function initialize() {
  if (!jobId) throw new Error("Missing response job ID.");
  const stored = await chrome.storage.session.get(jobKey);
  render(stored[jobKey] || { status: "loading", title: "SnapGrok", text: "Waiting for job…" });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "session" && changes[jobKey]?.newValue) render(changes[jobKey].newValue);
  });
}

function render(job) {
  title.textContent = job.title || "SnapGrok";
  currentText = job.text || "";
  responseElement.textContent = currentText;
  responseElement.className = job.status === "error" ? "error" : job.status === "loading" ? "loading" : "";

  if (job.status === "loading") {
    status.textContent = `Analyzing · limit ${job.wordLimit || "—"} words`;
    metadata.textContent = "The screenshot is being processed by the local backend.";
    return;
  }

  if (job.status === "error") {
    status.textContent = "Request failed";
    metadata.textContent = "Check that the local server is running and server/.env contains a valid API key.";
  } else {
    status.textContent = "Complete";
    const usage = job.usage || {};
    const usageText = usage.total_tokens ? ` · ${usage.total_tokens.toLocaleString()} API tokens used` : "";
    const retentionText = job.storedCaseId ? " · retained locally" : " · not retained locally";
    metadata.textContent = `${job.model || "Grok"}${usageText}${retentionText}`;
  }

  if (closeTimer) clearTimeout(closeTimer);
  if (Number(job.durationSeconds) > 0) {
    closeTimer = setTimeout(() => window.close(), Number(job.durationSeconds) * 1000);
  }
}

copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(currentText);
  copyButton.textContent = "Copied";
  setTimeout(() => (copyButton.textContent = "Copy"), 1000);
});

window.addEventListener("beforeunload", () => {
  chrome.storage.session.remove(jobKey).catch(() => {});
});
