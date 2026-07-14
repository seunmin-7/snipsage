(() => {
  if (window.__SNIPSAGE_CONTENT_SCRIPT_LOADED__) {
    return;
  }

  window.__SNIPSAGE_CONTENT_SCRIPT_LOADED__ = true;

  let session = null;

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "START_SNIPPING") {
      startSnipping();
    }
  });

  function startSnipping() {
    cleanup();

    const root = document.createElement("div");
    root.id = "snipsage-root";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Select an area of the page to analyze");

    const dimmer = document.createElement("div");
    dimmer.className = "snipsage-dimmer";

    const selection = document.createElement("div");
    selection.className = "snipsage-selection";
    selection.hidden = true;

    const instruction = document.createElement("div");
    instruction.className = "snipsage-instruction";
    instruction.textContent = "Drag to select · Esc";

    const toolbar = document.createElement("div");
    toolbar.className = "snipsage-toolbar";
    toolbar.hidden = true;

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "snipsage-button snipsage-button-secondary";
    cancelButton.textContent = "×";
    cancelButton.setAttribute("aria-label", "Cancel selection");
    cancelButton.title = "Cancel";

    const sendButton = document.createElement("button");
    sendButton.type = "button";
    sendButton.className = "snipsage-button snipsage-button-primary";
    sendButton.textContent = "Send";

    toolbar.append(cancelButton, sendButton);
    root.append(dimmer, selection, instruction, toolbar);
    document.documentElement.appendChild(root);

    session = {
      root,
      dimmer,
      selection,
      instruction,
      toolbar,
      cancelButton,
      sendButton,
      dragging: false,
      startX: 0,
      startY: 0,
      rect: null,
      sending: false,
      instructionTimer: null
    };

    root.addEventListener("pointerdown", onPointerDown, true);
    root.addEventListener("pointermove", onPointerMove, true);
    root.addEventListener("pointerup", onPointerUp, true);
    root.addEventListener("contextmenu", preventDefault, true);
    cancelButton.addEventListener("click", cleanup);
    sendButton.addEventListener("click", sendSelection);
    document.addEventListener("keydown", onKeyDown, true);

    session.instructionTimer = window.setTimeout(() => {
      if (session?.instruction) {
        session.instruction.hidden = true;
      }
    }, 1400);
  }

  function onPointerDown(event) {
    if (!session || session.sending || event.button !== 0) {
      return;
    }

    if (event.target.closest?.(".snipsage-toolbar")) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    session.dragging = true;
    session.startX = clamp(event.clientX, 0, window.innerWidth);
    session.startY = clamp(event.clientY, 0, window.innerHeight);
    session.rect = null;
    session.toolbar.hidden = true;
    session.selection.hidden = false;
    session.instruction.hidden = true;

    session.root.setPointerCapture?.(event.pointerId);
    updateSelection(session.startX, session.startY, session.startX, session.startY);
  }

  function onPointerMove(event) {
    if (!session?.dragging) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    updateSelection(
      session.startX,
      session.startY,
      clamp(event.clientX, 0, window.innerWidth),
      clamp(event.clientY, 0, window.innerHeight)
    );
  }

  function onPointerUp(event) {
    if (!session?.dragging) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    session.dragging = false;
    session.root.releasePointerCapture?.(event.pointerId);

    const endX = clamp(event.clientX, 0, window.innerWidth);
    const endY = clamp(event.clientY, 0, window.innerHeight);
    const rect = normalizeRect(session.startX, session.startY, endX, endY);

    if (rect.width < 20 || rect.height < 20) {
      session.selection.hidden = true;
      session.instruction.hidden = false;
      session.rect = null;
      return;
    }

    session.rect = rect;
    positionToolbar(rect);
    session.toolbar.hidden = false;
  }

  function updateSelection(startX, startY, endX, endY) {
    if (!session) {
      return;
    }

    const rect = normalizeRect(startX, startY, endX, endY);
    Object.assign(session.selection.style, {
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    });
  }

  function positionToolbar(rect) {
    if (!session) {
      return;
    }

    const toolbarWidth = 92;
    const toolbarHeight = 32;
    const gap = 5;

    let left = rect.x + rect.width - toolbarWidth;
    left = clamp(left, 8, Math.max(8, window.innerWidth - toolbarWidth - 8));

    let top = rect.y + rect.height + gap;
    if (top + toolbarHeight > window.innerHeight - 8) {
      top = rect.y - toolbarHeight - gap;
    }
    top = clamp(top, 8, Math.max(8, window.innerHeight - toolbarHeight - 8));

    Object.assign(session.toolbar.style, {
      left: `${left}px`,
      top: `${top}px`
    });
  }

  async function sendSelection() {
    if (!session?.rect || session.sending) {
      return;
    }

    session.sending = true;
    session.sendButton.disabled = true;
    session.cancelButton.disabled = true;
    session.sendButton.textContent = "Sending…";

    const rect = { ...session.rect };

    // Hide every extension overlay element before Chrome captures the tab.
    session.root.style.visibility = "hidden";
    await nextPaint();
    await nextPaint();

    try {
      const capture = await sendRuntimeMessage({ type: "CAPTURE_VISIBLE_TAB" });
      if (!capture?.ok || !capture.dataUrl) {
        throw new Error(capture?.error || "Could not capture the current tab.");
      }

      const croppedImage = await cropScreenshot(capture.dataUrl, rect);
      cleanup();

      const result = await sendRuntimeMessage({
        type: "ANALYZE_SNIP",
        imageDataUrl: croppedImage
      });

      if (!result?.ok) {
        throw new Error(result?.error || "Could not send the selected image.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      showTransientError(message);
      cleanup();
    }
  }

  async function cropScreenshot(dataUrl, rect) {
    const image = await loadImage(dataUrl);
    const scaleX = image.naturalWidth / window.innerWidth;
    const scaleY = image.naturalHeight / window.innerHeight;

    const sourceX = Math.max(0, Math.round(rect.x * scaleX));
    const sourceY = Math.max(0, Math.round(rect.y * scaleY));
    const sourceWidth = Math.max(
      1,
      Math.min(image.naturalWidth - sourceX, Math.round(rect.width * scaleX))
    );
    const sourceHeight = Math.max(
      1,
      Math.min(image.naturalHeight - sourceY, Math.round(rect.height * scaleY))
    );

    const canvas = document.createElement("canvas");
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      throw new Error("Your browser could not prepare the selected image.");
    }

    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      sourceWidth,
      sourceHeight
    );

    return canvas.toDataURL("image/png");
  }

  function cleanup() {
    document.removeEventListener("keydown", onKeyDown, true);

    if (session?.instructionTimer) {
      window.clearTimeout(session.instructionTimer);
    }

    if (session?.root?.isConnected) {
      session.root.remove();
    }

    session = null;
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cleanup();
    }
  }

  function showTransientError(message) {
    const toast = document.createElement("div");
    toast.className = "snipsage-error-toast";
    toast.textContent = message;
    document.documentElement.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("The captured screenshot could not be read."));
      image.src = source;
    });
  }

  function nextPaint() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  function normalizeRect(startX, startY, endX, endY) {
    return {
      x: Math.min(startX, endX),
      y: Math.min(startY, endY),
      width: Math.abs(endX - startX),
      height: Math.abs(endY - startY)
    };
  }

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
  }

  function preventDefault(event) {
    event.preventDefault();
  }
})();
