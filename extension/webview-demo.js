(() => {
  if (globalThis.chrome?.runtime?.id && location.protocol === "chrome-extension:") return;

  globalThis.XRA_DEMO_MODE = true;
  document.documentElement.dataset.demo = "webview";

  const STORAGE_KEY = "xra-webview-demo-storage-v1";
  const samplePost = Object.freeze({
    url: "https://x.com/xra_demo/status/1900000000000000000",
    postId: "1900000000000000000",
    username: "xra_demo",
    displayName: "Assistant Demo",
    text: "Một cấu trúc tốt giúp mỗi module phát triển độc lập mà vẫn giữ đúng hợp đồng chung.",
    visibleContext: "Bản demo chạy trực tiếp trong Codex WebView.",
    language: "vi",
    previewMediaUrls: [],
    mediaUrls: [],
    warning: "",
  });
  const sampleTab = {
    id: 101,
    windowId: 1,
    active: true,
    status: "complete",
    title: "Assistant WebView Demo",
    url: samplePost.url,
  };
  const now = Date.now();
  const seed = {
    demoSeedVersion: 2,
    provider: "gemini",
    geminiKey: "demo-only-not-sent",
    geminiKeyLabel: "Demo WebView",
    geminiModel: "gemini-3.1-flash-lite",
    autoDetect: true,
    panelAutoSuggest: false,
    autoReply: false,
    usageMode: "x",
    styleId: "natural",
    replyCount: 2,
    configSaved: true,
    hideAds: true,
    contentConfig: {
      enabled: true,
      sources: ["https://sosovalue.com/research"],
    },
    contentState: {
      version: 1,
      skipped: [],
      items: [
        {
          id: "demo-inbox",
          status: "inbox",
          url: "https://sosovalue.com/research/demo-architecture",
          title: "Chuẩn hoá kiến trúc trước khi mở rộng module",
          text: "Một registry chung giúp phát hiện component thiếu khai báo, sai context hoặc sai thứ tự tải trước khi extension được phát hành.",
          language: "vi",
          translationStatus: "done",
          translationVi: null,
          publishedAt: new Date(now - 18 * 60_000).toISOString(),
          capturedAt: new Date(now - 17 * 60_000).toISOString(),
        },
        {
          id: "demo-ready",
          status: "ready",
          url: "https://manual.assistant.invalid/demo",
          title: "Bản nháp demo",
          text: "Dữ liệu mô phỏng dùng để kiểm tra giao diện Content trong WebView.",
          language: "vi",
          publishedAt: new Date(now - 65 * 60_000).toISOString(),
          capturedAt: new Date(now - 64 * 60_000).toISOString(),
          drafts: [
            "Source càng có hợp đồng rõ, việc thêm module càng ít rủi ro. Điểm quan trọng không phải chia thật nhiều file, mà là dependency và context tải đều được kiểm tra tự động.",
          ],
          draftJobs: {},
          draftErrors: {},
        },
      ],
    },
    followRecent: [
      {
        id: "demo-follow",
        name: "Assistant Demo",
        handle: "@xra_demo",
        bio: "Tài khoản mô phỏng cho Codex WebView",
        isFollowing: true,
        followsYou: true,
        backFollow: true,
        followedAt: now - 25 * 60_000,
      },
    ],
    feedbackStateV1: {
      handle: "xra_demo",
      posts: [
        {
          id: "1900000000000000000",
          name: "Chuẩn hoá kiến trúc trước khi mở rộng module",
          text: samplePost.text,
          selected: true,
          comments: [
            {
              id: "demo-comment-1",
              text: "Registry giúp bắt lỗi load order rất sớm.",
              responded: false,
            },
            { id: "demo-comment-2", text: "Cách này dễ bảo trì hơn hẳn.", responded: true },
          ],
        },
      ],
      method: "random",
      replyMin: 3,
      replyMax: 5,
      randomMin: 3,
      randomMax: 5,
      newMin: 3,
      newMax: 5,
      continuousWaitMinutes: 30,
      speed: 0,
    },
  };

  const clone = (value) => (value === undefined ? undefined : structuredClone(value));
  const load = () => {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return value?.demoSeedVersion === seed.demoSeedVersion ? value : clone(seed);
    } catch {
      return clone(seed);
    }
  };
  let values = load();
  const persist = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    } catch {}
  };
  persist();

  function eventChannel() {
    const listeners = new Set();
    return {
      addListener(listener) {
        if (typeof listener === "function") listeners.add(listener);
      },
      removeListener(listener) {
        listeners.delete(listener);
      },
      hasListener(listener) {
        return listeners.has(listener);
      },
      dispatch(...args) {
        for (const listener of [...listeners]) {
          try {
            listener(...args);
          } catch (error) {
            console.error(error);
          }
        }
      },
    };
  }

  const storageChanged = eventChannel();
  const runtimeMessage = eventChannel();
  const tabUpdated = eventChannel();
  const tabActivated = eventChannel();
  const tabRemoved = eventChannel();

  function storageSelection(keys) {
    if (keys == null) return clone(values);
    if (typeof keys === "string") return { [keys]: clone(values[keys]) };
    if (Array.isArray(keys))
      return Object.fromEntries(keys.map((key) => [key, clone(values[key])]));
    return Object.fromEntries(
      Object.entries(keys).map(([key, fallback]) => [
        key,
        values[key] === undefined ? clone(fallback) : clone(values[key]),
      ]),
    );
  }

  const storage = {
    async get(keys) {
      return storageSelection(keys);
    },
    async set(next) {
      const changes = {};
      for (const [key, value] of Object.entries(next || {})) {
        const oldValue = clone(values[key]);
        values[key] = clone(value);
        changes[key] = { oldValue, newValue: clone(value) };
      }
      persist();
      if (Object.keys(changes).length) storageChanged.dispatch(changes, "local");
    },
    async remove(keys) {
      const changes = {};
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        if (!(key in values)) continue;
        changes[key] = { oldValue: clone(values[key]), newValue: undefined };
        delete values[key];
      }
      persist();
      if (Object.keys(changes).length) storageChanged.dispatch(changes, "local");
    },
    async clear() {
      const changes = Object.fromEntries(
        Object.entries(values).map(([key, oldValue]) => [key, { oldValue, newValue: undefined }]),
      );
      values = clone(seed);
      persist();
      storageChanged.dispatch(changes, "local");
    },
  };

  const demoReplies = (force = false) => ({
    result: {
      source_language: "vi",
      translation_vi: null,
      replies: [
        {
          reply: force
            ? "Cấu trúc rõ từ đầu thì nâng cấp sau này đỡ phải trả lãi kỹ thuật rất nhiều."
            : "Chuẩn hoá dependency trước rồi mới tách module là hướng khá an toàn và thực tế.",
          translation_vi: null,
          relevance_score: 96,
        },
        {
          reply: force
            ? "Một registry nhỏ nhưng chặn được khá nhiều lỗi chỉ xuất hiện lúc extension khởi động."
            : "Điểm hay là quy tắc này kiểm tra được bằng máy, không phụ thuộc người viết nhớ hay quên.",
          translation_vi: null,
          relevance_score: 91,
        },
      ],
    },
  });

  async function updateContent(message) {
    const state = clone(values.contentState || seed.contentState);
    const config = clone(values.contentConfig || seed.contentConfig);
    if (message.type === "contentList") return { config, state };
    if (message.type === "contentRescan")
      return { message: "Demo WebView đang dùng dữ liệu mô phỏng.", found: 0, added: 0 };
    if (message.type === "contentSaveSources") {
      await storage.set({
        contentConfig: { enabled: !!message.enabled, sources: clone(message.sources || []) },
      });
      return values.contentConfig;
    }
    if (message.type === "contentClear") {
      state.items = state.items.filter((item) => item.status !== "inbox");
    } else if (message.type === "contentBatch") {
      for (const id of message.ids || [])
        await updateContent({ type: "contentAction", id, action: message.action });
      return { count: (message.ids || []).length };
    } else if (message.type === "contentAction") {
      const item = state.items.find((entry) => entry.id === message.id);
      if (message.action === "skip" || message.action === "remove")
        state.items = state.items.filter((entry) => entry.id !== message.id);
      else if (item && message.action === "translate") {
        item.translationVi = item.text;
        item.translationStatus = "done";
      } else if (item && ["queue", "retry"].includes(message.action)) {
        item.status = "ready";
        item.drafts = [
          "Bản demo cho thấy cùng một UI có thể chạy trong Side Panel, popup và Codex WebView mà không nhân bản logic.",
        ];
        item.draftJobs = {};
        item.draftErrors = {};
      }
    } else if (message.type === "contentDraftAction") {
      const item = state.items.find((entry) => entry.id === message.id);
      if (item && message.action === "remove") item.drafts.splice(Number(message.index), 1);
      if (item && message.action === "regenerate")
        item.drafts[Number(message.index)] =
          "Tạo lại trong demo vẫn dùng đúng component thật, chỉ thay backend bằng dữ liệu mô phỏng.";
    } else if (message.type === "contentAddManual") {
      state.items.push({
        id: `demo-manual-${Date.now()}`,
        status: "ready",
        url: message.url || "https://manual.assistant.invalid/",
        title: String(message.text || "Nội dung demo").slice(0, 80),
        text: message.text,
        language: "vi",
        capturedAt: new Date().toISOString(),
        publishedAt: message.publishedAt || "",
        drafts: ["Đây là bản content mô phỏng được tạo ngay trong Codex WebView."],
        draftJobs: {},
        draftErrors: {},
      });
    }
    await storage.set({ contentState: state });
    return { saved: true };
  }

  async function sendRuntimeMessage(message = {}) {
    if (message.type === "panelTarget")
      return { ok: true, data: { tabId: sampleTab.id, url: sampleTab.url } };
    if (message.type === "suggest") return { ok: true, data: demoReplies(!!message.force) };
    if (message.type === "composeNews")
      return {
        ok: true,
        data: {
          draft:
            "Chuẩn hoá source không chỉ để code đẹp hơn. Giá trị thật nằm ở việc lỗi dependency và sai context được phát hiện trước khi phát hành.\n\nTheo mình, đây là lớp nền cần có trước khi tách các module lớn.",
        },
      };
    if (message.type === "composeQuotePost")
      return {
        ok: true,
        data: {
          draft:
            "Điểm đáng chú ý là một panel có thể dùng chung cho Side Panel, popup và WebView nếu phần phụ thuộc trình duyệt được đặt sau một adapter rõ ràng.",
        },
      };
    if (message.type === "testGemini")
      return {
        ok: true,
        data: {
          count: 2,
          key: message.geminiKey,
          models: [
            { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash-Lite" },
            { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash" },
          ],
        },
      };
    if (message.type === "testCredential" || message.type === "testDeepseek")
      return { ok: true, data: { models: [] } };
    if (message.type === "companionStatus")
      return { ok: true, data: { profiles: [], activeId: null } };
    if (message.type === "companionModels") return { ok: true, data: { models: [] } };
    if (message.type === "authStart")
      return { ok: true, data: { url: "https://chatgpt.com/", demo: true } };
    if (message.type?.startsWith("content")) {
      try {
        return { ok: true, data: await updateContent(message) };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    }
    return { ok: true, data: { demo: true } };
  }

  let demoNotice;
  const announce = (text) => {
    if (demoNotice) demoNotice.textContent = text;
  };
  const tabs = {
    onUpdated: tabUpdated,
    onActivated: tabActivated,
    onRemoved: tabRemoved,
    async query() {
      return [clone(sampleTab)];
    },
    async get(id) {
      if (Number(id) !== sampleTab.id) throw new Error("Không tìm thấy tab demo.");
      return clone(sampleTab);
    },
    async update(id, update = {}) {
      if (update.url) sampleTab.url = update.url;
      tabUpdated.dispatch(Number(id), { url: update.url, status: "complete" }, clone(sampleTab));
      return clone(sampleTab);
    },
    async create(options = {}) {
      announce(`Đã mô phỏng mở tab: ${options.url || "trang mới"}`);
      return { ...clone(sampleTab), id: Date.now(), url: options.url || "about:blank" };
    },
    async remove(id) {
      tabRemoved.dispatch(Number(id));
    },
    async sendMessage(_id, message = {}) {
      if (message.type === "autoFlowIdentity") return { ok: true, running: false, paused: false };
      if (message.type === "followReadCurrent") return { ok: false };
      if (message.type === "followCollect")
        return { ok: true, mode: "following", profile: "xra_demo", items: [] };
      return { ok: true, demo: true };
    },
    async reload() {},
  };

  globalThis.chrome = {
    runtime: {
      id: "xra-webview-demo",
      onInstalled: eventChannel(),
      onStartup: eventChannel(),
      onMessage: runtimeMessage,
      getManifest: () => ({ version: "DEMO" }),
      getURL: (path = "") => new URL(path, location.href).href,
      sendMessage: sendRuntimeMessage,
    },
    storage: { local: storage, onChanged: storageChanged },
    tabs,
    windows: { getCurrent: async () => ({ id: 1, focused: true }) },
    scripting: { executeScript: async () => [{ result: clone(samplePost) }] },
    permissions: {
      request: async () => true,
      contains: async () => true,
    },
    i18n: { getUILanguage: () => navigator.language || "vi" },
    alarms: { create() {}, onAlarm: eventChannel() },
    action: { setPopup: async () => {} },
  };

  if (!navigator.clipboard?.writeText) {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        async writeText(text) {
          await storage.set({ demoClipboard: String(text) });
          announce("Đã mô phỏng sao chép vào clipboard.");
        },
      },
    });
  }

  document.addEventListener(
    "DOMContentLoaded",
    () => {
      const banner = document.createElement("aside");
      banner.id = "webviewDemoBanner";
      banner.setAttribute("role", "status");
      banner.innerHTML =
        '<strong>Codex WebView Demo</strong><span>Dữ liệu mô phỏng · giao diện thật</span><small></small><button type="button">Đặt lại</button>';
      demoNotice = banner.querySelector("small");
      banner.querySelector("button").onclick = () => {
        localStorage.removeItem(STORAGE_KEY);
        location.reload();
      };
      document.body.prepend(banner);
    },
    { once: true },
  );
})();
