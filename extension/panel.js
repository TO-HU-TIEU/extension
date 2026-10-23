const $ = (id) => document.getElementById(id);
let post = null,
  result = null,
  reading = false,
  replyHistory = [];
const applyAiIconMask = (globalThis.applyAiIconMask = (root) => {
  const markup = globalThis.AssistantIcons?.svg?.("generate");
  if (!markup) return;
  root.querySelectorAll(".ai-icon").forEach((icon) => {
    if (!icon.querySelector(".ui-icon-generate")) icon.innerHTML = markup;
    icon.style.backgroundColor = "transparent";
    icon.style.backgroundImage = "none";
    icon.style.webkitMaskImage = "none";
    icon.style.maskImage = "none";
    icon.style.opacity = "1";
  });
});
const discreet = (text) =>
  String(text || "")
    .replace(/X Reply Assistant|Reply Assistant/gi, "Assistant")
    .replace(/trên X/gi, "trên trang")
    .replace(/bài X/gi, "bài viết")
    .replace(/trang X/gi, "trang hiện tại")
    .replace(/permalink X/gi, "liên kết chi tiết");
const DROPDOWN_SVG =
    '<svg class="dropdown-icon-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M12.7071 14.7071C12.3166 15.0976 11.6834 15.0976 11.2929 14.7071L6.29289 9.70711C5.90237 9.31658 5.90237 8.68342 6.29289 8.29289C6.68342 7.90237 7.31658 7.90237 7.70711 8.29289L12 12.5858L16.2929 8.29289C16.6834 7.90237 17.3166 7.90237 17.7071 8.29289C18.0976 8.68342 18.0976 9.31658 17.7071 9.70711L12.7071 14.7071Z" fill="currentColor"/></svg>',
  ICON = {
    refresh: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v6h-6"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="10" height="10" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>',
    setting:
      '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5"/><path d="M13.7654 2.15224C13.3978 2 12.9319 2 12 2C11.0681 2 10.6022 2 10.2346 2.15224C9.74457 2.35523 9.35522 2.74458 9.15223 3.23463C9.05957 3.45834 9.0233 3.7185 9.00911 4.09799C8.98826 4.65568 8.70226 5.17189 8.21894 5.45093C7.73564 5.72996 7.14559 5.71954 6.65219 5.45876C6.31645 5.2813 6.07301 5.18262 5.83294 5.15102C5.30704 5.08178 4.77518 5.22429 4.35436 5.5472C4.03874 5.78938 3.80577 6.1929 3.33983 6.99993C2.87389 7.80697 2.64092 8.21048 2.58899 8.60491C2.51976 9.1308 2.66227 9.66266 2.98518 10.0835C3.13256 10.2756 3.3397 10.437 3.66119 10.639C4.1338 10.936 4.43789 11.4419 4.43786 12C4.43783 12.5581 4.13375 13.0639 3.66118 13.3608C3.33965 13.5629 3.13248 13.7244 2.98508 13.9165C2.66217 14.3373 2.51966 14.8691 2.5889 15.395C2.64082 15.7894 2.87379 16.193 3.33973 17C3.80568 17.807 4.03865 18.2106 4.35426 18.4527C4.77508 18.7756 5.30694 18.9181 5.83284 18.8489C6.07289 18.8173 6.31632 18.7186 6.65204 18.5412C7.14547 18.2804 7.73556 18.27 8.2189 18.549C8.70224 18.8281 8.98826 19.3443 9.00911 19.9021C9.02331 20.2815 9.05957 20.5417 9.15223 20.7654C9.35522 21.2554 9.74457 21.6448 10.2346 21.8478C10.6022 22 11.0681 22 12 22C12.9319 22 13.3978 22 13.7654 21.8478C14.2554 21.6448 14.6448 21.2554 14.8477 20.7654C14.9404 20.5417 14.9767 20.2815 14.9909 19.902C15.0117 19.3443 15.2977 18.8281 15.781 18.549C16.2643 18.2699 16.8544 18.2804 17.3479 18.5412C17.6836 18.7186 17.927 18.8172 18.167 18.8488C18.6929 18.9181 19.2248 18.7756 19.6456 18.4527C19.9612 18.2105 20.1942 17.807 20.6601 16.9999C21.1261 16.1929 21.3591 15.7894 21.411 15.395C21.4802 14.8691 21.3377 14.3372 21.0148 13.9164C20.8674 13.7243 20.6602 13.5628 20.3387 13.3608C19.8662 13.0639 19.5621 12.558 19.5621 11.9999C19.5621 11.4418 19.8662 10.9361 20.3387 10.6392C20.6603 10.4371 20.8675 10.2757 21.0149 10.0835C21.3378 9.66273 21.4803 9.13087 21.4111 8.60497C21.3592 8.21055 21.1262 7.80703 20.6602 7C20.1943 6.19297 19.9613 5.78945 19.6457 5.54727C19.2249 5.22436 18.693 5.08185 18.1671 5.15109C17.9271 5.18269 17.6837 5.28136 17.3479 5.4588C16.8545 5.71959 16.2644 5.73002 15.7811 5.45096C15.2977 5.17191 15.0117 4.65566 14.9909 4.09794C14.9767 3.71848 14.9404 3.45833 14.8477 3.23463C14.6448 2.74458 14.2554 2.35523 13.7654 2.15224Z" stroke="currentColor" stroke-width="1.5"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5 5 19"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="m4 20 4-1 11-11-3-3L5 16l-1 4Z"/></svg>',
    arrow: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    trash:
      '<svg viewBox="0 0 1024 1024"><path fill="currentColor" d="M160 256H96a32 32 0 0 1 0-64h256V95.936a32 32 0 0 1 32-32h256a32 32 0 0 1 32 32V192h256a32 32 0 1 1 0 64h-64v672a32 32 0 0 1-32 32H192a32 32 0 0 1-32-32V256zm448-64v-64H416v64h192zM224 896h576V256H224v640zm192-128a32 32 0 0 1-32-32V416a32 32 0 0 1 64 0v320a32 32 0 0 1-32 32zm192 0a32 32 0 0 1-32-32V416a32 32 0 0 1 64 0v320a32 32 0 0 1-32 32z"/></svg>',
  };
Object.assign(
  ICON,
  Object.fromEntries(
    [
      "reply",
      "post",
      "quote",
      "flash",
      "assistant",
      "plus",
      "refresh",
      "source",
      "copy",
      "remove",
      "clear-list",
      "follow",
      "sort",
      "help",
      "more",
      "setting",
      "up",
      "get",
      "save",
      "cancel",
      "chatgpt",
      "gemini",
      "openai",
      "deepseek",
      "delete",
      "trash",
    ].map((name) => [name, globalThis.AssistantIcons?.svg(name) || ""]),
  ),
);
Object.assign(ICON, {
  close: ICON.close || ICON.remove,
  edit: ICON.post,
  arrow: ICON.source,
  delete:
    ICON.delete ||
    '<svg viewBox="0 0 48 48" fill="none"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="4" d="M14 11L4 24l10 13h30V11zm7 8l10 10m0-10L21 29"/></svg>',
  trash: ICON.trash,
});
const CORE_PRESET_RULES =
  "Bám sát đúng bài đang trả lời và media đã quan sát được. Không bịa người, vật, hành động, quan hệ, cảm xúc hay trải nghiệm cá nhân. Phân biệt sự việc có thật với câu đùa, ví von, giả định, nỗi lo và kiểu nói “tưởng như”; không biến phép so sánh thành sự kiện đã xảy ra. Không bê lại hoặc diễn đạt lại gần nguyên nội dung chỉ để hùa theo; mỗi câu phải có phản ứng, nhận xét, câu hỏi hoặc góc nhìn cụ thể nhưng không suy diễn. Không cảm ơn thay người khác, không gọi sai đối tượng, không đoán giới tính hay vai vế. Nếu media là ảnh chụp profile/trang cá nhân/danh sách tài khoản, không nhận xét avatar, banner, độ ngầu/chất, ngoại hình hay chi tiết trang trí khi chúng không phải trọng tâm. Nếu bài có ảnh/video, ưu tiên chi tiết media đã xác minh; không chắc thì nói trung tính. Viết đúng ngôn ngữ gốc, tự nhiên như người thật, viết hoa đầu câu/tên riêng/thuật ngữ đúng chính tả khi cần, không ép toàn bộ câu thành chữ thường, không giọng bot, không hashtag, không sáo rỗng, không tư vấn nguy hiểm. Độ dài thay đổi tự nhiên, thường 10–25 từ, tối đa 180 ký tự. Emoji hoặc emoticon tối đa một và chỉ dùng khi thật sự hợp; mặc định không dùng, không trang trí câu bằng biểu tượng. Không lặp cùng một kiểu ký hiệu trong nhiều gợi ý của cùng bài.";
const DEFAULT_STYLES = [
  {
    id: "natural",
    name: "Mặc định",
    prompt: `${CORE_PRESET_RULES} Văn phong giới trẻ Việt đời thường, gọn và có duyên; teencode nhẹ vừa đủ. Có thể dùng kkk, :v, :)), =)), bro hoặc ae rất thỉnh thoảng khi thật sự hợp ngữ cảnh; tuyệt đối không lạm dụng, không dùng như thói quen và phần lớn câu không cần. Ưu tiên cách nói tự nhiên, tránh cố tỏ ra trẻ hoặc lạm dụng tiếng lóng.`,
  },
  {
    id: "serious",
    name: "Trang trọng",
    prompt: `${CORE_PRESET_RULES} Văn phong điềm tĩnh, rõ ý, lịch sự và đi thẳng trọng tâm. Với chủ đề nghiêm túc, nhạy cảm hoặc buồn, không đùa và không dùng tiếng lóng. Nêu nhận định có căn cứ, tránh lên lớp hoặc phán xét.`,
  },
  {
    id: "witty",
    name: "Hóm hỉnh",
    prompt: `${CORE_PRESET_RULES} Hóm hỉnh bằng một quan sát đúng trọng tâm hoặc cách nói có duyên. Châm biếm nhẹ vào tình huống, không công kích cá nhân, không bóp méo sự kiện để tạo punchline và không cố pha trò với nội dung nghiêm túc.`,
  },
  {
    id: "insight",
    name: "Phân tích",
    prompt: `${CORE_PRESET_RULES} Thêm một góc nhìn cụ thể và có ích dựa trên chi tiết của bài. Có thể chỉ ra nguyên nhân, hệ quả hoặc một câu hỏi đáng nghĩ nhưng không suy đoán quá dữ kiện, không giảng giải dài và không khen chung chung.`,
  },
  {
    id: "cultivation",
    name: "Tiên hiệp",
    prompt: `${CORE_PRESET_RULES} Dùng văn phong tiên hiệp đậm đà nhưng vẫn đúng nội dung: có thể xưng đạo hữu, tại hạ, các hạ khi hợp vai; ví von bằng linh thạch, linh khí, tu vi, cảnh giới, cơ duyên, bí cảnh, pháp bảo, luyện đan, độ kiếp, phi thăng hoặc thiên đạo. Câu có khí chất giang hồ tu tiên và dí dỏm, nhưng không nhồi thuật ngữ, không để lối ví von làm sai sự việc.`,
  },
];
let styles = [],
  editingCustom = false,
  editingStyleId = null,
  styleDraftMode = false,
  currentProvider = "gemini",
  connected = false,
  geminiPrimaryKey = "",
  geminiPrimaryKeyLabel = "",
  geminiStoredKeys = [];
const PRESET_SOURCE =
  "https://raw.githubusercontent.com/TO-HU-TIEU/configs/main/presets/reply-styles.json";
function validRemotePresets(value) {
  return (
    value &&
    Number.isInteger(value.version) &&
    Array.isArray(value.styles) &&
    value.styles.length > 0 &&
    value.styles.length <= 30 &&
    value.styles.every(
      (s) =>
        s &&
        /^[a-z0-9-]{1,50}$/.test(s.id) &&
        typeof s.name === "string" &&
        s.name.trim().length <= 80 &&
        typeof s.prompt === "string" &&
        s.prompt.trim().length >= 100 &&
        s.prompt.length <= 6000,
    )
  );
}
async function loadDefaultStyles() {
  await globalThis.RemoteConfig.ready;
  await globalThis.RemoteConfig.refresh();
  const presets = globalThis.RemoteConfig.get("styles");
  return (validRemotePresets(presets) ? presets.styles : DEFAULT_STYLES).map((s) => ({
    ...s,
    name: ReplyPreferences.label(s),
  }));
}
function status(text, error = false) {
  $("status").textContent = discreet(text);
  $("status").classList.toggle("error", error);
}
async function safely(fn) {
  try {
    await fn();
  } catch (e) {
    status(e.message, true);
  }
}
const maskKey = (key) =>
  key ? (key.length > 10 ? `${key.slice(0, 2)}.${key.slice(2, 5)}.....${key.slice(-4)}` : key) : "";
