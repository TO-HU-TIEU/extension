const normalizeChatIds = (value) =>
  new Set(
    (Array.isArray(value) ? value : []).map((item) => String(item ?? "").trim()).filter(Boolean),
  );

const commandParts = (text) => {
  const tokens = String(text || "")
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
  const command = (tokens.shift() || "").replace(/^\//u, "").split("@")[0].toLowerCase();
  return { command, args: tokens };
};

const formatMetric = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

// Pure Telegram layout builder so status text and controls can be regression-tested.
export function buildTelegramStatusPayload(statuses = []) {
  if (!Array.isArray(statuses) || !statuses.length)
    return {
      text: "🤖 ASSISTANT · TRẠNG THÁI TỰ ĐỘNG\n\nChưa kết nối profile Chrome nào.",
      keyboard: null,
    };
  const lines = ["🤖 ASSISTANT · TRẠNG THÁI TỰ ĐỘNG", ""];
  const keyboard = [[
    { text: "🔄 Làm mới", callback_data: "refresh:all" },
    { text: "♻️ Reload API", callback_data: "reloadapi:all" },
  ]];
  statuses.forEach((item, index) => {
    const state = item.running
      ? item.paused
        ? { icon: "⏸️", text: "TẠM DỪNG" }
        : { icon: "🟢", text: "ĐANG CHẠY" }
      : item.configured
        ? { icon: "🟡", text: "ĐANG DỪNG" }
        : { icon: "⚪", text: "ĐANG TẮT" };
    const identity = [item.accountName, item.accountHandle]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" ");
    lines.push(`${state.icon} ${identity || item.label || "Profile Chrome"}`);
    lines.push(`Trạng thái: ${state.text}${item.configured ? " · ĐÃ BẬT" : ""}`);
    lines.push(`Hiệu suất: ${formatMetric(item.rate).toFixed(2)} trả lời/phút`);
    lines.push(
      `Hoàn thành: ${formatMetric(item.completed)} · Bỏ qua: ${formatMetric(item.skipped)}`,
    );
    lines.push(`Hạn mức ngày: ${formatMetric(item.dailyCount)}/${formatMetric(item.dailyLimit)}`);
    if (!item.running && item.statusReason)
      lines.push(`Lý do: ${String(item.statusReason).replace(/\s+/gu, " ").slice(0, 180)}`);
    const target = String(item.clientId || "").slice(0, 48);
    const primaryAction = item.running ? (item.paused ? "resume" : "pause") : "on";
    const primaryText =
      primaryAction === "pause"
        ? "⏸ Tạm dừng"
        : primaryAction === "resume"
          ? "▶ Tiếp tục"
          : "▶ Bật";
    keyboard.push([
      { text: primaryText, callback_data: `${primaryAction}:${target}` },
      { text: "⏹ Tắt", callback_data: `off:${target}` },
    ]);
    keyboard.push([{ text: "ⓘ Thông tin", callback_data: `info:${target}` }]);
    if (index < statuses.length - 1) lines.push("");
  });
  return { text: lines.join("\n"), keyboard: { inline_keyboard: keyboard } };
}

