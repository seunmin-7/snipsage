const slotIndex = Number(SnapGrok.queryParameter("slot"));
const nameInput = document.querySelector("#shortcutName");
const instructionInput = document.querySelector("#instruction");
const message = document.querySelector("#message");

initialize().catch((error) => {
  message.textContent = error.message;
});

async function initialize() {
  const settings = await SnapGrok.getSettings();
  const slot = settings.slots[slotIndex];
  if (!slot) throw new Error("Invalid shortcut slot.");
  nameInput.value = slot.name;
  instructionInput.value = slot.instruction;
}

document.querySelector("#cancel").addEventListener("click", () => window.close());
document.querySelector("#save").addEventListener("click", async () => {
  const name = nameInput.value.trim();
  const instruction = instructionInput.value.trim();
  if (!name) return show("Add a shortcut name.", true);
  if (!instruction) return show("Add an instruction.", true);

  await SnapGrok.updateSettings((settings) => {
    settings.slots[slotIndex].name = name;
    settings.slots[slotIndex].instruction = instruction;
    return settings;
  });
  show("Saved.");
  setTimeout(() => window.close(), 350);
});

function show(text, error = false) {
  message.textContent = text;
  message.style.color = error ? "#9f2020" : "#276a31";
}