const looksLikeApiKey = (key) => /^[A-Za-z0-9_.-]{20,}$/.test(String(key || "").trim());
const GEMINI_MODEL_FALLBACKS = [
  { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash-Lite" },
  { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash-Lite" },
  { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash" },
  { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash" },
  { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash" },
  { id: "gemini-3.1-flash", name: "Gemini 3.1 Flash" },
];
function geminiModelOptions(models = []) {
  const map = new Map();
  for (const m of models) if (m?.id) map.set(m.id, { ...m, extra: false });
  for (const m of GEMINI_MODEL_FALLBACKS)
    if (!map.has(m.id)) map.set(m.id, { ...m, name: `${m.name} · thử`, extra: true });
  const order = new Map(GEMINI_MODEL_FALLBACKS.map((m, i) => [m.id, i]));
  return [...map.values()].sort(
    (a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99) || a.name.localeCompare(b.name),
  );
}
const MAX_GEMINI_KEYS = 20;
function normalizeGeminiKeys(value) {
  const seen = new Set();
  return (Array.isArray(value) ? value : [])
    .map((raw) => (typeof raw === "string" ? { key: raw } : raw))
    .filter((x) => x && (x.key || x.apiKey || x.value || x.token))
    .map((x) => {
      const key = String(x.key || x.apiKey || x.value || x.token || "").trim();
      return {
        id: x.id || `gk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        key,
        label:
          String(x.label || x.name || "")
            .trim()
            .slice(0, 40) || maskKey(key),
        enabled: x.enabled !== false,
        quotaLimited: !!x.quotaLimited,
        quotaAt: x.quotaAt || "",
        invalidKey: !!x.invalidKey,
        invalidAt: x.invalidAt || "",
      };
    })
    .filter((x) => looksLikeApiKey(x.key) && !seen.has(x.key) && seen.add(x.key))
    .slice(0, MAX_GEMINI_KEYS);
}
function displayGeminiKeys(keys = []) {
  const backups = normalizeGeminiKeys(keys).filter((x) => x.key !== geminiPrimaryKey);
  return normalizeGeminiKeys(
    geminiPrimaryKey
      ? [
          {
            id: "primary",
            key: geminiPrimaryKey,
            label: geminiPrimaryKeyLabel,
            enabled: true,
          },
          ...backups,
        ]
      : backups,
  );
}
async function saveGeminiKeyList(list) {
  const clean = normalizeGeminiKeys(list),
    active = clean.find((x) => x.enabled !== false && !x.quotaLimited && !x.invalidKey);
  geminiPrimaryKey = active?.key || "";
  geminiPrimaryKeyLabel = active?.label || "";
  const ordered = active ? [active, ...clean.filter((x) => x.key !== active.key)] : clean,
    backups = active ? ordered.slice(1) : ordered;
  geminiStoredKeys = backups;
  $("geminiKey").value = geminiPrimaryKey;
  await chrome.storage.local.set({
    geminiKey: geminiPrimaryKey,
    geminiKeyLabel: geminiPrimaryKeyLabel,
    geminiKeys: backups,
  });
  renderGeminiKeys(backups);
  connectionState(!!geminiPrimaryKey);
  return ordered;
}
async function saveGeminiKeys(keys) {
  return saveGeminiKeyList(displayGeminiKeys(keys));
}
async function promoteGeminiBackup(keys = []) {
  return saveGeminiKeyList(displayGeminiKeys(keys).filter((x) => x.key !== geminiPrimaryKey));
}
function closeKeyMenus() {
  document.querySelectorAll(".key-menu").forEach((x) => (x.hidden = true));
}
function renderGeminiKeys(keys = []) {
  const box = $("geminiKeyQueue");
  if (!box) return;
  geminiStoredKeys = normalizeGeminiKeys(keys).filter((x) => x.key !== geminiPrimaryKey);
  const list = displayGeminiKeys(geminiStoredKeys);
  box.replaceChildren();
  if (!list.length) {
    const empty = document.createElement("p");
    empty.className = "hint key-empty";
    empty.textContent = "Chưa có Gemini key.";
    box.append(empty);
    return;
  }
  list.forEach((item, index) => {
    const row = document.createElement("div"),
      order = document.createElement("span"),
      drag = document.createElement("span"),
      label = document.createElement("label"),
      checkbox = document.createElement("input"),
      keyText = document.createElement("span"),
      code = document.createElement("code"),
      keyMask = document.createElement("small"),
      tag = document.createElement("small"),
      copy = document.createElement("button"),
      more = document.createElement("button"),
      menu = document.createElement("div"),
      edit = document.createElement("button"),
      del = document.createElement("button");
    row.className = `key-row${item.key === geminiPrimaryKey ? " primary" : ""}${item.quotaLimited ? " quota" : ""}${item.invalidKey ? " invalid" : ""}`;
    row.draggable = true;
    row.dataset.key = item.key;
    order.className = "key-order";
    order.textContent = String(index + 1);
    drag.className = "key-drag";
    drag.innerHTML = globalThis.AssistantIcons?.svg("sort") || "";
    drag.title = "Kéo để sắp xếp";
    checkbox.type = "checkbox";
    checkbox.checked = item.enabled !== false;
    checkbox.disabled = item.key === geminiPrimaryKey;
    checkbox.title =
      item.key === geminiPrimaryKey
        ? "Key đang sử dụng"
        : item.enabled
          ? "Đang bật tự chuyển"
          : "Tắt key này";
    checkbox.onchange = () =>
      saveGeminiKeyList(
        list.map((x) =>
          x.key === item.key
            ? {
                ...x,
                enabled: checkbox.checked,
                quotaLimited: checkbox.checked ? false : x.quotaLimited,
                invalidKey: checkbox.checked ? false : x.invalidKey,
              }
            : x,
        ),
      );
    keyText.className = "key-text";
    code.className = "key-name";
    code.textContent = item.label || maskKey(item.key);
    code.title = maskKey(item.key);
    if (item.label !== maskKey(item.key)) {
      keyMask.className = "key-mask";
      keyMask.textContent = maskKey(item.key);
      keyText.append(code, keyMask);
    } else {
      keyText.append(code);
    }
    tag.className = "key-tag";
    tag.textContent =
      item.key === geminiPrimaryKey
        ? "Đang dùng"
        : item.invalidKey
          ? "Key lỗi"
          : item.quotaLimited
            ? "Hết hạn mức"
            : "";
    label.append(checkbox, keyText, tag);
    copy.type = "button";
    copy.className = "key-copy";
    copy.innerHTML = ICON.copy;
    copy.title = "Copy key";
    copy.onclick = () =>
      navigator.clipboard
        .writeText(item.key)
        .then(() => status("Đã copy key."))
        .catch(() => status("Không copy được key.", true));
    more.type = "button";
    more.className = "key-remove";
    more.innerHTML = globalThis.AssistantIcons?.svg("more") || "";
    more.title = "Tuỳ chọn";
    more.onclick = (event) => {
      event.stopPropagation();
      const open = menu.hidden;
      closeKeyMenus();
      menu.hidden = !open;
    };
    menu.className = "key-menu";
    menu.hidden = true;
    edit.type = "button";
    edit.textContent = "Đổi tên";
    edit.onclick = () => {
      const nextLabel = window.prompt(
        "Tên hiển thị cho API key (để trống dùng tên mặc định):",
        item.label === maskKey(item.key) ? "" : item.label,
      );
      if (nextLabel === null) return;
      const label = nextLabel.trim().slice(0, 40);
      saveGeminiKeyList(list.map((x) => (x.key === item.key ? { ...x, label } : x)));
      menu.hidden = true;
    };
    del.type = "button";
    del.textContent = "Xoá";
    del.onclick = () => saveGeminiKeyList(list.filter((x) => x.key !== item.key));
    menu.append(edit, del);
    row.ondragstart = (event) => {
      event.dataTransfer.setData("text/plain", item.key);
      row.classList.add("dragging");
    };
    row.ondragend = () => row.classList.remove("dragging");
    row.ondragover = (event) => event.preventDefault();
    row.ondrop = (event) => {
      event.preventDefault();
      const from = event.dataTransfer.getData("text/plain");
      if (!from || from === item.key) return;
      const moved = list.find((x) => x.key === from),
        next = list.filter((x) => x.key !== from),
        to = next.findIndex((x) => x.key === item.key);
      next.splice(to < 0 ? next.length : to, 0, moved);
      saveGeminiKeyList(next);
    };
    row.append(order, drag, label, copy, more, menu);
    box.append(row);
  });
}
async function activeTab() {
  if (panelTargetTabId) {
    const target = await chrome.tabs.get(panelTargetTabId).catch(() => null);
    if (target?.id && (!panelWindowId || target.windowId === panelWindowId)) return target;
    panelTargetTabId = null;
  }
  const query = panelWindowId
    ? { active: true, windowId: panelWindowId }
    : { active: true, currentWindow: true };
  return (await chrome.tabs.query(query))[0];
}
let panelTargetTabId = null;
let panelWindowId = null;
let panelTargets = [];
let selectedAutoFlowRunning = false;
async function resolvePanelTarget() {
  const currentWindow = await chrome.windows.getCurrent().catch(() => null);
  if (!currentWindow?.id) return null;
  panelWindowId = currentWindow.id;
  const response = await chrome.runtime
    .sendMessage({ type: "panelTarget", windowId: currentWindow.id })
    .catch(() => null);
  panelTargetTabId = Number(response?.data?.tabId) || null;
  return panelTargetTabId;
}
async function syncPanelAutoModeControls(running = selectedAutoFlowRunning) {
  const stored = await chrome.storage.local.get(["panelAutoSuggest", "autoReply"]),
    controls = [
      [$("panelAutoSuggest"), !!stored.panelAutoSuggest],
      [$("panelAutoReply"), !!stored.autoReply],
    ];
  for (const [input, savedValue] of controls) {
    if (!input) continue;
    // Auto flow temporarily clears these options, but they remain editable.
    // The panel restores the saved values when the run ends.
    input.disabled = false;
    input.checked = running ? false : savedValue;
    input.title = running ? "Tạm tắt trong tab đang chạy tự động" : "";
  }
  const actions = document.querySelector(".post-card .actions");
  if (actions) actions.hidden = running || !!stored.panelAutoSuggest;
}
function ensurePanelTargetUi() {
  if (document.getElementById("panelTargetBar")) return;
  const header = document.querySelector("body > header");
  if (!header) return;
  const bar = document.createElement("div");
  bar.id = "panelTargetBar";
  bar.hidden = true;
  bar.style.cssText =
    "align-items:center;gap:8px;margin:0 0 10px;padding:7px 10px;border:1px solid var(--panel-border,#2f3336);border-radius:10px;background:transparent;color:var(--panel-muted,#8b98a5);font-size:12px";
  const radios = document.createElement("div");
  radios.id = "panelTargetRadios";
  radios.setAttribute("role", "radiogroup");
  radios.setAttribute("aria-label", "Chọn tab X mà side panel điều khiển");
  radios.style.cssText = "display:flex;flex:1;flex-wrap:wrap;gap:0;min-width:0";
  bar.append(radios);
  header.after(bar);
}
async function refreshPanelTargets() {
  ensurePanelTargetUi();
  const bar = document.getElementById("panelTargetBar");
  const radios = document.getElementById("panelTargetRadios");
  if (!bar || !radios) return;
  const currentWindow = await chrome.windows.getCurrent().catch(() => null);
  if (!currentWindow?.id) return;
  panelWindowId = currentWindow.id;
  const tabs = (await chrome.tabs.query({ windowId: currentWindow.id })).filter((tab) =>
    /^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i.test(tab.url || ""),
  );
  panelTargets = await Promise.all(
    tabs.map(async (tab, index) => {
      const identity = await chrome.tabs
        .sendMessage(tab.id, { type: "autoFlowIdentity" })
        .catch(() => null);
      return { tab, identity, index };
    }),
  );
  if (!panelTargetTabId || !panelTargets.some((item) => item.tab.id === panelTargetTabId)) {
    const active = panelTargets.find((item) => item.tab.active);
    panelTargetTabId = active?.tab.id || panelTargets[0]?.tab.id || null;
  }
  bar.hidden = panelTargets.length < 2;
  bar.style.display = bar.hidden ? "none" : "flex";
  radios.replaceChildren(
    ...panelTargets.map(({ tab, identity, index }) => {
      const item = document.createElement("label");
      item.style.cssText =
        "display:inline-flex;align-items:center;justify-content:center;gap:5px;flex:1 1 0;min-width:0;padding:5px 8px;border:0;border-radius:0;color:var(--panel-text,#e7e9ea);cursor:pointer;font:600 13px/1.2 system-ui";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "panelTargetTab";
      radio.value = String(tab.id);
      radio.checked = tab.id === panelTargetTabId;
      radio.style.accentColor = "var(--panel-accent,#1d9bf0)";
      radio.addEventListener("change", () => {
        if (!radio.checked) return;
        panelTargetTabId = tab.id;
        notifyPanel(true);
        refreshPanelTargets();
      });
      const isRunning = !!identity?.running;
      const status = isRunning ? (identity.paused ? "Tạm dừng" : "Đang chạy") : "Chưa chạy";
      const statusDot = document.createElement("span");
      statusDot.setAttribute("aria-hidden", "true");
      statusDot.style.cssText = `width:7px;height:7px;flex:0 0 7px;border-radius:50%;background:${isRunning ? "#20c997" : "#e05257"}`;
      statusDot.title = status;
      const text = document.createElement("span");
      const tabLabel =
        panelTargets.length === 2 ? `TAB ${index + 1}` : `TAB ${String.fromCharCode(65 + index)}`;
      text.textContent = tabLabel;
      item.title = status;
      item.setAttribute("aria-label", `${tabLabel} · ${status}`);
      item.append(radio, text, statusDot);
      return item;
    }),
  );
  const selected = panelTargets.find((item) => item.tab.id === panelTargetTabId);
  const autoToggle = document.getElementById("autoReplyFlow");
  selectedAutoFlowRunning = !!selected?.identity?.running;
  if (autoToggle) autoToggle.checked = selectedAutoFlowRunning;
  syncPanelAutoModeControls(selectedAutoFlowRunning);
}
let currentModule = "reply";
function readStyleWordRange() {
  const min = Math.min(100, Math.max(1, Number($("styleMinWords")?.value) || 6));
  const max = Math.min(100, Math.max(min, Number($("styleMaxWords")?.value) || 10));
  return { min, max };
}
function syncStyleWordRange() {
  const range = readStyleWordRange();
  if ($("styleMinWords")) $("styleMinWords").value = String(range.min);
  if ($("styleMaxWords")) $("styleMaxWords").value = String(range.max);
  chrome.storage.local.set({ styleMinWords: range.min, styleMaxWords: range.max }).catch(() => {});
  return range;
}
function showModule(module) {
  if (module === "quote") module = "reply";
  $("settingsArea").hidden = true;
  $("settingsToggle").hidden = false;
  document.body.classList.remove("settings-open");
  document.querySelector("header")?.classList.remove("settings-open");
  $("settingsToggle").innerHTML = globalThis.AssistantIcons?.svg("setting") || ICON.setting;
  currentModule = module;
  document.body.dataset.module = module;
  const content = module === "content",
    follow = module === "follow",
    feedback = module === "feedback";
  replySettings.hidden = content || follow || feedback;
  replyModule.classList.toggle("active", !content && !follow && !feedback);
  contentModule.classList.toggle("active", content);
  followModule.classList.toggle("active", follow);
  $("feedbackModule")?.classList.toggle("active", feedback);
  contentWorkspace.hidden = !content;
  quoteWorkspace.hidden = true;
  followWorkspace.hidden = !follow;
  $("feedbackWorkspace")?.toggleAttribute("hidden", !feedback);
  document.querySelector(".mode-tabs").hidden = true;
  if (content || follow || feedback) {
    $("workspace").hidden = true;
    $("xWorkspace").hidden = true;
  } else showMode("x");
  if (follow) refreshFollowPage();
  if (feedback) renderFeedbackState();
}
const FEEDBACK_STATE_KEY = "feedbackStateV1";
let feedbackState = {
  handle: "",
  posts: [],
  method: "random",
  replyMin: 3,
  replyMax: 5,
  randomMin: 3,
  randomMax: 5,
  newMin: 3,
  newMax: 5,
  continuousWaitMinutes: 30,
  speed: 0,
};
let feedbackScanRunning = false;
let feedbackScanAbort = false;
let feedbackScanTabId = null;
let feedbackRunRunning = false;
let feedbackRunAbort = false;
let feedbackRunTabId = null;
let feedbackExtraContext = "";
function feedbackSave() {
  return chrome.storage.local.set({ [FEEDBACK_STATE_KEY]: feedbackState });
}
function feedbackMethodValues() {
  feedbackState.method =
    document.querySelector('input[name="feedbackMethod"]:checked')?.value || "random";
  const min = Math.max(
    1,
    Number($("feedbackReplyMin")?.value) || feedbackState.replyMin || feedbackState.randomMin || 3,
  );
  const max = Math.max(
    min,
    Number($("feedbackReplyMax")?.value) || feedbackState.replyMax || feedbackState.randomMax || 5,
  );
  feedbackState.replyMin = min;
  feedbackState.replyMax = max;
  // Keep the legacy keys in sync for profiles saved by older builds.
  feedbackState.randomMin = min;
  feedbackState.randomMax = max;
  feedbackState.newMin = min;
  feedbackState.newMax = max;
  feedbackState.continuousWaitMinutes = Math.max(
    1,
    Math.min(1440, Number($("feedbackContinuousWait")?.value) || 30),
  );
  const continuousWait = $("feedbackContinuousWait");
  if (continuousWait) continuousWait.value = String(feedbackState.continuousWaitMinutes);
}
function feedbackSpeedValue() {
  feedbackState.speed = Math.max(-3, Math.min(3, Number($("feedbackSpeed")?.value) || 0));
  const output = $("feedbackSpeedValue");
  if (output) output.textContent = String(feedbackState.speed);
  return feedbackState.speed;
}
function feedbackDelayMs() {
  const speed = feedbackSpeedValue();
  const base = 1035;
  const speedFactor = 1 - speed * 0.1;
  const jitter = 0.88 + Math.random() * 0.24;
  return Math.max(650, Math.round(base * speedFactor * jitter));
}
function feedbackEmojiOnly(value) {
  const input = String(value || "").trim();
  if (!input || !/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u.test(input)) return false;
  return (
    input.replace(
      /[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji_Modifier}\uFE0F\u200D\u20E3\s]/gu,
      "",
    ) === ""
  );
}
function feedbackInteractionRequest(value) {
  const input = String(value || "")
    .trim()
    .toLocaleLowerCase("vi");
  if (!input) return false;
  return /(?:chéo\s*(?:follow|fl|f)|follow\s*(?:back|lại|mình|nhau|chéo)|(?:fl|f)\s*(?:back|chéo|nhau)|theo\s*dõi\s*(?:mình|nhau|lại)|kết\s*bạn|làm\s*bạn\s*(?:với\s*mình|nhé|nha|đi)?|\bkb\b|\bfl\b|tương\s*tác\s*(?:chéo|qua\s*lại)|giao\s*lưu\s*(?:với\s*mình|nhé|nha|đi)|ib\s*(?:mình|nhé|nha)|dm\s*(?:mình|nhé|nha)|follow\s*for\s*follow|f4f|l4l)/iu.test(
    input,
  );
}
function renderFeedbackState() {
  const list = $("feedbackPosts");
  if (!list) return;
  let groupSelect = $("feedbackGroupSelect");
  if (!groupSelect) {
    const group = document.createElement("label");
    group.className = "feedback-group-select";
    groupSelect = document.createElement("input");
    groupSelect.id = "feedbackGroupSelect";
    groupSelect.type = "checkbox";
    const groupText = document.createElement("span");
    groupText.textContent = "Chọn nhóm có thể phản hồi";
    group.append(groupSelect, groupText);
    list.before(group);
    groupSelect.onchange = () => {
      const checked = groupSelect.checked;
      (feedbackState.posts || []).forEach((post) => {
        const eligible = (post.comments || []).filter(
          (comment) =>
            !comment.feedbackSkipped &&
            !feedbackEmojiOnly(comment.text) &&
            !feedbackInteractionRequest(comment.text),
        );
        const completed = eligible.length > 0 && eligible.every((comment) => comment.responded);
        if (eligible.length && !completed) post.selected = checked;
      });
      feedbackSave();
      renderFeedbackState();
    };
  }
  const title = $("feedbackPostsTitle");
  if (title)
    title.textContent =
      feedbackState.handle && (feedbackState.posts || []).length
        ? `Danh sách bài đăng của @${feedbackState.handle}`
        : "Danh sách bài đăng";
  const posts = (feedbackState.posts || []).filter((post) => post && !post.feedbackRejected);
  list.replaceChildren(
    ...posts.map((post) => {
      const row = document.createElement("label");
      row.className = "feedback-post-row";
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = !!post.selected;
      check.onchange = () => {
        post.selected = check.checked;
        feedbackSave();
        updateFeedbackStart();
      };
      const body = document.createElement("span");
      body.className = "feedback-post-body";
      const title = document.createElement("b");
      const eligibleComments = (post.comments || []).filter(
        (comment) =>
          !comment.feedbackSkipped &&
          !feedbackEmojiOnly(comment.text) &&
          !feedbackInteractionRequest(comment.text),
      );
      title.textContent = `${post.name || "Bài viết"} · ${eligibleComments.length} cmt`;
      const excerpt = document.createElement("span");
      excerpt.textContent = `${String(post.text || "")
        .replace(/\s+/g, " ")
        .slice(0, 150)}${String(post.text || "").length > 150 ? "…" : ""}`;
      const meta = document.createElement("small");
      const replied = eligibleComments.filter((comment) => comment.responded).length;
      meta.textContent = `${replied}/${eligibleComments.length} đã phản hồi · ${post.id}`;
      const completed = replied >= eligibleComments.length;
      check.disabled = completed;
      if (completed) {
        post.selected = false;
        check.checked = false;
        check.title = "Bài viết đã phản hồi đủ comment";
      }
      body.append(title, excerpt, meta);
      row.append(check, body);
      return row;
    }),
  );
  const selectable = posts.filter((post) => {
    const eligible = (post.comments || []).filter(
      (comment) =>
        !comment.feedbackSkipped &&
        !feedbackEmojiOnly(comment.text) &&
        !feedbackInteractionRequest(comment.text),
    );
    return eligible.length > 0 && !eligible.every((comment) => comment.responded);
  });
  groupSelect.checked = selectable.length > 0 && selectable.every((post) => post.selected);
  groupSelect.indeterminate = selectable.some((post) => post.selected) && !groupSelect.checked;
  groupSelect.disabled = selectable.length === 0;
  updateFeedbackStart();
}
function updateFeedbackStart() {
  const button = $("feedbackStart");
  if (button)
    button.disabled =
      feedbackRunRunning || !(feedbackState.posts || []).some((post) => post.selected);
}
async function feedbackEnsureScript(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["feedback.js"] });
  } catch {}
}
function feedbackWaitForTab(tabId, timeout = 15000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const listener = (id, change) => {
      if (id === tabId && change.status === "complete") finish();
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(finish, timeout);
  });
}
async function feedbackRefreshPost(tabId, post) {
  if (!post?.url) return 0;
  await chrome.tabs.update(tabId, { url: post.url });
  await feedbackWaitForTab(tabId);
  await feedbackEnsureScript(tabId);
  const inspected = await chrome.tabs
    .sendMessage(tabId, {
      type: "feedbackInspectPost",
      expectedPostId: post.id,
      ownHandleOverride: feedbackState.handle,
    })
    .catch(() => null);
  if (!inspected?.ok) return 0;
  const existing = new Map((post.comments || []).map((comment) => [String(comment.id), comment]));
  let added = 0;
  for (const comment of inspected.comments || []) {
    const key = String(comment.id);
    const previous = existing.get(key);
    if (previous) existing.set(key, { ...comment, ...previous });
    else {
      existing.set(key, comment);
      added++;
    }
  }
  post.comments = [...existing.values()];
  return added;
}
async function feedbackScan() {
  if (feedbackScanRunning) {
    feedbackScanAbort = true;
    if (feedbackScanTabId)
      chrome.tabs.sendMessage(feedbackScanTabId, { type: "feedbackStopScan" }).catch(() => {});
    return;
  }
  const tab = await activeTab();
  if (!tab?.id || !/^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i.test(tab.url || ""))
    throw new Error("Hãy mở một tab X trước khi kiểm tra dữ liệu.");
  const status = $("feedbackStatus"),
    button = $("feedbackScan");
  feedbackScanRunning = true;
  feedbackScanAbort = false;
  feedbackScanTabId = tab.id;
  button.disabled = false;
  button.textContent = "Dừng kiểm tra";
  status.textContent = "Đang tìm trang cá nhân của bạn…";
  feedbackState.posts = [];
  await feedbackSave();
  renderFeedbackState();
  try {
    await feedbackEnsureScript(tab.id);
    const profile = await chrome.tabs
      .sendMessage(tab.id, { type: "feedbackProfile" })
      .catch(() => null);
    if (!profile?.handle) throw new Error("Chưa đọc được tài khoản hiện tại từ tab X.");
    feedbackState.handle = profile.handle;
    const profileUrl = `https://x.com/${profile.handle}`;
    if (!String(tab.url || "").startsWith(profileUrl)) {
      await chrome.tabs.update(tab.id, { url: profileUrl });
      await feedbackWaitForTab(tab.id);
    }
    if (feedbackScanAbort) return;
    await feedbackEnsureScript(tab.id);
    status.textContent = "Đang cuộn và quét các bài viết…";
    const scan = await chrome.tabs.sendMessage(tab.id, {
      type: "feedbackScanProfile",
      rangeMode: $("feedbackRange").value,
    });
    if (!scan?.ok) throw new Error(scan?.error || "Không quét được trang cá nhân.");
    const posts = [];
    for (const [index, post] of (scan.posts || []).entries()) {
      if (feedbackScanAbort) break;
      status.textContent = `Đang kiểm tra comment bài ${index + 1}/${scan.posts.length}…`;
      await chrome.tabs.update(tab.id, { url: post.url });
      await feedbackWaitForTab(tab.id);
      await feedbackEnsureScript(tab.id);
      if (feedbackScanAbort) break;
      const inspected = await chrome.tabs
        .sendMessage(tab.id, {
          type: "feedbackInspectPost",
          expectedPostId: post.id,
          ownHandleOverride: feedbackState.handle,
        })
        .catch(() => null);
      if (inspected && !inspected.ok) {
        status.textContent = `Bỏ qua bài ${index + 1}: ${inspected.error || "không khớp bài đăng"}.`;
        continue;
      }
      const comments = inspected?.comments || [];
      const canReply = comments.some(
        (comment) =>
          !comment.feedbackSkipped &&
          !feedbackEmojiOnly(comment.text) &&
          !feedbackInteractionRequest(comment.text),
      );
      posts.push({ ...post, comments, selected: canReply, scannedAt: Date.now() });
      feedbackState.posts = [...posts];
      await feedbackSave();
      renderFeedbackState();
    }
    feedbackState.posts = posts.map((post) => {
      const canReply = (post.comments || []).some(
        (comment) =>
          !comment.feedbackSkipped &&
          !feedbackEmojiOnly(comment.text) &&
          !feedbackInteractionRequest(comment.text),
      );
      return {
        ...post,
        selected:
          canReply &&
          !(post.comments || []).every((comment) => comment.responded || comment.feedbackSkipped),
      };
    });
    if (!feedbackScanAbort) await chrome.tabs.update(tab.id, { url: profileUrl });
    await feedbackSave();
    renderFeedbackState();
    status.textContent = feedbackScanAbort
      ? `Đã dừng kiểm tra sau ${posts.length} bài.`
      : `Đã quét ${posts.length} bài và lưu mốc comment.`;
  } finally {
    feedbackScanRunning = false;
    feedbackScanAbort = false;
    feedbackScanTabId = null;
    button.disabled = false;
    button.textContent = "Kiểm tra dữ liệu";
  }
}
async function feedbackRun() {
  if (feedbackRunRunning) {
    feedbackRunAbort = true;
    return;
  }
  const tab = await activeTab();
  if (!tab?.id || !/^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i.test(tab.url || ""))
    throw new Error("Hãy mở một tab X trước khi thực hiện phản hồi.");
  feedbackMethodValues();
  feedbackSpeedValue();
  let selected = (feedbackState.posts || []).filter((post) => post.selected);
  if (!selected.length) throw new Error("Hãy chọn ít nhất một bài viết.");
  const button = $("feedbackStart"),
    status = $("feedbackStatus");
  feedbackRunRunning = true;
  feedbackRunAbort = false;
  feedbackRunTabId = tab.id;
  button.disabled = false;
  button.textContent = "Dừng phản hồi";
  try {
    await chrome.storage.local.set({ feedbackExtraContext });
    await feedbackEnsureScript(tab.id);
    let total = 0,
      round = 0;
    const failedAttempts = new Map();
    const waitInterruptible = async (duration) => {
      const until = Date.now() + duration;
      while (!feedbackRunAbort && Date.now() < until)
        await new Promise((resolve) => setTimeout(resolve, Math.min(1000, until - Date.now())));
    };
    while (!feedbackRunAbort) {
      round++;
      let roundTotal = 0,
        roundCompleted = 0;
      for (const post of selected) {
        if (feedbackRunAbort) break;
        let pending = (post.comments || []).filter(
          (comment) =>
            !comment.responded &&
            !comment.feedbackSkipped &&
            !feedbackEmojiOnly(comment.text) &&
            !feedbackInteractionRequest(comment.text),
        );
        if (
          feedbackState.method === "random" ||
          feedbackState.method === "new" ||
          feedbackState.method === "continuous"
        ) {
          const min = feedbackState.replyMin || feedbackState.randomMin || 3;
          const max = feedbackState.replyMax || feedbackState.randomMax || 5;
          const target = Math.min(
            pending.length,
            min + Math.floor(Math.random() * Math.max(1, max - min + 1)),
          );
          pending = pending.sort(() => Math.random() - 0.5).slice(0, target);
        }
        for (const comment of pending) {
          if (feedbackRunAbort) break;
          total++;
          roundTotal++;
          status.textContent = `Lượt ${round} · Đang phản hồi ${total}: ${post.text ? String(post.text).slice(0, 45) : "bài viết"}…`;
          await new Promise((resolve) =>
            setTimeout(resolve, Math.max(250, Math.round(feedbackDelayMs() * 0.35))),
          );
          await chrome.tabs.update(tab.id, { url: comment.url });
          await feedbackWaitForTab(tab.id);
          await feedbackEnsureScript(tab.id);
          const result = await chrome.tabs
            .sendMessage(tab.id, {
              type: "feedbackReplyComment",
              commentUrl: comment.url,
              extraContext: feedbackExtraContext,
              ownHandleOverride: feedbackState.handle,
            })
            .catch((error) => ({ ok: false, error: error.message }));
          let completed = result?.ok;
          if (!completed && result?.alreadyReplied) {
            comment.responded = true;
            comment.respondedAt ||= new Date().toISOString();
            comment.feedbackSkipReason = "Đã có phản hồi trước khi chạy";
            await feedbackSave();
            renderFeedbackState();
            status.textContent = "Bỏ qua comment đã được phản hồi trước đó.";
            continue;
          }
          if (!completed && result?.reload) {
            await feedbackWaitForTab(tab.id);
            await feedbackEnsureScript(tab.id);
            const retry = await chrome.tabs
              .sendMessage(tab.id, {
                type: "feedbackReplyComment",
                commentUrl: comment.url,
                extraContext: feedbackExtraContext,
                ownHandleOverride: feedbackState.handle,
              })
              .catch((error) => ({ ok: false, error: error.message }));
            completed = retry?.ok;
            if (!completed && retry?.alreadyReplied) {
              comment.responded = true;
              comment.respondedAt ||= new Date().toISOString();
              comment.feedbackSkipReason = "Đã có phản hồi trước khi chạy";
              await feedbackSave();
              renderFeedbackState();
              status.textContent = "Bỏ qua comment đã được phản hồi trước đó.";
              continue;
            }
            if (!completed)
              status.textContent = `Bỏ qua comment: ${retry?.error || "chưa sẵn sàng"}.`;
          } else if (!completed)
            status.textContent = `Bỏ qua comment: ${result?.error || "chưa sẵn sàng"}.`;
          if (completed) {
            comment.responded = true;
            comment.respondedAt = new Date().toISOString();
            failedAttempts.delete(comment.url);
            roundCompleted++;
            await feedbackSave();
            renderFeedbackState();
          } else {
            const attempts = (failedAttempts.get(comment.url) || 0) + 1;
            failedAttempts.set(comment.url, attempts);
            // Do not retry one broken comment forever and block the rest of
            // the queue. It is excluded after two failed rounds and remains
            // visible in the saved state for diagnostics.
            if (attempts >= 2) {
              comment.feedbackSkipped = true;
              comment.feedbackSkipReason = "Không thể phản hồi sau 2 lượt thử";
              await feedbackSave();
              renderFeedbackState();
            }
          }
          await new Promise((resolve) => setTimeout(resolve, feedbackDelayMs()));
        }
      }
      const remaining = selected.some((post) =>
        (post.comments || []).some(
          (comment) =>
            !comment.responded &&
            !comment.feedbackSkipped &&
            !feedbackEmojiOnly(comment.text) &&
            !feedbackInteractionRequest(comment.text),
        ),
      );
      if (feedbackState.method === "continuous") {
        if (remaining) {
          status.textContent = `Đã xong lượt ${round} · nghỉ 5 phút trước lượt tiếp theo…`;
          await waitInterruptible(300000);
          continue;
        }
        const waitMinutes = Math.max(1, Number(feedbackState.continuousWaitMinutes) || 30);
        status.textContent = `Đã xử lý hết comment hiện tại · nghỉ ${waitMinutes} phút trước khi quét lại…`;
        await waitInterruptible(waitMinutes * 60000);
        if (feedbackRunAbort) break;
        feedbackState.posts.forEach((post) => {
          post.selected = true;
        });
        selected = (feedbackState.posts || []).filter((post) => post.selected);
        let added = 0;
        for (const post of selected) {
          if (feedbackRunAbort) break;
          added += await feedbackRefreshPost(tab.id, post);
        }
        await feedbackSave();
        renderFeedbackState();
        status.textContent = added
          ? `Đã phát hiện ${added} comment mới · tiếp tục phản hồi…`
          : "Đã quét lại danh sách · tiếp tục phản hồi…";
        continue;
      }
      if (feedbackState.method !== "random" || !remaining || !roundTotal) break;
      if (!roundCompleted) {
        status.textContent = `Lượt ${round} chưa có comment hoàn tất · sẽ thử lại sau 5 phút…`;
      } else {
        status.textContent = `Đã xong lượt ${round} · nghỉ 5 phút trước lượt tiếp theo…`;
      }
      await waitInterruptible(300000);
    }
    status.textContent = feedbackRunAbort
      ? "Đã dừng phản hồi."
      : "Đã thực hiện xong toàn bộ comment hợp lệ đã chọn.";
  } finally {
    chrome.storage.local.remove("feedbackExtraContext").catch(() => {});
    feedbackRunRunning = false;
    feedbackRunAbort = false;
    feedbackRunTabId = null;
    button.textContent = "Thực hiện phản hồi";
    updateFeedbackStart();
  }
}
function feedbackWire() {
  const scanButton = $("feedbackScan");
  const status = $("feedbackStatus");
  const continuousLabel = document.querySelector(
    'input[name="feedbackMethod"][value="continuous"]',
  )?.nextElementSibling;
  if (continuousLabel) {
    continuousLabel.replaceChildren(
      document.createTextNode("Kiểm tra và chạy liên tục (khởi động lại sau: "),
    );
    const waitInput = document.createElement("input");
    waitInput.id = "feedbackContinuousWait";
    waitInput.type = "number";
    waitInput.min = "1";
    waitInput.max = "1440";
    waitInput.value = String(feedbackState.continuousWaitMinutes || 30);
    waitInput.setAttribute("aria-label", "Số phút chờ kiểm tra lại");
    continuousLabel.append(waitInput, document.createTextNode(" phút)"));
  }
  const randomText = document.querySelector(
    'input[name="feedbackMethod"][value="random"]',
  )?.nextElementSibling;
  const newText = document.querySelector(
    'input[name="feedbackMethod"][value="new"]',
  )?.nextElementSibling;
  if (randomText) randomText.textContent = "Phản hồi ngẫu nhiên";
  if (newText) newText.textContent = "Chỉ phản hồi cmt mới";
  const methods = document.querySelector(".feedback-methods");
  if (methods && !$("feedbackQuantity")) {
    const quantity = document.createElement("section");
    quantity.id = "feedbackQuantity";
    quantity.className = "feedback-quantity";
    quantity.innerHTML =
      '<h3>Số lượng phản hồi mỗi bài</h3><label for="feedbackReplyMin">Từ <input id="feedbackReplyMin" type="number" min="1" value="3" aria-label="Số lượng tối thiểu"></label><span> đến </span><label for="feedbackReplyMax"><input id="feedbackReplyMax" type="number" min="1" value="5" aria-label="Số lượng tối đa"> cmt</label>';
    methods.insertAdjacentElement("afterend", quantity);
  }
  if (status && !$("feedbackExtraContext")) {
    const wrap = document.createElement("div");
    wrap.className = "feedback-extra panel-stack";
    wrap.innerHTML =
      '<label for="feedbackExtraContext">Ngữ cảnh bổ sung</label><div class="feedback-extra-input panel-row"><textarea id="feedbackExtraContext" rows="2" maxlength="500" placeholder="Ví dụ: phản hồi ngắn khoảng 5–8 từ…"></textarea><button id="feedbackExtraClear" class="clear-url" type="button" title="Xoá ngữ cảnh bổ sung" aria-label="Xoá ngữ cảnh bổ sung" hidden>×</button></div>';
    status.insertAdjacentElement("afterend", wrap);
  }
  const extra = $("feedbackExtraContext"),
    extraClear = $("feedbackExtraClear");
  const syncExtra = () => {
    feedbackExtraContext = String(extra?.value || "")
      .trim()
      .slice(0, 500);
    if (extraClear) extraClear.hidden = !feedbackExtraContext.length;
  };
  extra?.addEventListener("input", syncExtra);
  extraClear?.addEventListener("click", () => {
    if (extra) extra.value = "";
    syncExtra();
    extra?.focus();
  });
  const speed = $("feedbackSpeed");
  if (speed) speed.value = String(feedbackState.speed || 0);
  feedbackSpeedValue();
  scanButton?.setAttribute("title", "Quét bài trên trang cá nhân và lưu mốc comment");
  $("feedbackWorkspace")?.querySelector(".section-head small")?.remove();
  const range = $("feedbackRange");
  const dayOption = range?.querySelector('option[value="24"]');
  if (dayOption) {
    dayOption.value = "day";
    const hoursOption = document.createElement("option");
    hoursOption.value = "24";
    hoursOption.textContent = "24 giờ trước";
    const twelveHourOption = range.querySelector('option[value="12"]');
    (twelveHourOption || range.lastElementChild)?.insertAdjacentElement("afterend", hoursOption);
  }
  scanButton?.addEventListener("click", () =>
    feedbackScan().catch((error) => {
      $("feedbackStatus").textContent = discreet(error.message);
      scanButton.disabled = false;
      scanButton.textContent = "Kiểm tra dữ liệu";
      feedbackScanRunning = false;
      feedbackScanTabId = null;
    }),
  );
  document.querySelectorAll('input[name="feedbackMethod"]').forEach((input) =>
    input.addEventListener("change", () => {
      feedbackMethodValues();
      feedbackSave();
    }),
  );
  ["feedbackReplyMin", "feedbackReplyMax", "feedbackContinuousWait"].forEach((id) =>
    $(id)?.addEventListener("change", () => {
      feedbackMethodValues();
      feedbackSave();
    }),
  );
  speed?.addEventListener("input", () => {
    feedbackSpeedValue();
    feedbackSave();
  });
  $("feedbackStart")?.addEventListener("click", () =>
    feedbackRun().catch((error) => {
      $("feedbackStatus").textContent = discreet(error.message);
      feedbackRunRunning = false;
      feedbackRunAbort = false;
      $("feedbackStart").textContent = "Thực hiện phản hồi";
      updateFeedbackStart();
    }),
  );
  chrome.storage.local
    .get(FEEDBACK_STATE_KEY)
    .then((saved) => {
      feedbackState = { ...feedbackState, ...(saved[FEEDBACK_STATE_KEY] || {}) };
      feedbackState.replyMin = feedbackState.replyMin || feedbackState.randomMin || 3;
      feedbackState.replyMax = feedbackState.replyMax || feedbackState.randomMax || 5;
      const method = document.querySelector(
        `input[name="feedbackMethod"][value="${feedbackState.method}"]`,
      );
      if (method) method.checked = true;
      if (speed) speed.value = String(feedbackState.speed || 0);
      const replyMin = $("feedbackReplyMin"),
        replyMax = $("feedbackReplyMax");
      if (replyMin) replyMin.value = String(feedbackState.replyMin);
      if (replyMax) replyMax.value = String(feedbackState.replyMax);
      const continuousWait = $("feedbackContinuousWait");
      if (continuousWait) continuousWait.value = String(feedbackState.continuousWaitMinutes || 30);
      feedbackSpeedValue();
      renderFeedbackState();
    })
    .catch(() => {});
}
feedbackWire();
async function safelyContent(fn) {
  try {
    await fn();
  } catch (e) {
    $("contentStatus").textContent = discreet(e.message);
    $("contentStatus").classList.add("error");
  }
}
async function readNews() {
  const tab = await activeTab();
  if (!tab?.id || !/^https:\/\//.test(tab.url || ""))
    throw new Error("Hãy mở một bài viết trên trình duyệt hoặc dán nội dung gốc.");
  const [value] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: [
      "remote-config.js",
      "language.js",
      "content-core.js",
      "content-reader.js",
      "content-extractor.js",
      "article-extract.js",
    ],
  });
  if (!value?.result || value.result.error)
    throw new Error(value?.result?.error || "Không đọc được bài viết.");
  $("newsUrl").value = value.result.url;
  $("newsSource").value = value.result.text.slice(0, 10000);
  $("newsSource").dataset.publishedAt = value.result.publishedAt || "";
  $("contentStatus").textContent = "";
  return value.result;
}
let pendingNewsLoad = false,
  pendingNewsTabId = null;
async function loadNewsUrl() {
  const raw = $("newsUrl").value.trim();
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Liên kết bài viết không hợp lệ.");
  }
  if (url.protocol !== "https:") throw new Error("Chỉ hỗ trợ liên kết HTTPS.");
  const origin = `${url.origin}/*`,
    granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) throw new Error("Cần cấp quyền đọc trang này để lấy nội dung bài viết.");
  const tab = await activeTab();
  pendingNewsLoad = true;
  pendingNewsTabId = tab.id;
  await chrome.tabs.update(tab.id, { url: url.href });
  $("contentStatus").textContent = "Đang mở và đọc bài viết…";
}
async function composeNews() {
  if (!$("newsSource").value.trim()) await readNews();
  const s = await chrome.storage.local.get([
    "provider",
    "apiKey",
    "apiModel",
    "geminiKey",
    "geminiKeys",
    "geminiModel",
    "deepseekKey",
    "deepseekModel",
  ]);
  const provider = s.provider || "gemini",
    model =
      provider === "gemini"
        ? s.geminiModel || "gemini-3.1-flash-lite"
        : provider === "deepseek"
          ? s.deepseekModel || "deepseek-flash"
          : s.apiModel || "gpt-4.1-mini";
  $("contentStatus").textContent = "Đang viết bản nháp…";
  const r = await chrome.runtime.sendMessage({
    type: "composeNews",
    provider,
    model,
    apiKey: s.apiKey,
    geminiKey: s.geminiKey,
    geminiKeys: s.geminiKeys,
    deepseekKey: s.deepseekKey,
    source: $("newsSource").value,
    angle: "",
  });
  if (!r?.ok) throw new Error(r?.error || "Không tạo được bản nháp.");
  $("newsDraft").value = r.data.draft;
  $("contentResult").hidden = false;
  $("contentStatus").textContent = "";
}
async function readPost() {
  if (reading) return;
  reading = true;
  try {
    const tab = await activeTab();
    if (
      !tab?.id ||
      !/^https:\/\/(?:www\.)?(x\.com|twitter\.com)\/[^/]+\/status\/\d+/.test(tab.url || "")
    )
      throw new Error("Mở permalink bài X hoặc dán link hợp lệ.");
    const [x] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["language.js", "x-media.js", "extract.js"],
    });
    if (!x?.result || x.result.error) throw new Error(x?.result?.error || "Không đọc được bài.");
    post = { ...x.result, tabId: tab.id };
    replyHistory = [];
    result = null;
    $("postUrl").value = post.url;
    $("postText").value = post.text;
    $("postDisplayName").textContent = post.displayName || post.username;
    $("postMeta").textContent = `@${post.username}`;
    const avatar = $("postAvatar");
    avatar.src = post.avatarUrl || "";
    avatar.hidden = !post.avatarUrl;
    const preview = $("postPreview");
    preview.replaceChildren();
    for (const url of post.previewMediaUrls || []) {
      let media;
      if (/^https:\/\/pbs\.twimg\.com\/media\//.test(url)) {
        media = document.createElement("img");
        media.alt = "Media bài viết";
      } else if (/^https:\/\/video\.twimg\.com\//.test(url)) {
        media = document.createElement("video");
        media.controls = true;
        media.muted = true;
        media.preload = "metadata";
      }
      if (media) {
        media.src = url;
        preview.append(media);
      }
    }
    preview.hidden = !preview.children.length;
    $("warning").textContent = post.warning;
    $("warning").hidden = !post.warning;
    status("");
    if ($("panelAutoSuggest").checked) await generate(false);
  } finally {
    reading = false;
  }
}
let pendingLinkLoad = false;
async function loadUrl() {
  const url = $("postUrl").value.trim();
  if (!/^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[^/]+\/status\/\d+/.test(url))
    throw new Error("Link phải có dạng x.com/user/status/id.");
  const tab = await activeTab();
  if (tab?.url?.split(/[?#]/)[0] !== url.split(/[?#]/)[0]) {
    pendingLinkLoad = true;
    await chrome.tabs.update(tab.id, { url });
    status("Đang mở bài viết…");
    return;
  }
  await readPost();
}
async function generate(force) {
  if (!post) await readPost();
  const s = await chrome.storage.local.get([
    "provider",
    "apiKey",
    "apiModel",
    "chatgptModel",
    "geminiKey",
    "geminiKeys",
    "geminiModel",
    "deepseekKey",
    "deepseekModel",
    "stylePrompt",
    "styleMinWords",
    "styleMaxWords",
    "replyTone",
    "fastReplyMode",
  ]);
  const provider = s.provider || "gemini";
  if (provider === "chatgpt" && !s.chatgptModel) throw new Error("Kết nối ChatGPT và chọn model.");
  if (provider === "gemini" && !s.geminiKey) throw new Error("Kết nối Gemini trong Cài đặt.");
  if (provider === "deepseek" && !s.deepseekKey)
    throw new Error("Kết nối DeepSeek API trong Cài đặt.");
  if (provider === "api" && !/^sk-/.test(s.apiKey || ""))
    throw new Error("Kết nối OpenAI API trong Cài đặt.");
  const model =
    provider === "chatgpt"
      ? s.chatgptModel
      : provider === "gemini"
        ? s.geminiModel || "gemini-3.1-flash-lite"
        : provider === "deepseek"
          ? s.deepseekModel || "deepseek-flash"
          : s.apiModel || "gpt-4.1-mini";
  $("results").hidden = false;
  $("cards").innerHTML =
    '<div class="panel-loading"><span class="panel-loading-spinner"></span><span class="panel-loading-label">Đang viết gợi ý…</span></div>';
  status("");
  const style =
    styles.find((x) => x.id === $("panelQuickStyle").value)?.prompt ||
    s.stylePrompt ||
    DEFAULT_STYLES[0].prompt;
  const r = await chrome.runtime.sendMessage({
    type: "suggest",
    provider,
    force,
    apiKey: s.apiKey,
    geminiKey: s.geminiKey,
    geminiKeys: s.geminiKeys,
    deepseekKey: s.deepseekKey,
    model,
    post: {
      ...post,
      text: $("postText").value,
      style: toneStyle(style, s.replyTone),
      styleWordRange: {
        min: Math.min(100, Math.max(1, Number(s.styleMinWords) || 6)),
        max: Math.min(
          100,
          Math.max(
            Math.min(100, Math.max(1, Number(s.styleMinWords) || 6)),
            Number(s.styleMaxWords) || 10,
          ),
        ),
      },
      replyCount: Number($("panelReplyCount").value) || 2,
      fastMode: !!s.fastReplyMode,
      context: $("quickContext").value,
      excludeReplies: force ? replyHistory : [],
    },
  });
  if (!r?.ok) throw new Error(r?.error || "Không tạo được gợi ý.");
  render(r.data);
}
async function useReply(text) {
  const tab = await activeTab(),
    current = tab?.url?.match(/\/status\/(\d+)/)?.[1];
  if (tab?.id && current === post?.postId) {
    const submit = $("panelAutoReply").checked,
      r = await chrome.tabs
        .sendMessage(tab.id, { type: "fillReply", text, submit })
        .catch(() => null);
    if (r?.ok) {
      status(submit ? "Đã đăng trả lời." : "Đã điền vào ô trả lời.");
      return;
    }
  }
  await navigator.clipboard.writeText(text);
  status("Link đang mở không khớp — đã copy gợi ý.");
}
async function openMediaSuggestion(suggestion) {
  const tab = await activeTab();
  if (!tab?.id) throw new Error("Không tìm thấy tab bài viết.");
  const response = await chrome.tabs
    .sendMessage(tab.id, {
      type: "openMediaPicker",
      query: suggestion.query,
      kind: suggestion.kind,
    })
    .catch(() => null);
  if (!response?.ok) throw new Error(response?.error || "Không mở được bộ chọn GIF/ảnh.");
}
function render(data) {
  result = data.result;
  replyHistory = [
    ...new Set([...replyHistory, ...(result.replies || []).map((x) => x.reply).filter(Boolean)]),
  ].slice(-30);
  result.replies.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));
  $("results").hidden = false;
  $("cards").replaceChildren();
  result.replies.forEach((item) => {
    const wrap = document.createElement("div"),
      b = document.createElement("button"),
      row = document.createElement("span"),
      text = document.createElement("span"),
      score = document.createElement("span");
    wrap.className = "suggestion-wrap";
    const issues = Array.isArray(item.quality_issues) ? item.quality_issues : [];
    if (issues.length) wrap.classList.add("quality-flagged");
    b.className = "suggestion-card reply-suggestion";
    row.className = "suggestion-main";
    appendReplyQualityText(text, item.reply, issues);
    score.className = "relevance-score";
    if (issues.length) {
      score.classList.add("quality-low");
      score.title = "Điểm phù hợp đã giảm do có cụm từ sáo cần cân nhắc.";
    }
    score.textContent = `${item.relevance_score}%`;
    row.append(text, score);
    b.append(row);
    if (item.translation_vi) {
      const translation = document.createElement("small");
      translation.className = "reply-translation";
      translation.textContent = item.translation_vi;
      b.append(translation);
    }
    b.onclick = () => safely(() => useReply(item.reply));
    wrap.append(b);
    if (item.media_suggestion?.query) {
      const media = document.createElement("button");
      media.type = "button";
      media.className = "media-suggestion";
      media.textContent = `${item.media_suggestion.kind === "gif" ? "GIF" : "Ảnh/meme"} · ${item.media_suggestion.query}`;
      media.title = item.media_suggestion.reason || "Mở bộ chọn GIF/ảnh";
      media.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        safely(() => openMediaSuggestion(item.media_suggestion));
      };
      wrap.append(media);
    }
    $("cards").append(wrap);
  });
  status("");
}
function appendReplyQualityText(target, value, issues) {
  const text = String(value || ""),
    phrases = [...new Set((Array.isArray(issues) ? issues : []).map((x) => String(x).trim()))]
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
  if (!phrases.length) {
    target.textContent = text;
    return;
  }
  const escaped = phrases.map((phrase) =>
    [...phrase]
      .map((character) => {
        const special = ".^$|?*+()[]{}";
        return special.includes(character) ? "\\" + character : character;
      })
      .join(""),
  );
  const matcher = new RegExp(escaped.join("|"), "giu");
  let cursor = 0;
  for (const match of text.matchAll(matcher)) {
    target.append(document.createTextNode(text.slice(cursor, match.index)));
    const highlight = document.createElement("mark");
    highlight.className = "reply-quality-highlight";
    highlight.textContent = match[0];
    highlight.title = "Cụm sáo bị đánh dấu; điểm phù hợp đã giảm.";
    target.append(highlight);
    cursor = match.index + match[0].length;
  }
  target.append(document.createTextNode(text.slice(cursor)));
}
let usageMode = "x";
async function showMode(_mode = "x") {
  usageMode = "x";
  document.body.dataset.module = "reply";
  document.querySelector(".mode-tabs").hidden = true;
  $("xMode").classList.add("active");
  $("workspace").hidden = true;
  $("xWorkspace").hidden = false;
}
function showSettings(value) {
  const open = !!value;
  $("settingsArea").hidden = !open;
  $("settingsToggle").hidden = false;
  document.body.classList.toggle("settings-open", open);
  document.querySelector("header")?.classList.toggle("settings-open", open);
  $("settingsToggle").innerHTML =
    globalThis.AssistantIcons?.svg(open ? "close" : "gear") || ICON[open ? "close" : "gear"];
  $("settingsToggle").title = open ? "Đóng cài đặt" : "Cài đặt chung và hệ thống";
  $("settingsToggle").setAttribute("aria-label", $("settingsToggle").title);
  if (open) {
    $("replySettings").hidden = true;
    $("workspace").hidden = true;
    $("xWorkspace").hidden = true;
    $("contentWorkspace").hidden = true;
    $("quoteWorkspace").hidden = true;
    $("followWorkspace").hidden = true;
    document.querySelector(".mode-tabs").hidden = true;
  } else showModule(currentModule);
}
function connectionState(ok) {
  connected = !!ok;
  const button = $("credentialState");
  button.classList.toggle("connected", connected);
  button.classList.toggle("failed", !connected);
  button.querySelector("span").textContent = connected ? "Đang kết nối" : "Kết nối";
  $("disconnectCurrent").hidden = true;
}
function setProvider(value, persist = true) {
  currentProvider = value;
  for (const n of ["gemini", "deepseek", "chatgpt", "api"]) {
    $(`${n}Provider`).classList.toggle("active", value === n);
    $(`${n}Pane`).hidden = value !== n;
  }
  $("providerTitle").textContent =
    value === "gemini"
      ? "Google Gemini API"
      : value === "deepseek"
        ? "DeepSeek API"
        : value === "chatgpt"
          ? "Tài khoản ChatGPT"
          : "OpenAI API";
  connectionState(
    value === "gemini"
      ? !!$("geminiKey").value
      : value === "deepseek"
        ? !!$("deepseekKey").value
        : value === "api"
          ? !!$("apiKey").value
          : false,
  );
  if (persist) chrome.storage.local.set({ provider: value });
}
async function refreshChatGPT() {
  const r = await chrome.runtime.sendMessage({ type: "companionStatus" });
  if (!r?.ok) throw new Error(r?.error);
  const d = r.data;
  $("profiles").replaceChildren(
    ...(d.profiles.length
      ? d.profiles.map((p) => new Option(p.label, p.id))
      : [new Option("Chưa kết nối", "")]),
  );
  $("profiles").value = d.activeId || "";
  const active = d.profiles.find((p) => p.id === d.activeId);
  connectionState(!!active?.planEnabled);
  if (active?.planEnabled) {
    const m = await chrome.runtime.sendMessage({ type: "companionModels" });
    if (m?.ok) {
      $("chatgptModels").replaceChildren(...m.data.models.map((x) => new Option(x.name, x.id)));
      const s = await chrome.storage.local.get("chatgptModel");
      if (m.data.models.some((x) => x.id === s.chatgptModel))
        $("chatgptModels").value = s.chatgptModel;
    }
  }
}
function renderStyles(selected) {
  chrome.storage.local
    .set({
      replyStyleCatalog: styles.map(({ id, name, prompt }) => ({
        id,
        name,
        prompt,
      })),
    })
    .catch(() => {});
  const value = selected && styles.some((s) => s.id === selected) ? selected : styles[0].id;
  for (const id of ["style", "panelQuickStyle"])
    $(id).replaceChildren(
      ...styles.map((s) => new Option(s.id === "natural" ? "Mặc định" : s.name, s.id)),
    );
  $("style").value = value;
  $("panelQuickStyle").value = value;
  selectStyle();
  updateStylePreview();
  renderStyleButtons();
}
function stylePreviewText(style, prompt) {
  const value = String(prompt || style?.prompt || "").toLowerCase();
  if (value.includes("tiên hiệp"))
    return [
      "Đạo hữu nói vậy thì đúng là linh khí bữa nay hơi nghịch thiên rồi.",
      "Cơ duyên này nhìn nhỏ mà vận khí lại không hề tầm thường.",
    ];
  if (value.includes("trang trọng") || value.includes("nghiêm túc"))
    return [
      "Ý này khá hợp lý, nhất là khi nhìn vào chi tiết chính của bài.",
      "Điểm đáng chú ý là câu chuyện vẫn giữ được trọng tâm rất rõ.",
    ];
  if (value.includes("phân tích"))
    return [
      "Điểm đáng chú ý là chi tiết nhỏ này lại nói khá nhiều về toàn cảnh.",
      "Nhìn kỹ thì phần quan trọng nằm ở cách mọi thứ đang vận hành phía sau.",
    ];
  if (value.includes("hóm hỉnh") || value.includes("châm biếm"))
    return [
      "Cú này nhìn nhẹ nhàng vậy thôi chứ độ sát thương hơi cao đó.",
      "Tưởng bình thường mà đọc kỹ thấy pha này cũng khá biết chọn thời điểm.",
    ];
  if (value.includes("ngắn") || value.includes("gọn"))
    return [
      "Nhìn vậy là hiểu mood luôn, gọn mà đúng ý.",
      "Câu chuyện ngắn thôi nhưng điểm chính hiện khá rõ.",
    ];
  return [
    "Điểm đáng chú ý là công nghệ này đang tiến gần hơn tới nhu cầu thực tế của người dùng.",
    "Ý tưởng hay, nhưng trải nghiệm sử dụng mới là điều quyết định nó có đi xa được không.",
  ];
}
function styleName(style) {
  return style?.id === "natural" ? "Mặc định" : style?.name || "Mặc định";
}
function renderStyleButtons() {
  const selected = styles.find((x) => x.id === $("style")?.value) || styles[0],
    label = styleName(selected);
  for (const id of ["panelStyleButton", "styleButton"])
    if ($(id))
      $(id).innerHTML =
        `<span>${label}</span><b class="dropdown-icon" aria-hidden="true"><svg class="dropdown-icon-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M12.7071 14.7071C12.3166 15.0976 11.6834 15.0976 11.2929 14.7071L6.29289 9.70711C5.90237 9.31658 5.90237 8.68342 6.29289 8.29289C6.68342 7.90237 7.31658 7.90237 7.70711 8.29289L12 12.5858L16.2929 8.29289C16.6834 7.90237 17.3166 7.90237 17.7071 8.29289C18.0976 8.68342 18.0976 9.31658 17.7071 9.70711L12.7071 14.7071Z" fill="currentColor"/></svg></b>`;
}
function applyStyle(id, persist = true) {
  const chosen = styles.find((x) => x.id === id) || styles[0];
  for (const other of ["style", "panelQuickStyle"]) $(other).value = chosen.id;
  selectStyle();
  if (persist)
    chrome.storage.local.set({
      styleId: chosen.id,
      stylePrompt: chosen.prompt,
    });
  closeStyleModal();
}
function renderStyleModal() {
  const current = $("style")?.value || $("panelQuickStyle")?.value,
    wrap = $("styleOptions");
  if (!wrap) return;
  wrap.replaceChildren(
    ...styles.map((style) => {
      const item = document.createElement("button"),
        text = document.createElement("span"),
        title = document.createElement("b"),
        check = document.createElement("i"),
        preview = document.createElement("em"),
        items = stylePreviewText(style, style.prompt);
      item.type = "button";
      item.className = "style-option";
      item.classList.toggle("active", style.id === current);
      title.textContent = styleName(style);
      preview.textContent = items[0];
      check.textContent = style.id === current ? "✓" : "";
      text.append(title, preview);
      item.append(text, check);
      item.onclick = () => applyStyle(style.id);
      return item;
    }),
  );
}
function openStyleModal() {
  renderStyleModal();
  $("styleModal").hidden = false;
  document.body.classList.add("style-modal-open");
  $("closeStyleModal").focus();
}
function closeStyleModal() {
  $("styleModal").hidden = true;
  document.body.classList.remove("style-modal-open");
}
function updateStylePreview() {
  renderStyleButtons();
  if (!$("styleModal")?.hidden) renderStyleModal();
}
function selectStyle() {
  const s = styles.find((x) => x.id === $("style").value) || styles[0];
  if (!s) return;
  const custom = !!s.custom;
  if (!styleDraftMode) {
    $("stylePrompt").value = s.prompt;
    $("stylePrompt").disabled = !custom || editingStyleId !== s.id;
    $("stylePickerField").hidden = false;
    $("customStyleFields").hidden = editingStyleId !== s.id;
    $("styleName").value = s.name;
    $("deleteStyle").hidden = !custom;
    $("newStyle").hidden = false;
    $("editConfig").hidden = !custom || editingStyleId === s.id;
    $("saveSettings").hidden = editingStyleId !== s.id;
    $("cancelStyle").hidden = editingStyleId !== s.id;
    editingCustom = editingStyleId === s.id;
  }
  updateStylePreview();
  validateStyleDraft();
}
function lockConfig() {
  $("style").disabled = false;
  selectStyle();
}
function hydratePanelIcons() {
  document.querySelectorAll("[data-icon]").forEach((node) => {
    const name = node.dataset.icon;
    if (globalThis.AssistantIcons?.svg) node.innerHTML = globalThis.AssistantIcons.svg(name);
  });
  const get = $("getFollowList");
  if (get && !get.innerHTML) get.innerHTML = globalThis.AssistantIcons?.svg("get") || ICON.help;
  const help = document.querySelector(".follow-help");
  if (help && !help.innerHTML) help.innerHTML = globalThis.AssistantIcons?.svg("help") || "";
  const source = $("contentOpenSources");
  if (source && !source.innerHTML)
    source.innerHTML = globalThis.AssistantIcons?.svg("setting") || ICON.setting;
  const clear = $("clearFollowList");
  if (clear && !clear.innerHTML)
    clear.innerHTML = globalThis.AssistantIcons?.svg("clear-list") || ICON.trash;
}
function setupModelPickers() {
  document
    .querySelectorAll('select[id$="Model"],select[id$="Models"],select#models')
    .forEach((select) => {
      if (select.closest(".model-picker")) return;
      const wrap = document.createElement("div");
      wrap.className = "model-picker";
      select.parentNode.insertBefore(wrap, select);
      wrap.append(select);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "model-picker-button";
      button.innerHTML = '<span></span><span class="dropdown-icon"></span>';
      const popup = document.createElement("div");
      popup.className = "model-picker-popup";
      popup.hidden = true;
      wrap.append(button, popup);
      const draw = () => {
        const selected = select.options[select.selectedIndex];
        button.querySelector("span").textContent = selected?.textContent || "Chọn mô hình";
        popup.replaceChildren(
          ...Array.from(select.options).map((option) => {
            const item = document.createElement("button");
            item.type = "button";
            item.textContent = option.textContent;
            item.classList.toggle("active", option.value === select.value);
            item.onclick = () => {
              select.value = option.value;
              select.dispatchEvent(new Event("change", { bubbles: true }));
              popup.hidden = true;
              draw();
            };
            return item;
          }),
        );
      };
      button.querySelector(".dropdown-icon").innerHTML =
        globalThis.AssistantIcons?.svg("dropdown") || "";
      button.onclick = (event) => {
        event.stopPropagation();
        document.querySelectorAll(".model-picker-popup").forEach((p) => {
          if (p !== popup) p.hidden = true;
        });
        draw();
        popup.hidden = !popup.hidden;
      };
      new MutationObserver(draw).observe(select, { childList: true });
      draw();
    });
  document.addEventListener(
    "click",
    () => document.querySelectorAll(".model-picker-popup").forEach((p) => (p.hidden = true)),
    { once: true },
  );
}
hydratePanelIcons();
setupModelPickers();
for (const [id, name] of [
  ["clearUrl", "remove"],
  ["clearNewsUrl", "remove"],
  ["clearQuotePost", "cancel"],
  ["cancelGeminiQueueKey", "cancel"],
  ["saveGeminiQueueKey", "save"],
  ["cancelStyle", "cancel"],
  ["clearStyleName", "cancel"],
  ["extensionReleaseLink", "source"],
  ["read", "refresh"],
  ["readNews", "refresh"],
  ["regenerate", "refresh"],
  ["newStyle", "plus"],
  ["addGeminiQueueKey", "plus"],
  ["addChatGPT", "plus"],
  ["refreshChatGPT", "refresh"],
  ["settingsToggle", "setting"],
  ["clearFollowList", "clear-list"],
  ["closeSettings", "close"],
  ["saveSettings", "save"],
  ["cancelStyle", "cancel"],
  ["closeStyleModal", "close"],
  ["editConfig", "edit"],
  ["deleteStyle", "trash"],
  ["toggleKey", "eye"],
  ["toggleGeminiKey", "eye"],
  ["toggleDeepseekKey", "eye"],
  ["reloadQuoteDraft", "refresh"],
  ["copyQuoteDraft", "copy"],
])
  if ($(id)) $(id).innerHTML = ICON[name];
if ($("regenerate")) $("regenerate").innerHTML = globalThis.AssistantIcons?.svg("refresh") || "";
if ($("reloadQuoteDraft"))
  $("reloadQuoteDraft").innerHTML = globalThis.AssistantIcons?.svg("reload") || "";
$("copyDraft").innerHTML = globalThis.AssistantIcons?.svg("copy") || ICON.copy;
document
  .querySelectorAll(".config-summary button,.config-summary a")
  .forEach((node) => node.addEventListener("click", (event) => event.stopPropagation()));
$("geminiKeyQueue")?.addEventListener("click", (event) => event.stopPropagation());
document.addEventListener("click", closeKeyMenus);
$("settingsToggle").onclick = () => showSettings($("settingsArea").hidden);
if ($("closeSettings")) $("closeSettings").onclick = () => showSettings(false);
$("panelStyleButton").onclick = openStyleModal;
$("styleButton").onclick = openStyleModal;
$("closeStyleModal").onclick = closeStyleModal;
document.querySelectorAll("[data-close-style]").forEach((node) => (node.onclick = closeStyleModal));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("styleModal").hidden) closeStyleModal();
});
$("read").onclick = () => safely(readPost);
$("clearUrl").onclick = () => {
  $("postUrl").value = "";
  $("postUrl").focus();
};
let linkTimer;
$("postUrl").oninput = () => {
  clearTimeout(linkTimer);
  const value = $("postUrl").value.trim();
  if (/^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[^/]+\/status\/\d+/.test(value))
    linkTimer = setTimeout(() => safely(loadUrl), 350);
};
$("generate").onclick = () => safely(() => generate(false));
$("regenerate").onclick = () => safely(() => generate(true));
$("autoDetect").onchange = () => chrome.storage.local.set({ autoDetect: $("autoDetect").checked });
$("panelAutoSuggest").onchange = () => {
  const auto = $("panelAutoSuggest").checked;
  chrome.storage.local.set({ panelAutoSuggest: auto });
  document.querySelector(".post-card .actions").hidden = auto;
};
$("panelAutoReply").onchange = () =>
  chrome.storage.local.set({ autoReply: $("panelAutoReply").checked });