export function createTelegramControl({
  token = "",
  allowedChatIds = [],
  pairingCode = "",
  pollMs = 2500,
  getStatus,
  enqueueCommand,
  runPowerShellScript,
  registerChat,
}) {
  const botToken = String(token || "").trim();
  const allowed = normalizeChatIds(allowedChatIds);
  let offset = 0;
  let timer;
  let stopped = false;
  const statusMessages = new Map();
  const messageLedger = new Map();

  const rememberMessage = (chatId, messageId) => {
    if (!messageId) return;
    const key = String(chatId);
    const messages = messageLedger.get(key) || new Set();
    messages.add(Number(messageId));
    while (messages.size > 500) messages.delete(messages.values().next().value);
    messageLedger.set(key, messages);
  };

  const api = async (method, body = {}) => {
    if (!botToken) throw new Error("Telegram bot token chưa được cấu hình.");
    const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false)
      throw new Error(data.description || `Telegram HTTP ${response.status}`);
    return data.result;
  };

  const send = async (chatId, text, replyMarkup = null) => {
    const body = { chat_id: chatId, text, disable_web_page_preview: true };
    if (replyMarkup) body.reply_markup = replyMarkup;
    const result = await api("sendMessage", body);
    rememberMessage(chatId, result?.message_id);
    return result;
  };

  const clearChat = async (chatId, triggerMessageId = null) => {
    const key = String(chatId);
    const ids = new Set(messageLedger.get(key) || []);
    const statusMessageId = statusMessages.get(key);
    if (statusMessageId) ids.add(Number(statusMessageId));
    if (triggerMessageId) {
      const currentId = Number(triggerMessageId);
      ids.add(currentId);
      // The Bot API has no chat-history endpoint.  Try the recent message ID
      // window as well so /clear still removes old bot/status messages after
      // a companion restart. Unknown IDs are harmless and ignored by Telegram.
      for (let messageId = Math.max(1, currentId - 100); messageId < currentId; messageId++)
        ids.add(messageId);
    }
    await Promise.all(
      [...ids].map((messageId) =>
        api("deleteMessage", { chat_id: chatId, message_id: messageId }).catch(() => {}),
      ),
    );
    messageLedger.delete(key);
    statusMessages.delete(key);
  };

  const sendStatus = async (chatId, payload, messageId = null) => {
    const chatKey = String(chatId);
    const currentMessageId = messageId || statusMessages.get(chatKey);
    if (currentMessageId) {
      try {
        await api("editMessageText", {
          chat_id: chatId,
          message_id: currentMessageId,
          text: payload.text,
          disable_web_page_preview: true,
          reply_markup: payload.keyboard || undefined,
        });
        statusMessages.set(chatKey, currentMessageId);
        return currentMessageId;
      } catch (error) {
        // Avoid creating duplicate messages when only the metrics are unchanged.
        if (/message is not modified/iu.test(String(error?.message || ""))) return currentMessageId;
      }
    }
    const result = await send(chatId, payload.text, payload.keyboard);
    if (result?.message_id) statusMessages.set(chatKey, result.message_id);
    return result?.message_id || null;
  };

  const authorized = (chatId) => allowed.has(String(chatId));

  const statusPayload = async () => {
    return buildTelegramStatusPayload(await getStatus());
  };

  const statusDetails = async (target) => {
    const item = (await getStatus()).find((value) => String(value.clientId) === String(target));
    if (!item) return "Không tìm thấy profile này.";
    return [
      `ℹ️ ${item.accountName || "Profile Chrome"} ${item.accountHandle || ""}`.trim(),
      `Profile: ${item.label || "Chrome"}`,
      `Client: ${item.clientId}`,
    ].join("\n");
  };

  const handlePowerShellCommand = async (chatId, action) => {
    if (typeof runPowerShellScript !== "function") {
      await send(chatId, "Lệnh PowerShell chưa được cấu hình trên companion.");
      return;
    }
    try {
      const result = await runPowerShellScript(action);
      if (action === "start") {
        await send(
          chatId,
          result?.started
            ? "🖱️ Đã chạy a.ps1 trên máy này."
            : "ℹ️ a.ps1 đang chạy sẵn.",
        );
      } else {
        await send(
          chatId,
          result?.stopped ? "⏹️ Đã dừng a.ps1." : "ℹ️ a.ps1 hiện không chạy.",
        );
      }
    } catch (error) {
      await send(
        chatId,
        `Không chạy được a.ps1: ${String(error?.message || error)
          .replace(/\s+/gu, " ")
          .slice(0, 180)}`,
      );
    }
  };

  const handle = async (update) => {
    const callback = update?.callback_query;
    if (callback) {
      const chatId = callback.message?.chat?.id;
      if (chatId === undefined || !authorized(chatId)) {
        await api("answerCallbackQuery", {
          callback_query_id: callback.id,
          text: "Bot chưa được ghép với chat này.",
        }).catch(() => {});
        return;
      }
      const [action, target = "all"] = String(callback.data || "").split(":");
      await api("answerCallbackQuery", { callback_query_id: callback.id }).catch(() => {});
      if (action === "refresh") {
        const payload = await statusPayload();
        await sendStatus(chatId, payload, callback.message?.message_id);
        return;
      }
      if (action === "info") {
        await send(chatId, await statusDetails(target));
        return;
      }
      if (!["on", "off", "pause", "resume", "reloadapi"].includes(action)) return;
      const enabled = action === "on" || action === "resume";
      const commandId = await enqueueCommand({
        enabled,
        action: action === "reloadapi" ? "reloadApi" : action,
        target,
        chatId: String(chatId),
      });
      if (!commandId) {
        await send(chatId, "Không có profile Chrome đang kết nối để nhận lệnh.");
        return;
      }
      await send(
        chatId,
        `${action === "pause" ? "⏸️ Đã xếp lệnh tạm dừng" : action === "resume" ? "▶️ Đã xếp lệnh tiếp tục" : action === "on" ? "▶️ Đã xếp lệnh bật" : action === "reloadapi" ? "♻️ Đã xếp lệnh reload toàn bộ API" : "⏹️ Đã xếp lệnh tắt"}.`,
      );
      return;
    }
    const message = update?.message;
    const chatId = message?.chat?.id;
    if (chatId === undefined || !message?.text) return;
    const { command, args } = commandParts(message.text);
    if (command === "id") {
      await send(chatId, `Chat ID của bạn: ${chatId}`);
      return;
    }
    if (command === "pair") {
      if (!pairingCode || args[0] !== pairingCode) {
        await send(chatId, "Mã ghép nối không đúng.");
        return;
      }
      await registerChat(String(chatId));
      allowed.add(String(chatId));
      await send(chatId, "Đã ghép bot với Assistant. Dùng /status, /on hoặc /off.");
      return;
    }
    if (!authorized(chatId)) {
      await send(chatId, "Bot chưa được ghép với chat này. Gửi /id để lấy Chat ID.");
      return;
    }
    if (command === "start" || command === "help") {
      await send(
        chatId,
        "/status — xem trạng thái và nút thao tác\n/clear — xoá các tin nhắn bot đã ghi nhận\n/reloadapi — bật lại toàn bộ API key\n/runps1 — chạy script a.ps1 đã cấu hình\n/stopps1 — dừng script a.ps1\n/on — bật cả profile\n/off — tắt cả profile\n/on <clientId> — bật một profile\n/off <clientId> — tắt một profile\nNút ⏸️/▶️ để tạm dừng hoặc tiếp tục, ⏹️ để tắt, ℹ️ để xem thông tin.",
      );
      return;
    }
    if (["runps1", "run-a", "startps1"].includes(command)) {
      await handlePowerShellCommand(chatId, "start");
      return;
    }
    if (["stopps1", "stop-a"].includes(command)) {
      await handlePowerShellCommand(chatId, "stop");
      return;
    }
    if (command === "clear") {
      await clearChat(chatId, message.message_id);
      await send(
        chatId,
        "✅ Đã xoá các tin nhắn bot đã ghi nhận. Gửi /status để tạo trạng thái mới.",
      );
      return;
    }
    if (command === "status") {
      const payload = await statusPayload();
      await sendStatus(chatId, payload);
      return;
    }
    if (["reloadapi", "reload-api", "reload_api"].includes(command)) {
      const commandId = await enqueueCommand({
        enabled: true,
        action: "reloadApi",
        target: "all",
        chatId: String(chatId),
      });
      if (!commandId) {
        await send(chatId, "Không có profile Chrome đang kết nối để reload API.");
        return;
      }
      await send(chatId, `♻️ Đã xếp lệnh reload toàn bộ API. Mã: ${commandId}`);
      return;
    }
    if (command === "on" || command === "off") {
      const enabled = command === "on";
      const target = args[0] || "all";
      const commandId = await enqueueCommand({
        enabled,
        action: command,
        target,
        chatId: String(chatId),
      });
      if (!commandId) {
        await send(chatId, "Không có profile Chrome đang kết nối để nhận lệnh.");
        return;
      }
      await send(
        chatId,
        `${enabled ? "Đã xếp lệnh bật" : "Đã xếp lệnh tắt"} (${target}). Mã: ${commandId}`,
      );
      return;
    }
    await send(chatId, "Lệnh không hợp lệ. Dùng /status, /reloadapi, /on, /off hoặc /help.");
  };

  const poll = async () => {
    if (stopped || !botToken) return;
    try {
      const updates = await api("getUpdates", {
        offset,
        timeout: Math.max(1, Math.min(20, Math.floor(Number(pollMs) / 1000))),
        allowed_updates: ["message", "callback_query"],
      });
      for (const update of updates || []) {
        offset = Math.max(offset, Number(update.update_id || 0) + 1);
        await handle(update).catch(() => {});
      }
    } catch {
      // Telegram being temporarily unavailable must not stop the companion.
    } finally {
      if (!stopped) timer = setTimeout(poll, Math.max(1000, Number(pollMs) || 2500));
    }
  };

  return {
    enabled: Boolean(botToken),
    send,
    refreshStatus: async (chatId) => sendStatus(chatId, await statusPayload()),
    start() {
      if (botToken && !timer) poll();
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}
