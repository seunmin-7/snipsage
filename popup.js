const startButton = document.getElementById("startButton");
const message = document.getElementById("message");

startButton.addEventListener("click", async () => {
  message.textContent = "";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    message.textContent = "No active tab was found.";
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
    window.close();
  } catch {
    message.textContent = "Chrome does not allow snipping on this page.";
  }
});