$("hideAds").onchange = () => chrome.storage.local.set({ hideAds: $("hideAds").checked });
$("xMode").onclick = () => showMode("x");
async function setDirectReplyEnabled(enabled) {
  $("directReplyToggle").checked = !!enabled;
  await chrome.storage.local.set({ usageMode: enabled ? "x" : "panel" });
  const tab = await activeTab().catch(() => null);
  if (tab?.id && /^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//.test(tab.url || ""))
    chrome.tabs
      .sendMessage(tab.id, { type: "usageMode", mode: enabled ? "x" : "panel" })
      .catch(() => {});
}
$("directReplyToggle").onchange = () =>
  safely(() => setDirectReplyEnabled($("directReplyToggle").checked));
let quoteDraftEditing = false,
  quoteDraftEditingTimer;
$("replyModule").onclick = () => showModule("reply");
$("contentModule").onclick = () => showModule("content");
$("feedbackModule").onclick = () => showModule("feedback");
$("followModule").addEventListener("click", () => showModule("follow"));
$("readNews").onclick = () => safelyContent(readNews);
$("loadNewsUrl").onclick = () => safelyContent(loadNewsUrl);
$("clearNewsUrl").onclick = () => {
  $("newsUrl").value = "";
  $("newsUrl").focus();
};
$("composeNews").onclick = () => safelyContent(composeNews);
$("copyDraft").onclick = () =>
  safelyContent(async () => {
    await navigator.clipboard.writeText($("newsDraft").value);
    $("contentStatus").textContent = "Đã sao chép bản nháp.";
  });
$("copyQuoteDraft").onclick = () =>
  safely(async () => {
    const text = $("quoteDraft").value.trim();
    if (!text) throw new Error("Chưa có nội dung trích dẫn để copy.");
    await navigator.clipboard.writeText(text);
  });
$("reloadQuoteDraft").onclick = () => safely(regenerateQuoteDraft);
$("quoteExtraPrompt").oninput = () =>
  chrome.storage.local.set({ quoteExtraPrompt: $("quoteExtraPrompt").value });
$("quoteDraft").oninput = () => {
  quoteDraftEditing = true;
  clearTimeout(quoteDraftEditingTimer);
  quoteDraftEditingTimer = setTimeout(() => {
    quoteDraftEditing = false;
  }, 600);
  updateQuoteWordCount();
  chrome.storage.local
    .get("quoteAnalysisState")
    .then(({ quoteAnalysisState = {} }) =>
      chrome.storage.local.set({
        quoteAnalysisState: {
          ...quoteAnalysisState,
          status: "ready",
          draft: $("quoteDraft").value,
          updatedAt: Date.now(),
          edited: true,
        },
      }),
    )
    .catch(() => {});
};
$("credentialState").onclick = () => {
  if (connected) {
    $("disconnectCurrent").hidden = !$("disconnectCurrent").hidden;
    return;
  }
  const id =
    currentProvider === "chatgpt"
      ? "connectChatGPT"
      : currentProvider === "gemini"
        ? "connectGemini"
        : currentProvider === "deepseek"
          ? "connectDeepseek"
          : "testConnection";
  $(id).click();
};
$("disconnectCurrent").onclick = () => {
  const id =
    currentProvider === "chatgpt"
      ? "disconnectChatGPT"
      : currentProvider === "gemini"
        ? "disconnectGemini"
        : currentProvider === "deepseek"
          ? "disconnectDeepseek"
          : "disconnectApi";
  $(id).click();
  $("disconnectCurrent").hidden = true;
};
$("geminiProvider").onclick = () => setProvider("gemini");
$("deepseekProvider").onclick = () => setProvider("deepseek");
$("chatgptProvider").onclick = () => setProvider("chatgpt");
$("apiProvider").onclick = () => setProvider("api");
$("connectChatGPT").onclick = () =>
  safely(async () => {
    const r = await chrome.runtime.sendMessage({
      type: "authStart",
      profileId: $("profiles").value || null,
    });
    if (!r?.ok) throw new Error(r?.error);
  });
$("addChatGPT").onclick = () => safely(() => chrome.runtime.sendMessage({ type: "authStart" }));
$("refreshChatGPT").onclick = () => safely(refreshChatGPT);
$("disconnectChatGPT").onclick = () =>
  safely(async () => {
    await chrome.runtime.sendMessage({ type: "authDisconnect" });
    await refreshChatGPT();
  });
$("profiles").onchange = () =>
  safely(async () => {
    await chrome.runtime.sendMessage({
      type: "authSelect",
      id: $("profiles").value,
    });
    await refreshChatGPT();
  });
$("chatgptModels").onchange = () =>
  chrome.storage.local.set({ chatgptModel: $("chatgptModels").value });
$("toggleKey").onclick = () => {
  $("apiKey").type = $("apiKey").type === "password" ? "text" : "password";
};
$("toggleGeminiKey").onclick = () => {
  $("geminiKey").type = $("geminiKey").type === "password" ? "text" : "password";
};
$("toggleDeepseekKey").onclick = () => {
  $("deepseekKey").type = $("deepseekKey").type === "password" ? "text" : "password";
};
$("testConnection").onclick = () =>
  safely(async () => {
    const apiKey = $("apiKey").value.trim(),
      apiModel = $("models").value;
    const r = await chrome.runtime.sendMessage({
      type: "testCredential",
      apiKey,
    });
    if (!r?.ok) throw new Error(r?.error);
    await chrome.storage.local.set({ apiKey, apiModel });
    connectionState(true);
  });
$("connectGemini").onclick = () =>
  safely(async () => {
    const geminiKey = $("geminiKey").value.trim(),
      previous = $("geminiModel").value;
    const storedKeys = await chrome.storage.local.get(["geminiKeys"]);
    if (!looksLikeApiKey(geminiKey)) throw new Error("Hãy thêm Gemini API key vào API Key.");
    const r = await chrome.runtime.sendMessage({
      type: "testGemini",
      geminiKey,
      geminiKeys: storedKeys.geminiKeys || [],
    });
    if (!r?.ok) throw new Error(r?.error);
    if (!r.data.models.length) throw new Error("Tài khoản không có model generateContent.");
    const geminiModels = geminiModelOptions(r.data.models);
    $("geminiModel").replaceChildren(...geminiModels.map((m) => new Option(m.name, m.id)));
    $("geminiModel").value = geminiModels.some((m) => m.id === previous)
      ? previous
      : geminiModels.find((m) => m.id === "gemini-3.5-flash-lite")?.id ||
        geminiModels.find((m) => m.id === "gemini-3.1-flash-lite")?.id ||
        geminiModels[0].id;
    const connectedKey = r.data.key || geminiKey;
    const savedGemini = {
      geminiKey: connectedKey,
      geminiModel: $("geminiModel").value,
    };
    if (connectedKey === geminiKey) savedGemini.geminiKeyLabel = "";
    await chrome.storage.local.set(savedGemini);
    geminiPrimaryKey = connectedKey;
    if (connectedKey === geminiKey) geminiPrimaryKeyLabel = "";
    connectionState(true);
    status("Gemini đã kết nối.");
  });
function ensureGeminiQueueLabel() {
  let input = $("geminiQueueLabel");
  if (input) return input;
  input = document.createElement("input");
  input.id = "geminiQueueLabel";
  input.type = "text";
  input.maxLength = 40;
  input.autocomplete = "off";
  input.placeholder = "Tên key (tuỳ chọn)";
  $("saveGeminiQueueKey").before(input);
  input.onkeydown = (event) => {
    if (event.key === "Enter") $("saveGeminiQueueKey").click();
    if (event.key === "Escape") $("cancelGeminiQueueKey").click();
  };
  return input;
}
$("addGeminiQueueKey").onclick = () => {
  if (displayGeminiKeys(geminiStoredKeys).length >= MAX_GEMINI_KEYS) {
    status(`API Key tối đa ${MAX_GEMINI_KEYS} key.`, true);
    return;
  }
  ensureGeminiQueueLabel();
  $("geminiQueueEditor").hidden = false;
  $("geminiQueueKey").type = "password";
  $("geminiQueueKey").focus();
};
$("cancelGeminiQueueKey").onclick = () => {
  $("geminiQueueKey").value = "";
  if ($("geminiQueueLabel")) $("geminiQueueLabel").value = "";
  $("geminiQueueEditor").hidden = true;
};
$("saveGeminiQueueKey").onclick = () =>
  safely(async () => {
    const key = $("geminiQueueKey").value.trim();
    const label = ($("geminiQueueLabel")?.value || "").trim().slice(0, 40);
    const stored = await chrome.storage.local.get(["geminiKey", "geminiKeyLabel", "geminiKeys"]);
    geminiPrimaryKey = stored.geminiKey || geminiPrimaryKey;
    geminiPrimaryKeyLabel = stored.geminiKeyLabel || geminiPrimaryKeyLabel;
    geminiStoredKeys = normalizeGeminiKeys(stored.geminiKeys || []);
    const list = displayGeminiKeys(geminiStoredKeys);
    if (!looksLikeApiKey(key)) throw new Error("API key không hợp lệ.");
    if (list.length >= MAX_GEMINI_KEYS) throw new Error(`API Key tối đa ${MAX_GEMINI_KEYS} key.`);
    if (list.some((x) => x.key === key)) throw new Error("Key này đã có trong danh sách.");
    await saveGeminiKeyList([...list, { id: `gk-${Date.now()}`, key, label, enabled: true }]);
    $("geminiQueueKey").value = "";
    if ($("geminiQueueLabel")) $("geminiQueueLabel").value = "";
    $("geminiQueueEditor").hidden = true;
    status("Đã thêm key vào API Key.");
  });
$("geminiQueueKey").onkeydown = (event) => {
  if (event.key === "Enter") $("saveGeminiQueueKey").click();
  if (event.key === "Escape") $("cancelGeminiQueueKey").click();
};
$("geminiModel").onchange = () =>
  safely(async () => {
    const stored = await chrome.storage.local.get(["geminiKey", "geminiKeyLabel", "geminiKeys"]);
    const keys = normalizeGeminiKeys([
      stored.geminiKey
        ? {
            id: "primary",
            key: stored.geminiKey,
            label: stored.geminiKeyLabel,
            enabled: true,
          }
        : null,
      ...(Array.isArray(stored.geminiKeys) ? stored.geminiKeys : []),
    ]).map((item) => ({
      ...item,
      enabled: true,
      quotaLimited: false,
      quotaAt: "",
    }));
    await chrome.storage.local.set({ geminiModel: $("geminiModel").value });
    if (keys.length) await saveGeminiKeyList(keys);
    status("Đã đổi model và cho phép thử lại các API key.");
  });
$("connectDeepseek").onclick = () =>
  safely(async () => {
    const deepseekKey = $("deepseekKey").value.trim(),
      deepseekModel = $("deepseekModel").value;
    const r = await chrome.runtime.sendMessage({
      type: "testDeepseek",
      deepseekKey,
    });
    if (!r?.ok) throw new Error(r?.error);
    await chrome.storage.local.set({ deepseekKey, deepseekModel });
    connectionState(true);
  });
$("deepseekModel").onchange = () =>
  chrome.storage.local.set({ deepseekModel: $("deepseekModel").value });
$("disconnectGemini").onclick = () =>
  safely(async () => {
    const stored = await chrome.storage.local.get(["geminiKey", "geminiKeyLabel", "geminiKeys"]);
    const preserved = normalizeGeminiKeys([
      ...(Array.isArray(stored.geminiKeys) ? stored.geminiKeys : []),
      stored.geminiKey
        ? {
            id: `gk-${Date.now()}`,
            key: stored.geminiKey,
            label: stored.geminiKeyLabel,
            enabled: true,
          }
        : null,
    ]);
    await chrome.storage.local.set({
      geminiKey: "",
      geminiKeyLabel: "",
      geminiKeys: preserved,
    });
    await chrome.storage.local.remove(["geminiModel"]);
    geminiPrimaryKey = "";
    geminiPrimaryKeyLabel = "";
    geminiStoredKeys = preserved;
    $("geminiKey").value = "";
    $("geminiQueueKey").value = "";
    $("geminiQueueEditor").hidden = true;
    renderGeminiKeys([]);
    connectionState(false);
    status("Đã ngắt kết nối Gemini; danh sách API key vẫn được giữ lại.");
  });
$("disconnectDeepseek").onclick = () =>
  safely(async () => {
    await chrome.storage.local.remove(["deepseekKey", "deepseekModel"]);
    $("deepseekKey").value = "";
    connectionState(false);
    status("Đã xóa DeepSeek API key khỏi trình duyệt.");
  });
$("disconnectApi").onclick = () =>
  safely(async () => {
    await chrome.storage.local.remove(["apiKey", "apiModel"]);
    $("apiKey").value = "";
    connectionState(false);
    status("Đã xóa OpenAI API key khỏi trình duyệt.");
  });
$("style").onchange = () => {
  const chosen = styles.find((x) => x.id === $("style").value) || styles[0];
  $("panelQuickStyle").value = chosen.id;
  selectStyle();
  chrome.storage.local.set({ styleId: chosen.id, stylePrompt: chosen.prompt });
};
const quickStyle = (id) => {
  const chosen = styles.find((x) => x.id === $(id).value) || styles[0];
  for (const other of ["style", "panelQuickStyle"]) $(other).value = chosen.id;
  selectStyle();
  chrome.storage.local.set({ styleId: chosen.id, stylePrompt: chosen.prompt });
};
$("panelQuickStyle").onchange = () => quickStyle("panelQuickStyle");
$("panelReplyCount").onchange = () =>
  chrome.storage.local.set({ replyCount: Number($("panelReplyCount").value) });
$("quickContext").oninput = updateStylePreview;
$("stylePrompt").oninput = updateStylePreview;
$("styleMinWords").onchange = syncStyleWordRange;
$("styleMaxWords").onchange = syncStyleWordRange;
function validateStyleDraft() {
  const input = $("styleName"),
    save = $("saveSettings");
  if (!input || !save) return;
  const name = input.value.trim().toLocaleLowerCase();
  const duplicate = styles.some(
    (x) =>
      x.id !== editingStyleId &&
      x.name.trim().toLocaleLowerCase() === name,
  );
  save.disabled = (!styleDraftMode && !editingStyleId) || !name || duplicate;
}
$("styleName").oninput = () => {
  validateStyleDraft();
  $("clearStyleName").hidden = !$("styleName").value.trim().length;
};
$("clearStyleName").onclick = () => {
  $("styleName").value = "";
  $("clearStyleName").hidden = true;
  $("styleName").focus();
  validateStyleDraft();
};
$("newStyle").onclick = () => {
  styleDraftMode = true;
  editingStyleId = null;
  editingCustom = true;
  $("newStyle").hidden = true;
  $("deleteStyle").hidden = true;
  $("editConfig").hidden = true;
  $("saveSettings").hidden = false;
  $("cancelStyle").hidden = false;
  $("stylePickerField").hidden = true;
  $("customStyleFields").hidden = false;
  $("styleName").value = "";
  $("styleName").focus();
  $("stylePrompt").disabled = false;
  $("stylePrompt").value = CORE_PRESET_RULES;
  validateStyleDraft();
};
$("cancelStyle").onclick = () => {
  styleDraftMode = false;
  editingStyleId = null;
  editingCustom = false;
  $("styleName").value = "";
  $("stylePickerField").hidden = false;
  const chosen = styles.find((x) => x.id === $("style").value) || styles[0];
  if (chosen) selectStyle();
};
$("deleteStyle").onclick = () =>
  safely(async () => {
    const id = $("style").value,
      s = styles.find((x) => x.id === id);
    if (!s?.custom) throw new Error("Chỉ xoá được phong cách tự tạo.");
    styles = styles.filter((x) => x.id !== id);
    const next = styles[0]?.id;
    await chrome.storage.local.set({
      customStyles: styles.filter((x) => x.custom),
      styleId: next,
      stylePrompt: styles[0]?.prompt || DEFAULT_STYLES[0].prompt,
    });
    renderStyles(next);
    lockConfig();
    status("Đã xoá phong cách.");
  });
$("editConfig").onclick = () => {
  const chosen = styles.find((x) => x.id === $("style").value);
  if (!chosen?.custom) return;
  styleDraftMode = false;
  editingStyleId = chosen.id;
  editingCustom = true;
  $("customStyleFields").hidden = false;
  $("stylePrompt").disabled = false;
  $("editConfig").hidden = true;
  $("saveSettings").hidden = false;
  $("cancelStyle").hidden = false;
  $("styleName").focus();
  validateStyleDraft();
};
$("saveSettings").onclick = () =>
  safely(async () => {
    const name = $("styleName").value.trim();
    const duplicate = styles.some(
      (x) =>
        x.id !== editingStyleId &&
        x.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    if (!name || duplicate) return;
    let chosen;
    if (styleDraftMode) {
      chosen = {
        id: `custom-${Date.now()}`,
        name,
        prompt: $("stylePrompt").value.trim() || CORE_PRESET_RULES,
        custom: true,
      };
      styles.push(chosen);
    } else {
      chosen = styles.find((x) => x.id === (editingStyleId || $("style").value));
      if (chosen?.custom) {
        chosen.name = name;
        chosen.prompt = $("stylePrompt").value.trim() || chosen.prompt;
      }
    }
    await chrome.storage.local.set({
      styleId: chosen.id,
      stylePrompt: chosen.prompt,
      customStyles: styles.filter((x) => x.custom),
      configSaved: true,
    });
    styleDraftMode = false;
    editingStyleId = null;
    editingCustom = !!chosen.custom;
    renderStyles(chosen.id);
    lockConfig();
    status("Đã lưu phong cách.");
  });
chrome.tabs.onUpdated.addListener((_id, change) => {
  if (
    currentModule === "content" &&
    pendingNewsLoad &&
    _id === pendingNewsTabId &&
    change.status === "complete"
  ) {
    pendingNewsLoad = false;
    setTimeout(() => safelyContent(readNews), 350);
  }
});
function quoteChars(text) {
  return Array.from(String(text || "")).length;
}
function updateQuoteWordCount() {
  const count = quoteChars($("quoteDraft").value);
  $("quoteWordCount").textContent = count + " ký tự";
}
async function readCurrentQuotePost() {
  const tab = await activeTab();
  if (!tab?.id || !/^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//.test(tab.url || ""))
    return null;
  const response = await chrome.tabs
    .sendMessage(tab.id, { type: "readQuotePost" })
    .catch(() => null);
  return response?.ok ? response.post : null;
}
async function regenerateQuoteDraft() {
  const saved = await chrome.storage.local.get([
    "quoteAnalysisState",
    "provider",
    "apiKey",
    "apiModel",
    "geminiKey",
    "geminiKeys",
    "geminiModel",
    "deepseekKey",
    "deepseekModel",
    "fastReplyMode",
  ]);
  const state = saved.quoteAnalysisState || {};
  let post = state.quotePost;
  if (!post) post = await readCurrentQuotePost();
  if (!post)
    throw new Error(
      "Chưa đọc được bài trích dẫn để tạo lại. Hãy mở bài viết rồi bấm icon phân tích hoặc thử lại.",
    );
  const provider = saved.provider || "gemini",
    model =
      provider === "gemini"
        ? /gemini-2\.(?:5|0)-flash-lite/i.test(saved.geminiModel || "")
          ? "gemini-3.5-flash-lite"
          : saved.geminiModel || "gemini-3.1-flash-lite"
        : provider === "deepseek"
          ? saved.deepseekModel || "deepseek-flash"
          : saved.apiModel || "gpt-4.1-mini",
    extraInstruction = $("quoteExtraPrompt").value.trim();
  try {
    await chrome.storage.local.set({
      quoteExtraPrompt: extraInstruction,
      quoteAnalysisState: {
        ...state,
        status: "loading",
        postUrl: post.url || state.postUrl,
        quotePost: { ...post, mediaInline: [] },
        draft: "",
        updatedAt: Date.now(),
      },
    });
    const request = chrome.runtime.sendMessage({
        type: "composeQuotePost",
        provider,
        model,
        apiKey: saved.apiKey,
        geminiKey: saved.geminiKey,
        geminiKeys: saved.geminiKeys,
        deepseekKey: saved.deepseekKey,
        extraInstruction,
        post: { ...post, fastMode: true },
      }),
      timeout = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Tạo lại nội dung trích dẫn quá lâu. Hãy bấm thử lại.")),
          45000,
        ),
      );
    const r = await Promise.race([request, timeout]);
    if (!r?.ok) throw new Error(r?.error || "Không tạo lại được nội dung trích dẫn.");
    await chrome.storage.local.set({
      quoteAnalysisState: {
        ...state,
        status: "ready",
        postUrl: post.url || state.postUrl,
        quotePost: { ...post, mediaInline: [] },
        draft: r.data.draft,
        model: r.data.model,
        updatedAt: Date.now(),
      },
    });
  } catch (error) {
    await chrome.storage.local.set({
      quoteAnalysisState: {
        ...state,
        status: "error",
        postUrl: post.url || state.postUrl,
        quotePost: { ...post, mediaInline: [] },
        draft: state.draft || $("quoteDraft").value || "",
        updatedAt: Date.now(),
        error: discreet(error.message),
      },
    });
    throw error;
  }
}
function renderQuoteState(state = {}) {
  const status = $("quoteStatus"),
    draft = $("quoteDraft"),
    copy = $("copyQuoteDraft"),
    reload = $("reloadQuoteDraft"),
    source = $("quoteSource");
  if (
    document.activeElement !== draft ||
    state.status === "loading" ||
    (state.status === "ready" && !quoteDraftEditing)
  )
    draft.value = state.draft || "";
  updateQuoteWordCount();
  copy.disabled = !draft.value.trim();
  const loadingFresh =
    state.status === "loading" && state.updatedAt && Date.now() - state.updatedAt < 45000;
  reload.disabled = false;
  if (state.status === "loading") {
    status.textContent = loadingFresh
      ? "Đang viết bài trích dẫn phân tích…"
      : "Lần tạo trước quá lâu, có thể bấm tạo lại.";
    copy.disabled = true;
  } else if (state.status === "ready") {
    status.textContent = "";
  } else if (state.status === "error") {
    status.textContent = discreet(state.error || "Không tạo được nội dung trích dẫn.");
  } else status.textContent = "";
}
function normalizeAutoExcludedAuthor(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const linkMatch = raw.match(
    /(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,15})(?:\/|$)/iu,
  );
  const handle = (linkMatch?.[1] || raw.replace(/^@/u, "")).toLowerCase();
  return /^[a-z0-9_]{1,15}$/u.test(handle) ? handle : "";
}
function renderAutoExcludedAuthors(handles = []) {
  const list = $("autoExcludedAuthorsList");
  if (!list) return;
  const normalized = [
    ...new Set(
      (Array.isArray(handles) ? handles : []).map(normalizeAutoExcludedAuthor).filter(Boolean),
    ),
  ].sort();
  list.replaceChildren();
  if (!normalized.length) {
    const empty = document.createElement("small");
    empty.className = "auto-exclusion-empty";
    empty.textContent = "Chưa có tài khoản nào.";
    list.append(empty);
    return;
  }
  for (const handle of normalized) {
    const chip = document.createElement("span");
    chip.className = "auto-exclusion-chip";
    const name = document.createElement("span");
    name.textContent = `@${handle}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.title = `Bỏ @${handle} khỏi danh sách`;
    remove.setAttribute("aria-label", remove.title);
    remove.addEventListener("click", () =>
      safely(async () => {
        const stored = await chrome.storage.local.get("autoReplyExcludedAuthors"),
          next = (stored.autoReplyExcludedAuthors || []).filter(
            (item) => normalizeAutoExcludedAuthor(item) !== handle,
          );
        await chrome.storage.local.set({ autoReplyExcludedAuthors: next });
        renderAutoExcludedAuthors(next);
      }),
    );
    chip.append(name, remove);
    list.append(chip);
  }
}
function setAutoExcludedAuthorsCollapsed(collapsed, persist = true) {
  const toggle = $("autoExcludedAuthorsToggle"),
    body = $("autoExcludedAuthorsBody");
  if (!toggle || !body) return;
  const isCollapsed = !!collapsed;
  body.hidden = isCollapsed;
  toggle.setAttribute("aria-expanded", String(!isCollapsed));
  toggle.title = `${isCollapsed ? "Mở" : "Thu gọn"} tài khoản tự động bỏ qua`;
  toggle.setAttribute("aria-label", toggle.title);
  toggle.classList.toggle("is-expanded", !isCollapsed);
  if (persist)
    chrome.storage.local.set({ autoExcludedAuthorsCollapsed: isCollapsed }).catch(() => {});
}
$("autoExcludedAuthorsToggle")?.addEventListener("click", () => {
  const isExpanded = $("autoExcludedAuthorsToggle")?.getAttribute("aria-expanded") === "true";
  setAutoExcludedAuthorsCollapsed(isExpanded);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.geminiKey || changes.geminiKeyLabel || changes.geminiKeys)) {
    if (changes.geminiKey) {
      geminiPrimaryKey = changes.geminiKey.newValue || "";
    }
    if (changes.geminiKeyLabel) {
      geminiPrimaryKeyLabel = changes.geminiKeyLabel.newValue || "";
    }
    $("geminiKey").value = geminiPrimaryKey;
    renderGeminiKeys(changes.geminiKeys?.newValue || geminiStoredKeys);
  }
  if (area === "local" && changes.quoteAnalysisState)
    renderQuoteState(changes.quoteAnalysisState.newValue || {});
  if (area === "local" && changes.replyTone && $("replyTone"))
    $("replyTone").value = changes.replyTone.newValue || "";
  if (area === "local" && changes.autoReplyExcludedAuthors)
    renderAutoExcludedAuthors(changes.autoReplyExcludedAuthors.newValue || []);
  if (area === "local" && changes.autoExcludedAuthorsCollapsed)
    setAutoExcludedAuthorsCollapsed(changes.autoExcludedAuthorsCollapsed.newValue, false);
  if (
    area === "local" &&
    (changes.panelAutoSuggest || changes.autoReply) &&
    !selectedAutoFlowRunning
  )
    syncPanelAutoModeControls();
});
safely(async () => {
  const s = await chrome.storage.local.get([
    "provider",
    "apiKey",
    "apiModel",
    "geminiKey",
    "geminiKeyLabel",
    "geminiKeys",
    "geminiModel",
    "deepseekKey",
    "deepseekModel",
    "autoDetect",
    "panelAutoSuggest",
    "autoReply",
    "usageMode",
    "styleId",
    "styleMinWords",
    "styleMaxWords",
    "replyTone",
    "customStyles",
    "replyCount",
    "configSaved",
    "hideAds",
    "autoReplyExcludedAuthors",
    "autoExcludedAuthorsCollapsed",
    "quoteAnalysisState",
    "quoteExtraPrompt",
  ]);
  $("apiKey").value = s.apiKey || "";
  $("models").value = s.apiModel || "gpt-4.1-mini";
  geminiPrimaryKey = s.geminiKey || "";
  geminiPrimaryKeyLabel = s.geminiKeyLabel || "";
  $("geminiKey").value = geminiPrimaryKey;
  const normalizedKeys = normalizeGeminiKeys(s.geminiKeys || []);
  // Older builds stored backup keys as strings or records without ids. Migrate
  // that shape once so all keys remain available after an extension update.
  if (
    Array.isArray(s.geminiKeys) &&
    s.geminiKeys.length > 0 &&
    s.geminiKeys.some((item) => typeof item === "string" || !item?.id || !item?.key)
  ) {
    await chrome.storage.local.set({ geminiKeys: normalizedKeys });
  }
  renderGeminiKeys(normalizedKeys);
  $("deepseekKey").value = s.deepseekKey || "";
  $("deepseekModel").value = s.deepseekModel || "deepseek-flash";
  $("autoDetect").checked = !!s.autoDetect;
  $("panelAutoSuggest").checked = !!s.panelAutoSuggest;
  $("panelAutoReply").checked = !!s.autoReply;
  $("hideAds").checked = !!s.hideAds;
  document.querySelector(".post-card .actions").hidden = !!s.panelAutoSuggest;
  for (let i = 1; i <= 10; i++) $("panelReplyCount").append(new Option(i, i));
  $("panelReplyCount").value = String(s.replyCount || 2);
  $("styleMinWords").value = String(Math.min(100, Math.max(1, Number(s.styleMinWords) || 6)));
  $("styleMaxWords").value = String(
    Math.min(
      100,
      Math.max(
        Math.min(100, Math.max(1, Number(s.styleMinWords) || 6)),
        Number(s.styleMaxWords) || 10,
      ),
    ),
  );
  $("directReplyToggle").checked = (s.usageMode || "x") === "x";
  usageMode = "x";
  await showMode("x");
  quoteExtraPrompt.value = s.quoteExtraPrompt || "";
  renderQuoteState(s.quoteAnalysisState || {});
  $("replyTone").value = s.replyTone || "";
  $("replyTone").dispatchEvent(new Event("change", { bubbles: true }));
  if (!s.replyTone) setTimeout(highlightTone, 500);
  styles = [
    ...(await loadDefaultStyles()),
    ...(Array.isArray(s.customStyles) ? s.customStyles : []),
  ];
  renderAutoExcludedAuthors(s.autoReplyExcludedAuthors || []);
  setAutoExcludedAuthorsCollapsed(s.autoExcludedAuthorsCollapsed ?? true, false);
  renderStyles(s.styleId);
  setProvider(s.provider || "gemini", false);
  lockConfig();
  if ((s.provider || "gemini") === "chatgpt") await refreshChatGPT();
});
async function notifyPanel(open) {
  const tab = await activeTab().catch(() => null);
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "panelState", open }).catch(() => {});
}
ensurePanelTargetUi();
resolvePanelTarget().finally(() => {
  notifyPanel(true);
  refreshPanelTargets();
});
addEventListener("pagehide", () => notifyPanel(false));

document.addEventListener("visibilitychange", () =>
  notifyPanel(document.visibilityState === "visible"),
);
document.getElementById("openSidePanelSettings")?.addEventListener("click", () => {
  const language = chrome.i18n?.getUILanguage?.() || navigator.language || "";
  const query = /^vi(?:-|$)/i.test(language) ? "Bảng điều khiển Chrome" : "Chrome side panel";
  chrome.tabs.create({
    url: `chrome://settings/?search=${encodeURIComponent(query)}`,
  });
});
addEventListener("beforeunload", () => notifyPanel(false));
const toneInstruction = (tone) =>
  tone === "male"
    ? " Người dùng chọn tone Nam: xưng hô tự nhiên theo ngữ cảnh nam, không phô trương hay suy diễn giới tính người khác."
    : tone === "female"
      ? " Người dùng chọn tone Nữ: xưng hô tự nhiên theo ngữ cảnh nữ, không phô trương hay suy diễn giới tính người khác."
      : "";
