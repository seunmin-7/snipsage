window.addEventListener(
  "keydown",
  (event) => {
    const isPauseShortcut =
      event.ctrlKey && event.shiftKey && !event.altKey && event.code === "KeyZ";
    if (!isPauseShortcut) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    chrome.runtime.sendMessage({ type: "PAUSE_EXTENSION" }).catch(() => {});
  },
  true,
);
