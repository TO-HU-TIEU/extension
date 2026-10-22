/* Local-only learning feedback store. This module records explicit user
 * ratings; comment scanning and automated replies live in comment-automation.js. */
(() => {
  if (globalThis.AssistantLearningFeedback) return;
  const STORAGE_KEY = "learningFeedbackV1";
  const LIMIT = 200;
  const clean = (input = {}) => ({
    id: String(input.id || crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`).slice(0, 100),
    rating: input.rating === "down" ? "down" : "up",
    reply: String(input.reply || "").slice(0, 500),
    sourceId: String(input.sourceId || "").slice(0, 100),
    provider: String(input.provider || "").slice(0, 40),
    reason: String(input.reason || "").slice(0, 500),
    createdAt: new Date().toISOString(),
  });
  const read = async () => {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
  };
  const record = async (input) => {
    const item = clean(input);
    const items = [item, ...(await read()).filter((entry) => entry?.id !== item.id)].slice(
      0,
      LIMIT,
    );
    await chrome.storage.local.set({ [STORAGE_KEY]: items });
    return item;
  };
  const clear = () => chrome.storage.local.remove(STORAGE_KEY);
  globalThis.AssistantLearningFeedback = Object.freeze({ record, read, clear });
  globalThis.addEventListener?.("assistant:learning-feedback", (event) => {
    record(event.detail).catch(() => {});
  });
})();