function toneStyle(style, tone = $("replyTone")?.value) {
  return String(style || "") + toneInstruction(tone);
}
function highlightTone() {
  const field = $("toneSettings");
  if (!field || $("replyTone")?.value) return;
  field.classList.add("tone-required");
  field.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => $("replyTone")?.focus(), 250);
}
applyAiIconMask(document);
const versionLabel = document.querySelector(".app-version");
if (versionLabel) versionLabel.textContent = chrome.runtime.getManifest().version;
(() => {
  const tone = $("replyTone");
  if (!tone) return;
  tone.addEventListener("change", () => {
    tone.classList.remove("tone-required");
    chrome.storage.local.set({ replyTone: tone.value }).catch(() => {});
  });
  $("settingsToggle")?.addEventListener("click", () => {
    if (!tone.value) setTimeout(highlightTone, 150);
  });
})();

function renderQuotePostPreview(post = {}) {
  const card = $("quotePostCard");
  if (!card) return;
  const shell = document.querySelector("#quoteWorkspace .quote-card");
  if (shell && card.parentElement !== shell) shell.prepend(card);
  if (!post?.url) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  const head = card.querySelector(".quote-post-head");
  const author = card.querySelector("#quotePostAuthor");
  const meta = card.querySelector("#quotePostMeta");
  const text = card.querySelector("#quotePostText");
  const toggle = card.querySelector("#toggleQuotePost");
  const oldMedia = card.querySelector(".quote-post-media");
  oldMedia?.remove();
  const avatar = post.avatarUrl || "";
  author.replaceChildren();
  if (avatar) {
    const image = document.createElement("img");
    image.className = "quote-post-avatar";
    image.src = avatar;
    image.alt = "";
    author.append(image);
  }
  const identity = document.createElement("span");
  identity.className = "quote-post-identity";
  const name = document.createElement("b");
  name.textContent = post.authorName || post.username || "";
  const handle = document.createElement("small");
  handle.textContent = post.handle || "@" + (post.username || "");
  identity.append(name, handle);
  author.append(identity);
  meta.textContent = post.publishedAt ? new Date(post.publishedAt).toLocaleString() : "";
  text.textContent = post.text || "";
  const media = (post.mediaUrls || []).filter(Boolean);
  if (media.length) {
    const mediaBox = document.createElement("div");
    mediaBox.className = "quote-post-media";
    for (const src of media.slice(0, 4)) {
      const image = document.createElement("img");
      image.src = src;
      image.alt = "";
      image.loading = "lazy";
      mediaBox.append(image);
    }
    text.after(mediaBox);
  }
  const long = (post.text || "").length > 280 || media.length > 1;
  toggle.hidden = !long;
  toggle.textContent = "Hiện toàn bộ bài";
  text.classList.remove("expanded");
  toggle.onclick = () => {
    const expanded = text.classList.toggle("expanded");
    toggle.textContent = expanded ? "Thu gọn bài" : "Hiện toàn bộ bài";
  };
}
chrome.storage.local
  .get("quoteAnalysisState")
  .then(({ quoteAnalysisState }) => renderQuotePostPreview(quoteAnalysisState?.quotePost || {}))
  .catch(() => {});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.quoteAnalysisState)
    renderQuotePostPreview(changes.quoteAnalysisState.newValue?.quotePost || {});
});
async function syncQuotePostFromTab() {
  const tab = await activeTab(),
    isStatus = /^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[^/]+\/status\/\d+/.test(
      tab?.url || "",
    );
  const saved = await chrome.storage.local.get("quoteAnalysisState"),
    state = saved.quoteAnalysisState || {};
  if (!isStatus) {
    if (state.quotePost || state.postUrl)
      await chrome.storage.local.set({
        quoteAnalysisState: {
          ...state,
          status: "idle",
          postUrl: "",
          draft: "",
          quotePost: null,
          updatedAt: Date.now(),
        },
      });
    return;
  }
  const post = await readCurrentQuotePost();
  if (!post) {
    if (state.quotePost)
      await chrome.storage.local.set({
        quoteAnalysisState: {
          ...state,
          status: "idle",
          quotePost: null,
          updatedAt: Date.now(),
        },
      });
    return;
  }
  if (state.postUrl !== post.url) {
    await chrome.storage.local.set({
      quoteAnalysisState: {
        ...state,
        status: "idle",
        postUrl: post.url,
        updatedAt: Date.now(),
        draft: "",
        quotePost: { ...post, mediaInline: [] },
      },
    });
  } else {
    const merged = { ...(state.quotePost || {}), ...post };
    if (!state.quotePost?.avatarUrl || !(state.quotePost?.mediaUrls || []).length)
      await chrome.storage.local.set({
        quoteAnalysisState: {
          ...state,
          quotePost: { ...merged, mediaInline: [] },
        },
      });
    else renderQuotePostPreview(merged);
  }
}
syncQuotePostFromTab().catch(() => {});
chrome.tabs.onActivated.addListener((activeInfo) => {
  if (panelWindowId && activeInfo.windowId !== panelWindowId) return;
  if (!panelTargetTabId || panelTargetTabId !== activeInfo.tabId)
    panelTargetTabId = activeInfo.tabId;
  syncQuotePostFromTab().catch(() => {});
  refreshPanelTargets();
});
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === "complete") syncQuotePostFromTab().catch(() => {});
});
function decorateQuotePostCard(post = {}) {
  const card = $("quotePostCard");
  if (!card || !post?.url) return;
  let link = card.querySelector(".quote-post-source");
  if (!link) {
    link = document.createElement("a");
    link.className = "quote-post-source";
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Mở bài đăng";
    card.append(link);
  }
  link.href = post.url;
}
chrome.storage.local
  .get("quoteAnalysisState")
  .then(({ quoteAnalysisState }) => decorateQuotePostCard(quoteAnalysisState?.quotePost || {}))
  .catch(() => {});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.quoteAnalysisState)
    decorateQuotePostCard(changes.quoteAnalysisState.newValue?.quotePost || {});
});
$("clearQuotePost")?.addEventListener("click", async () => {
  const saved = await chrome.storage.local.get("quoteAnalysisState"),
    state = saved.quoteAnalysisState || {};
  await chrome.storage.local.set({
    quoteAnalysisState: {
      ...state,
      quotePost: null,
      postUrl: "",
      draft: "",
      status: "idle",
      updatedAt: Date.now(),
    },
  });
});

