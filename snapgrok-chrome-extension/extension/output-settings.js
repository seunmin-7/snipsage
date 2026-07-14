const slotIndex = Number(SnapGrok.queryParameter("slot"));
const widthInput = document.querySelector("#width");
const heightInput = document.querySelector("#height");
const durationInput = document.querySelector("#duration");
const wordLimitLabel = document.querySelector("#wordLimit");
const message = document.querySelector("#message");

initialize().catch((error) => show(error.message, true));

async function initialize() {
  const settings = await SnapGrok.getSettings();
  const slot = settings.slots[slotIndex];
  if (!slot) throw new Error("Invalid shortcut slot.");
  widthInput.value = slot.output.width;
  heightInput.value = slot.output.height;
  durationInput.value = slot.output.durationSeconds;
  recalculate();
}

for (const input of [widthInput, heightInput]) input.addEventListener("input", recalculate);
document.querySelector("#cancel").addEventListener("click", () => window.close());
document.querySelector("#save").addEventListener("click", save);

function recalculate() {
  const wordLimit = SnapGrok.estimateWordLimit(widthInput.value, heightInput.value);
  wordLimitLabel.textContent = `≈ ${wordLimit.toLocaleString()} words`;
  return wordLimit;
}

async function save() {
  const width = SnapGrok.clampNumber(widthInput.value, 280, 1200, 520);
  const height = SnapGrok.clampNumber(heightInput.value, 180, 900, 360);
  const durationSeconds = SnapGrok.clampNumber(durationInput.value, 0, 600, 20);
  const wordLimit = SnapGrok.estimateWordLimit(width, height);

  await SnapGrok.updateSettings((settings) => {
    settings.slots[slotIndex].output = { width, height, durationSeconds, wordLimit };
    return settings;
  });
  show("Saved.");
  setTimeout(() => window.close(), 350);
}

function show(text, error = false) {
  message.textContent = text;
  message.style.color = error ? "#9f2020" : "#276a31";
}