document.getElementById("autoReplyFlow")?.addEventListener("change", async () => {
  const enabled = document.getElementById("autoReplyFlow").checked;
  const active = await activeTab();
  const targets =
    active && /^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//.test(active.url || "")
      ? [active]
      : [];
  if (active?.id)
    await chrome.runtime
      .sendMessage({ type: "autoFlowSetTab", tabId: active.id, enabled })
      .catch(() => {});
  await Promise.all(
    targets.map((tab) =>
      chrome.tabs.sendMessage(tab.id, { type: "autoReplyFlow", enabled }).catch(() => null),
    ),
  );
  status(
    enabled ? `Tự động đã bật (${targets.length} tab X trong cửa sổ này).` : "Tự động đã tắt.",
  );
  refreshPanelTargets();
});
async function addAutoExcludedAuthor() {
  const input = $("autoExcludedAuthorInput"),
    handle = normalizeAutoExcludedAuthor(input?.value);
  if (!handle) {
    status("Nhập @username hoặc liên kết hồ sơ X hợp lệ.");
    input?.focus();
    return;
  }
  const stored = await chrome.storage.local.get("autoReplyExcludedAuthors"),
    current = Array.isArray(stored.autoReplyExcludedAuthors)
      ? stored.autoReplyExcludedAuthors.map(normalizeAutoExcludedAuthor).filter(Boolean)
      : [],
    next = [...new Set([...current, handle])];
  await chrome.storage.local.set({ autoReplyExcludedAuthors: next });
  renderAutoExcludedAuthors(next);
  input.value = "";
  input.focus();
  status(`Đã thêm @${handle} vào danh sách tự động bỏ qua.`);
}
$("addAutoExcludedAuthor")?.addEventListener("click", () => safely(addAutoExcludedAuthor));
$("autoExcludedAuthorInput")?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    safely(addAutoExcludedAuthor);
  }
});
chrome.runtime.onMessage.addListener((message, sender) => {
  const sourceTabId = Number(sender?.tab?.id) || null;
  if (panelTargetTabId && sourceTabId && sourceTabId !== panelTargetTabId) return;
  if (message?.type === "autoFlowPauseState") {
    status(message.paused ? "Tự động đang tạm dừng." : "Tự động đang tiếp tục.");
    return;
  }
  if (message?.type !== "autoFlowState") return;
  const toggle = document.getElementById("autoReplyFlow");
  if (toggle) toggle.checked = !!message.enabled;
  selectedAutoFlowRunning = !!message.enabled;
  syncPanelAutoModeControls(selectedAutoFlowRunning);
  if (!message.enabled) status("Tự động đã dừng.");
});
function syncReplySettingsVisibility() {
  const node = document.getElementById("replySettings"),
    settings = document.getElementById("settingsArea");
  if (!node) return;
  const reply = !!settings?.hidden && (document.body.dataset.module || "reply") === "reply";
  node.style.display = reply ? "block" : "none";
}
new MutationObserver(syncReplySettingsVisibility).observe(document.body, {
  attributes: true,
  attributeFilter: ["hidden", "data-module"],
  subtree: true,
});
setTimeout(syncReplySettingsVisibility, 0);
