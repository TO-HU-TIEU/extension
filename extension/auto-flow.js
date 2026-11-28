/* Opt-in home-feed automation with a console dashboard. */
(() => {
  if (!globalThis.AutoBotMemory) {
    globalThis.AutoBotMemory = {
      startTime: Date.now(),
      processed: [],
      skipped: [],
      isPaused: false,
      lastStopReason: "",
      speed: 0,
      consecutiveFailures: 0,
      sessionFailures: 0,
      noActionPostIds: new Set(),
      noActionPostCount: 0,
      lastIdleRefreshAt: 0,
    };
  }
  const memory = globalThis.AutoBotMemory;
  if (!(memory.noActionPostIds instanceof Set)) memory.noActionPostIds = new Set();
  memory.noActionPostCount = Math.max(0, Number(memory.noActionPostCount) || 0);
  const sendRuntimeMessage = (message, fallback = null) => {
    try {
      return Promise.resolve(chrome.runtime.sendMessage(message)).catch(() => fallback);
    } catch {
      return Promise.resolve(fallback);
    }
  };
  const persistentSettingsReady = globalThis.AssistantSettingsBackup?.ready || Promise.resolve();
  const persistPageSetting = (key, value) => {
    try {
      localStorage.setItem(key, String(value ?? ""));
    } catch {}
    globalThis.AssistantSettingsBackup?.setPage?.(key, value);
  };
  const markXUsageMode = () => {
    try {
      return Promise.resolve(chrome.storage.local.set({ usageMode: "x" })).catch(() => {});
    } catch {
      return Promise.resolve();
    }
  };
  const isInvalidatedContext = (error) =>
    /extension context invalidated/i.test(String(error?.message || error || ""));
  // X can reject a send attempt with a page-level anti-automation warning.
  // Treat that as a terminal condition for this run. Retrying or clicking the
  // same controls again only increases the chance of a longer account block.
  const readAutomationBlockNotice = () => {
    const patterns = [
      /yêu cầu này\s+trông\s+giống\s+như\s+(?:được\s+)?tự\s+động/i,
      /trông\s+giống\s+như\s+được\s+tự\s+động/i,
      /to\s+protect\s+our\s+users/i,
      /this\s+request\s+looks\s+automated/i,
      /không\s+thể\s+hoàn\s+tất\s+hành\s+động\s+này\s+ngay\s+bây\s+giờ/i,
      /hãy\s+thử\s+chụp\s+một\s+tấm\s+mới/i,
    ];
    const candidates = [
      ...document.querySelectorAll(
        '[role="alert"], [aria-live], [data-testid*="toast" i], [data-testid*="error" i]',
      ),
    ];
    // X exposes the anti-automation notice as a toast/alert. Reading
    // document.body.innerText here forced a full layout/text walk every few
    // hundred milliseconds while waiting for a suggestion and could freeze
    // a large timeline.
    for (const value of candidates.map((node) => node.innerText || node.textContent || "")) {
      const text = String(value).replace(/\s+/gu, " ").trim();
      if (text && patterns.some((pattern) => pattern.test(text))) return text.slice(0, 320);
    }
    return "";
  };
  const runtimeAssetUrl = (path) => {
    try {
      return chrome.runtime.getURL(path);
    } catch {
      return path;
    }
  };
  const syncPauseButton = () => {
    const button = document.querySelector("#assistant-auto-dashboard [data-auto-pause]");
    if (!button) return;
    const label = memory.isPaused ? "Tiếp tục" : "Tạm dừng";
    button.innerHTML = `${globalThis.AssistantIcons?.svg(memory.isPaused ? "play" : "pause") || ""}<span>${label}</span>`;
    button.style.width = "auto";
    button.style.minWidth = "84px";
    button.style.padding = "0 10px";
    button.style.gap = "5px";
    button.style.lineHeight = "1";
    button.style.background = memory.isPaused ? "#20c997" : "#d64555";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.dataset.autoPauseState = memory.isPaused ? "paused" : "running";
  };
  const setPaused = (paused) => {
    const nextPaused = !!paused;
    if (nextPaused && !memory.isPaused && activeRunSegmentStartedAt) {
      activeRunElapsedMs = activeRunElapsed();
      activeRunSegmentStartedAt = 0;
    } else if (!nextPaused && memory.isPaused && running && !memory.isAutoResting) {
      activeRunSegmentStartedAt = Date.now();
    }
    memory.isPaused = nextPaused;
    globalThis.__assistantAutoFlowPaused = memory.isPaused;
    memory.runState = memory.isPaused ? "paused" : running ? "running" : memory.runState;
    syncPauseButton();
    const status = document.querySelector("#assistant-auto-dashboard [data-auto-session-status]");
    if (status) {
      const elapsed = Math.floor((Date.now() - sessionStart) / 60000);
      status.textContent = memory.isAutoResting
        ? "● Nghỉ tự động"
        : memory.isPaused
          ? `● Tạm dừng (${elapsed} phút)`
          : `● ${running ? `Đang chạy (${elapsed} phút)` : "Đã dừng"}`;
    }
    // Reply controls are muted only while the run is actively processing.
    // Notify the content script immediately so pausing restores the saved
    // autoSuggest/autoReply settings in the composer.
    document.dispatchEvent(new Event("assistant-auto-flow-state"));
    console.log(`[Assistant Auto] ${memory.isPaused ? "Tạm dừng" : "Tiếp tục"}`);
    sendRuntimeMessage({
      type: "autoFlowPauseState",
      paused: memory.isPaused,
      runId: memory.runId,
    });
  };
  globalThis.toggleAutoBotPause = () => {
    if (memory.isPaused && !running) return resumeCurrentRun();
    setPaused(!memory.isPaused);
  };
  let running = false,
    timer = 0,
    dailyReplyResetTimer = 0,
    sessionStart = 0,
    activeRunElapsedMs = 0,
    activeRunSegmentStartedAt = 0;
  const activeRunElapsed = () =>
      activeRunElapsedMs + (activeRunSegmentStartedAt ? Date.now() - activeRunSegmentStartedAt : 0),
    endAutoRest = () => {
      if (!memory.isAutoResting) return;
      memory.isAutoResting = false;
      memory.autoRestUntil = 0;
      activeRunElapsedMs = 0;
      activeRunSegmentStartedAt = memory.isPaused || !running ? 0 : Date.now();
      log("Hết thời gian nghỉ · tự động chạy tiếp");
      dashboard();
    },
    startAutoRestIfDue = () => {
      if (!running || memory.isPaused || memory.isAutoResting || !memory.autoRestEnabled) return;
      const intervalMs = Math.max(1, Number(memory.autoRestEveryMinutes) || 30) * 60_000;
      if (activeRunElapsed() < intervalMs) return;
      activeRunElapsedMs = intervalMs;
      activeRunSegmentStartedAt = 0;
      memory.isAutoResting = true;
      const restDurationMs = Math.round(intervalMs / 5),
        restDuration =
          restDurationMs % 60_000 === 0
            ? `${restDurationMs / 60_000} phút`
            : `${Math.ceil(restDurationMs / 1000)} giây`;
      memory.autoRestUntil = Date.now() + restDurationMs;
      log(`Tạm nghỉ tự động ${restDuration} sau ${memory.autoRestEveryMinutes} phút chạy`);
      dashboard();
    };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitIfPaused = async () => {
    while (running) {
      startAutoRestIfDue();
      if (memory.isAutoResting && Date.now() >= memory.autoRestUntil) endAutoRest();
      if (!memory.isPaused && !memory.isAutoResting) return true;
      if (memory.isAutoResting) {
        const status = document.querySelector(
          "#assistant-auto-dashboard [data-auto-session-status]",
        );
        if (status) {
          const remaining = Math.max(0, Math.ceil((memory.autoRestUntil - Date.now()) / 1000));
          status.textContent = `● Nghỉ tự động (${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")})`;
        }
      }
      await sleep(100);
    }
    return false;
  };
  const pauseSleep = async (ms) => {
    if (!(await waitIfPaused())) return false;
    let remaining = ms;
    while (remaining > 0) {
      if (!(await waitIfPaused())) return false;
      const step = Math.min(remaining, 100);
      await sleep(step);
      remaining -= step;
    }
    return running;
  };
  const log = (...a) => {
    const now = new Date();
    const stamp = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    const message = a.map(String).join(" ");
    // Keep the visible log bounded. An unlimited array was reparsed and
    // joined on every event, making long-running sessions progressively
    // slower even after the automation itself had stopped.
    memory.logs = [...(memory.logs || []), `${stamp} ${message}`].slice(-300);
    console.log("[Assistant Auto]", ...a);
    const list = document.querySelector("[data-auto-log-list]");
    if (list) {
      const latest = compactCurrentLog(list.dataset.expanded !== "false");
      list.textContent = latest;
      list.title = latest;
    }
  };
  const compactCurrentLog = (expanded = true) => {
    const entries = (memory.logs || [])
      .map((value) => String(value).replace(/^\d{2}:\d{2}:\d{2}\s+/u, "").trim())
      .filter(Boolean);
    const compact = [];
    for (let index = 0; index < entries.length; index++) {
      const result = entries[index].match(/^Kết quả gợi ý:\s*(\d+)/iu);
      const choice = entries[index + 1]?.match(/^Lựa chọn:\s*(\d+)/iu);
      if (result && choice) {
        compact.push(`Số gợi ý: ${result[1]} | Lựa chọn ${choice[1]}`);
        index += 1;
      } else compact.push(entries[index]);
    }
    return compact.slice(-3).join(expanded ? "\n" : " · ") || "Đang chờ bài tiếp theo";
  };
  const statusLinkForArticle = (article, preferredId = "") => {
    const links = [...(article?.querySelectorAll?.('a[href*="/status/"]') || [])];
    if (!links.length) return null;
    const parsed = links
      .map((link) => {
        try {
          const url = new URL(link.getAttribute("href") || link.href, location.origin);
          const parts = url.pathname.split("/").filter(Boolean);
          const id = parts[1] === "status" ? parts[2] || "" : "";
          return { link, url, parts, id };
        } catch {
          return { link, url: null, parts: [], id: "" };
        }
      })
      .filter(({ parts }) => parts.length === 3 && parts[1] === "status" && /^\d+$/u.test(parts[2] || ""));
    // A card that only exposes a views/analytics/photo link is not safe to open.
    // Skipping it is preferable to clicking a secondary X action by accident.
    if (!parsed.length) return null;
    const articleHandle = String(
      article.querySelector('[data-testid="User-Name"] a[href^="/"]')?.getAttribute("href") || "",
    )
      .replace(/^\//u, "")
      .split(/[/?#]/u)[0]
      .toLowerCase();
    const own = parsed.find(
      ({ parts }) => !articleHandle || String(parts[0] || "").toLowerCase() === articleHandle,
    );
    if (own) return own.link;
    if (preferredId) {
      const preferred = parsed.find(({ id }) => id === String(preferredId));
      if (preferred) return preferred.link;
    }
    return parsed[0].link;
  };
  ((read = (k) => {
    try {
      return JSON.parse(localStorage.getItem(k) || "[]");
    } catch {
      return [];
    }
  }),
    (save = (k, v) => localStorage.setItem(k, JSON.stringify(v))),
    (postId = (a) =>
      statusLinkForArticle(a)?.href.match(/\/status\/(\d+)(?:$|[?#/])/u)?.[1] || ""),
    (own = () =>
      document
        .querySelector('[data-testid^="UserAvatar-Container-"]')
        ?.getAttribute("data-testid")
        ?.replace("UserAvatar-Container-", "")
        .toLowerCase() || ""),
    (ownIdentity = () => {
      const normalizeHandle = (value) =>
        String(value || "")
          .trim()
          .replace(/^@/u, "")
          .replace(/^\/+|\/+$/gu, "")
          .split(/[/?#]/u)[0]
          .toLowerCase();
      const profileNav =
        document.querySelector('[data-testid="AppTabBar_Profile_Link"]') ||
        [...document.querySelectorAll('a[href^="/"]')].find((link) => {
          const label = String(link.innerText || link.textContent || "").trim();
          return label === "Hồ sơ" || link.getAttribute("aria-label") === "Hồ sơ";
        });
      const profileHandle = normalizeHandle(profileNav?.getAttribute("href"));
      const avatarHandle = normalizeHandle(own());
      const handle = profileHandle || avatarHandle;
      const accountButton = document.querySelector(
        '[data-testid="SideNav_AccountSwitcher_Button"]',
      );
      const accountLines = String(
        accountButton?.innerText ||
          accountButton?.textContent ||
          accountButton?.getAttribute("aria-label") ||
          "",
      )
        .split(/\n+/u)
        .map((value) => value.trim())
        .filter(Boolean);
      const displayName =
        accountLines.find(
          (value) =>
            !value.startsWith("@") && value !== "Hồ sơ" && normalizeHandle(value) !== handle,
        ) || "";
      return {
        displayName: displayName.slice(0, 100),
        handle: handle ? `@${handle}` : "",
      };
    }));
  const normalizeAutoTopic = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}+#.-]+/gu, " ")
      .replace(/\s+/gu, " ")
      .trim();
  const autoTopicAliases = {
    crypto: [
      "crypto",
      "tien ma hoa",
      "tien dien tu",
      "bitcoin",
      "ethereum",
      "blockchain",
      "altcoin",
      "token",
      "defi",
      "web3",
      "nft",
    ],
    "nhay cam": [
      "nhay cam",
      "tinh duc",
      "bao luc",
      "tu hai",
      "ma tuy",
      "thu ghet",
      "18+",
    ],
  };
  const matchingAutoTopicRule = (topic, rules) => {
    const value = normalizeAutoTopic(topic);
    if (!value) return "";
    for (const rule of Array.isArray(rules) ? rules : []) {
      const normalized = normalizeAutoTopic(rule);
      if (!normalized) continue;
      const aliases = autoTopicAliases[normalized] || [normalized];
      if (aliases.some((alias) => value.includes(normalizeAutoTopic(alias)))) return rule;
    }
    return "";
  };
  const excludedAuthorSet = async () => {
    try {
      const stored = await chrome.storage.local.get("autoReplyExcludedAuthors");
      return new Set(
        (Array.isArray(stored.autoReplyExcludedAuthors) ? stored.autoReplyExcludedAuthors : [])
          .map((value) =>
            String(value || "")
              .trim()
              .replace(/^@/u, "")
              .toLowerCase(),
          )
          .filter((handle) => /^[a-z0-9_]{1,15}$/u.test(handle)),
      );
    } catch {
      return new Set();
    }
  };
  const likeCurrentPostIfEnabled = async (postIdValue) => {
    let settings = {};
    try {
      settings = await chrome.storage.local.get("autoLike");
    } catch {}
    if (settings?.autoLike !== true) return "disabled";
    const article = [...document.querySelectorAll('article[data-testid="tweet"]')].find(
      (candidate) => postId(candidate) === String(postIdValue),
    );
    const like = article?.querySelector('[data-testid="like"]'),
      alreadyLiked =
        !!article?.querySelector('[data-testid="unlike"]') ||
        like?.getAttribute("aria-pressed") === "true" ||
        /(?:unlike|đã thích|bỏ thích)/iu.test(like?.getAttribute("aria-label") || "");
    if (alreadyLiked) return "already";
    if (!like) return "unknown";
    like.click();
    return "clicked";
  };
  const articleForInteraction = (postIdValue) =>
    [...document.querySelectorAll('article[data-testid="tweet"]')].find(
      (candidate) => postId(candidate) === String(postIdValue),
    ) || null;
  const readInteractionState = (postIdValue, handle = own()) => {
    const article = articleForInteraction(postIdValue),
      like = article?.querySelector('[data-testid="like"],[data-testid="unlike"]'),
      repost = article?.querySelector(
        '[data-testid="retweet"],[data-testid="repost"],[data-testid="unretweet"],[data-testid="unrepost"]',
      ),
      liked = article
        ? !!article.querySelector('[data-testid="unlike"]') ||
          like?.getAttribute("aria-pressed") === "true" ||
          /(?:unlike|đã thích|bỏ thích)/iu.test(like?.getAttribute("aria-label") || "")
        : null,
      reposted = article
        ? !!article.querySelector('[data-testid="unretweet"],[data-testid="unrepost"]') ||
          /(?:undo repost|undo retweet|đã đăng lại|bỏ đăng lại|huỷ đăng lại)/iu.test(
            repost?.getAttribute("aria-label") || "",
          )
        : null,
      replied = article && handle ? domHasOwnReply(handle) : null;
    return { article, liked, reposted, replied };
  };
  const readAutoRepostSettings = async () => {
    try {
      const stored = await chrome.storage.local.get([
        "autoRepost",
        "autoRepostMaxAgeHours",
        "autoRepostTopics",
        "autoRepostAllowedAuthors",
      ]);
      return {
        enabled: stored.autoRepost === true,
        maxAgeHours: Math.max(1, Math.min(8760, Number(stored.autoRepostMaxAgeHours) || 10)),
        topics: Array.isArray(stored.autoRepostTopics)
          ? stored.autoRepostTopics.map((topic) => String(topic || "").trim()).filter(Boolean)
          : ["Ăn uống", "Đồ ăn", "Kinh tế", "Đời sống thường ngày"],
        allowedAuthors: Array.isArray(stored.autoRepostAllowedAuthors)
          ? stored.autoRepostAllowedAuthors
              .map((value) => String(value || "").trim().replace(/^@/u, "").toLowerCase())
              .filter((handle) => /^[a-z0-9_]{1,15}$/u.test(handle))
          : [],
      };
    } catch {
      return { enabled: false, maxAgeHours: 10, topics: [] };
    }
  };
  const repostCurrentPostIfEligible = async (postIdValue, topic, settings) => {
    if (!settings?.enabled) return "disabled";
    if (!settings.topics.length) {
      log("Tự repost đang bật nhưng chưa có chủ đề nào · bỏ repost");
      return "no-topics";
    }
    const matchedTopic = matchingAutoTopicRule(topic, settings.topics);
    if (!matchedTopic) {
      log("Không repost: chủ đề mô hình trả về không khớp danh sách" + (topic ? " · " + topic : ""));
      return "topic-miss";
    }
    const article = articleForInteraction(postIdValue);
    if (!article) return "unknown";
    if (settings.allowedAuthors.length) {
      const permalink = statusLinkForArticle(article, postIdValue)?.href || "",
        author = permalink.match(/\/([^/]+)\/status\//u)?.[1]?.toLowerCase();
      if (!author || !settings.allowedAuthors.includes(author)) {
        log("Không repost: tài khoản không có trong danh sách được phép" + (author ? " · @" + author : ""));
        return "author-not-allowed";
      }
    }
    if (readInteractionState(postIdValue).reposted) {
      log("Đã repost từ trước · không thao tác lại");
      return "already";
    }
    const ageHours = postAgeHours(article);
    if (ageHours === null || ageHours > settings.maxAgeHours) {
      log(ageHours === null ? "Không xác định được tuổi bài · bỏ repost" : "Không repost: bài đã quá " + settings.maxAgeHours + " giờ");
      return "too-old";
    }
    const repostButton = article.querySelector('[data-testid="retweet"],[data-testid="repost"]');
    if (!repostButton) {
      log("Không tìm thấy nút Repost trên bài · bỏ qua thao tác");
      return "button-missing";
    }
    repostButton.click();
    let confirmButton = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      if (!(await waitIfPaused())) return "paused";
      confirmButton =
        document.querySelector('[data-testid="retweetConfirm"],[data-testid="repostConfirm"]') ||
        [...document.querySelectorAll('[role="menuitem"],[role="dialog"] button')].find((candidate) => {
          const label = String(candidate.innerText || candidate.textContent || candidate.getAttribute("aria-label") || "")
            .replace(/\s+/gu, " ").trim().toLocaleLowerCase();
          return /^(?:repost|retweet|đăng lại)$/u.test(label);
        });
      if (confirmButton) break;
      await pauseSleep(150);
    }
    if (!confirmButton) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      log("Không xác nhận được lựa chọn Repost · không gửi thao tác");
      return "confirm-missing";
    }
    confirmButton.click();
    await pauseSleep(500);
    if (!readInteractionState(postIdValue).reposted) {
      log("Đã chọn Repost nhưng chưa xác nhận được trạng thái");
      return "unconfirmed";
    }
    log("Đã repost · chủ đề: " + matchedTopic);
    return "reposted";
  };
  const createRunId = () => {
    // Keep run IDs independent from extension APIs so a stale content script
    // can still finish its local cleanup after the extension is reloaded.
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  };
  const runStorageKey = (runId, kind) => `assistantAutoRun:${runId}:${kind}`;
  if (!memory.runId) memory.runId = createRunId();
  let processedKey = runStorageKey(memory.runId, "processed");
  let skippedKey = runStorageKey(memory.runId, "skipped");
  const notifyPanel = (enabled) =>
    sendRuntimeMessage({ type: "autoFlowState", enabled, runId: memory.runId });
  const coordinate = (action, item) =>
    sendRuntimeMessage(
      {
        type: "autoFlowCoordination",
        action,
        accountKey: own() || "unknown",
        postId: item?.id,
        runId: memory.runId,
        speed: Number(memory.speed || 0),
        minGapMs: Number(memory.autoMinGapMs || 0),
      },
      { data: { granted: false, reason: "coordinator-unavailable" } },
    ).then((response) => response?.data || { granted: false, reason: "no-coordinator-response" });
  if (!globalThis.__assistantAutoErrorLogging) {
    globalThis.__assistantAutoErrorLogging = true;
    window.addEventListener("error", (event) => {
      if (isInvalidatedContext(event.error || event.message)) {
        event.preventDefault();
        running = false;
        clearTimeout(timer);
        return;
      }
      log("Lỗi:", event.error?.message || event.message || "JavaScript error");
    });
    window.addEventListener("unhandledrejection", (event) => {
      if (isInvalidatedContext(event.reason)) {
        event.preventDefault();
        running = false;
        clearTimeout(timer);
        return;
      }
      log("Lỗi:", event.reason?.message || event.reason || "Promise rejection");
    });
  }
  const clearCurrentProcessing = () => {
    memory.logs = [];
    const current = document.querySelector("[data-auto-current-log]");
    const list = document.querySelector("[data-auto-log-list]");
    if (current) current.textContent = "Đang chờ bài tiếp theo";
    if (list) {
      list.textContent = "Đang chờ bài tiếp theo";
      list.title = "Đang chờ bài tiếp theo";
    }
  };
  const hasVietnamese = (text) => {
    const value = String(text || "");
    const marks = value.match(/[ăâđêôơưàáạảãằắặẳẵầấậẩẫèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ]/giu) || [];
    return (
      marks.length >= 2 || /\b(và|của|cho|được|không|một|những|này|đang|với|trong)\b/iu.test(value)
    );
  };
  const isVietnamesePost = (article) => {
    const textNode = article.querySelector('[data-testid="tweetText"]');
    const langNode = textNode?.closest("[lang]") || textNode?.querySelector("[lang]");
    const lang = langNode?.getAttribute("lang")?.toLowerCase();
    const text = textNode?.textContent || "";
    if (lang && !(lang === "vi" || lang.startsWith("vi-"))) return false;
    return hasVietnamese(text);
  };
  const flowDelay = (ms) => {
    const speed = Number(memory.speed || 0);
    const jitter = 0.86 + Math.random() * 0.28;
    // Slow the baseline by another 10%; the slider still applies its relative
    // adjustment on top of this baseline.
    return Math.max(350, Math.round(ms * 1.1781 * (1 - speed * 0.12) * jitter));
  };
  const readMinimumGapSetting = () => {
    const value = Math.max(
        0,
        Math.min(86_400, Number(localStorage.getItem("assistantAutoMinGapValue")) || 30),
      ),
      unit = localStorage.getItem("assistantAutoMinGapUnit") === "minutes" ? "minutes" : "seconds",
      enabled = localStorage.getItem("assistantAutoMinGapEnabled") !== "false";
    memory.autoMinGapEnabled = enabled;
    memory.autoMinGapMs = enabled ? value * (unit === "minutes" ? 60_000 : 1_000) : 0;
    return { enabled, value, unit };
  };
  const dailyReplyDayKey = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  };
  const scheduleDailyReplyReset = () => {
    clearTimeout(dailyReplyResetTimer);
    const now = new Date(),
      nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    dailyReplyResetTimer = setTimeout(
      () => {
        const day = dailyReplyDayKey();
        try {
          localStorage.setItem("assistantAutoDailyReplyCount", JSON.stringify({ day, count: 0 }));
        } catch {}
        dashboard();
        scheduleDailyReplyReset();
      },
      Math.max(1000, nextMidnight.getTime() - now.getTime() + 50),
    );
  };
  const readDailyReplyLimit = () => {
    const value = Math.max(
      1,
      Math.min(5_000, Number(localStorage.getItem("assistantAutoDailyReplyLimit")) || 500),
    );
    memory.autoDailyReplyLimit = value;
    return value;
  };
  const readSkipOldPostsSetting = () => {
    const hours = Math.max(
      1,
      Math.min(8_760, Number(localStorage.getItem("assistantAutoSkipOldPostsHours")) || 12),
    );
    const enabled = localStorage.getItem("assistantAutoSkipOldPostsEnabled") !== "false";
    memory.autoSkipOldPostsEnabled = enabled;
    memory.autoSkipOldPostsHours = hours;
    return { enabled, hours };
  };
  const readIdleRefreshPostsSetting = () => {
    const value = Math.max(
      5,
      Math.min(100, Number(localStorage.getItem("assistantAutoRefreshIdlePosts")) || 20),
    );
    memory.autoRefreshIdlePosts = value;
    return value;
  };
  const postAgeHours = (article) => {
    const datetime = article?.querySelector("time[datetime]")?.getAttribute("datetime");
    const publishedAt = Date.parse(String(datetime || ""));
    if (!Number.isFinite(publishedAt)) return null;
    return Math.max(0, (Date.now() - publishedAt) / 3_600_000);
  };
  const configureSkipOldPostsControl = (box) => {
    if (box.querySelector("[data-auto-skip-old-control]")) return;
    const vietnameseFilter = box.querySelector("[data-auto-vietnamese]")?.closest("label");
    if (!vietnameseFilter) return;
    const setting = document.createElement("label");
    setting.dataset.autoSkipOldControl = "";
    setting.style.cssText =
      "display:flex;align-items:center;flex-wrap:wrap;gap:7px;padding:6px 0;color:var(--xra-text,#edf1f5);font-size:13px";
    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.dataset.autoSkipOldEnabled = "";
    enabled.setAttribute("aria-label", "Bỏ qua những bài quá số giờ đã chọn");
    const label = document.createElement("span");
    label.textContent = "Bỏ qua những bài quá";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.max = "8760";
    input.step = "1";
    input.dataset.autoSkipOldHours = "";
    input.setAttribute("aria-label", "Số giờ để bỏ qua bài cũ");
    input.style.cssText =
      "width:60px;min-width:60px;box-sizing:border-box;padding:5px 7px;border:1px solid var(--xra-border,#303842);border-radius:7px;background:var(--xra-bg,#000);color:var(--xra-text,#e7e9ea);font:inherit";
    const sync = () => {
      const hours = Math.max(1, Math.min(8_760, Number(input.value) || 12));
      input.value = String(hours);
      const isEnabled = enabled.checked;
      memory.autoSkipOldPostsEnabled = isEnabled;
      memory.autoSkipOldPostsHours = hours;
      persistPageSetting("assistantAutoSkipOldPostsHours", hours);
      persistPageSetting("assistantAutoSkipOldPostsEnabled", isEnabled);
      setting.style.opacity = isEnabled ? "1" : "0.55";
      input.disabled = !isEnabled;
    };
    const saved = readSkipOldPostsSetting();
    enabled.checked = saved.enabled;
    input.value = String(saved.hours);
    enabled.addEventListener("change", sync);
    input.addEventListener("change", sync);
    setting.append(enabled, label, input, document.createTextNode("giờ"));
    vietnameseFilter.after(setting);
    sync();
  };
  const configureIdleRefreshPostsControl = (box) => {
    if (box.querySelector("[data-auto-refresh-idle-control]")) return;
    const skipOldRow = box.querySelector("[data-auto-skip-old-control]"),
      vietnameseFilter = box.querySelector("[data-auto-vietnamese]")?.closest("label");
    if (!vietnameseFilter) return;
    const setting = document.createElement("label");
    setting.dataset.autoRefreshIdleControl = "";
    setting.style.cssText =
      "display:flex;align-items:center;flex-wrap:wrap;gap:7px;padding:6px 0;color:var(--xra-text,#edf1f5);font-size:13px";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "5";
    input.max = "100";
    input.step = "1";
    input.dataset.autoRefreshIdlePosts = "";
    input.setAttribute("aria-label", "Số bài không có thao tác trước khi tải lại");
    input.style.cssText =
      "width:60px;min-width:60px;box-sizing:border-box;padding:5px 7px;border:1px solid var(--xra-border,#303842);border-radius:7px;background:var(--xra-bg,#000);color:var(--xra-text,#e7e9ea);font:inherit";
    const sync = () => {
      const value = Math.max(5, Math.min(100, Number(input.value) || 20));
      input.value = String(value);
      memory.autoRefreshIdlePosts = value;
      persistPageSetting("assistantAutoRefreshIdlePosts", value);
    };
    input.value = String(readIdleRefreshPostsSetting());
    input.addEventListener("change", sync);
    setting.append(document.createTextNode("Làm mới sau"), input, document.createTextNode("bài không có thao tác"));
    (skipOldRow || vietnameseFilter).after(setting);
    sync();
  };
  const readDailyReplyCount = () => {
    try {
      const saved = JSON.parse(localStorage.getItem("assistantAutoDailyReplyCount") || "null");
      const day = dailyReplyDayKey();
      if (saved?.day === day) return Math.max(0, Number(saved.count) || 0);
      localStorage.setItem("assistantAutoDailyReplyCount", JSON.stringify({ day, count: 0 }));
      return 0;
    } catch {
      return 0;
    }
  };
  const recordDailyReply = () => {
    const next = { day: dailyReplyDayKey(), count: readDailyReplyCount() + 1 };
    try {
      localStorage.setItem("assistantAutoDailyReplyCount", JSON.stringify(next));
    } catch {}
    return next.count;
  };
  const configureDailyReplyLimitControl = (box) => {
    if (box.querySelector("[data-auto-daily-limit-control]")) return;
    const vietnameseFilter = box.querySelector("[data-auto-vietnamese]")?.closest("label");
    if (!vietnameseFilter) return;
    const setting = document.createElement("label");
    setting.dataset.autoDailyLimitControl = "";
    setting.style.cssText =
      "display:flex;align-items:center;gap:7px;padding:6px 0;color:var(--xra-text,#edf1f5);font-size:13px";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.max = "5000";
    input.step = "1";
    input.dataset.autoDailyLimit = "";
    input.setAttribute("aria-label", "Giới hạn trả lời mỗi ngày");
    input.style.cssText =
      "width:84px;min-width:84px;box-sizing:border-box;padding:5px 7px;border:1px solid var(--xra-border,#303842);border-radius:7px;background:var(--xra-bg,#000);color:var(--xra-text,#e7e9ea);font:inherit";
    const sync = () => {
      const value = Math.max(1, Math.min(5000, Number(input.value) || 500));
      input.value = String(value);
      memory.autoDailyReplyLimit = value;
      persistPageSetting("assistantAutoDailyReplyLimit", value);
    };
    input.value = String(readDailyReplyLimit());
    input.addEventListener("change", sync);
    setting.append(document.createTextNode("Giới hạn trả lời/ngày:"), input);
    vietnameseFilter.after(setting);
  };
  const readConsecutiveFailureLimit = () => {
    const value = Math.max(
      1,
      Math.min(100, Number(localStorage.getItem("assistantAutoConsecutiveFailureLimit")) || 5),
    );
    memory.autoConsecutiveFailureLimit = value;
    return value;
  };
  const configureConsecutiveFailureLimitControl = (box) => {
    if (box.querySelector("[data-auto-failure-limit-control]")) return;
    const restRow = box.querySelector("[data-auto-rest-row]"),
      vietnameseFilter = box.querySelector("[data-auto-vietnamese]")?.closest("label");
    if (!restRow || !vietnameseFilter) return;
    const setting = document.createElement("label");
    setting.dataset.autoFailureLimitControl = "";
    setting.style.cssText =
      "display:flex;align-items:center;flex-wrap:wrap;gap:7px;padding:6px 0;color:var(--xra-text,#edf1f5);font-size:13px";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.max = "100";
    input.step = "1";
    input.dataset.autoFailureLimit = "";
    input.setAttribute("aria-label", "Số lỗi liên tiếp trước khi dừng");
    input.style.cssText =
      "width:60px;min-width:60px;box-sizing:border-box;padding:5px 7px;border:1px solid var(--xra-border,#303842);border-radius:7px;background:var(--xra-bg,#000);color:var(--xra-text,#e7e9ea);font:inherit";
    const sync = () => {
      const value = Math.max(1, Math.min(100, Number(input.value) || 5));
      input.value = String(value);
      memory.autoConsecutiveFailureLimit = value;
      persistPageSetting("assistantAutoConsecutiveFailureLimit", value);
    };
    input.value = String(readConsecutiveFailureLimit());
    input.addEventListener("change", sync);
    setting.append(
      document.createTextNode("Dừng chạy khi lỗi"),
      input,
      document.createTextNode("lần liên tiếp"),
    );
    restRow.after(setting);
  };
  const configureMinimumGapControl = (box) => {
    if (box.querySelector("[data-auto-min-gap-control]")) return;
    const speedInput = box.querySelector("[data-auto-speed]"),
      speedWrap = speedInput?.parentElement;
    if (!speedWrap) return;
    const setting = document.createElement("label");
    setting.dataset.autoMinGapControl = "";
    setting.style.cssText =
      "display:flex;align-items:center;flex-wrap:nowrap;gap:6px;padding:6px 0 3px;color:var(--xra-text,#edf1f5);font-size:13px";
    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.dataset.autoMinGapEnabled = "";
    enabled.setAttribute("aria-label", "Bật thời gian giãn cách tối thiểu");
    const label = document.createElement("span");
    label.textContent = "Thời gian giãn cách tối thiểu";
    label.style.cssText = "flex:0 0 auto;min-width:0;white-space:nowrap;font-weight:400";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = "86400";
    input.step = "1";
    input.dataset.autoMinGapValue = "";
    input.setAttribute("aria-label", "Giá trị thời gian giãn cách tối thiểu");
    input.style.cssText =
      "width:60px;min-width:60px;box-sizing:border-box;padding:6px 7px;border:1px solid var(--xra-border,#303842);border-radius:7px;background:var(--xra-bg,#000);color:var(--xra-text,#e7e9ea);font:inherit";
    const select = document.createElement("select");
    select.dataset.autoMinGapUnit = "";
    select.setAttribute("aria-label", "Đơn vị thời gian giãn cách tối thiểu");
    select.append(new Option("Giây", "seconds"), new Option("Phút", "minutes"));
    select.style.cssText =
      "width:85px;min-width:85px;padding:6px 18px 6px 7px;border:1px solid var(--xra-border,#303842);border-radius:7px;background:var(--xra-bg,#000);color:var(--xra-text,#e7e9ea);font:inherit";
    const sync = () => {
      const value = Math.max(0, Math.min(86_400, Number(input.value) || 0));
      input.value = String(value);
      const unit = select.value === "minutes" ? "minutes" : "seconds";
      const isEnabled = enabled.checked;
      persistPageSetting("assistantAutoMinGapValue", value);
      persistPageSetting("assistantAutoMinGapUnit", unit);
      persistPageSetting("assistantAutoMinGapEnabled", isEnabled);
      memory.autoMinGapEnabled = isEnabled;
      memory.autoMinGapMs = isEnabled ? value * (unit === "minutes" ? 60_000 : 1_000) : 0;
      setting.style.opacity = isEnabled ? "1" : "0.55";
      input.disabled = !isEnabled;
      select.disabled = !isEnabled;
    };
    const saved = readMinimumGapSetting();
    enabled.checked = saved.enabled;
    input.value = String(saved.value);
    select.value = saved.unit;
    enabled.addEventListener("change", sync);
    input.addEventListener("change", sync);
    select.addEventListener("change", sync);
    setting.append(enabled, label, input, select);
    sync();
    speedWrap.after(setting);
  };
  const reorderAutoSetupControls = (box) => {
    const controls = [
      box.querySelector("[data-auto-min-gap-control]"),
      box.querySelector("[data-auto-rest-row]"),
      box.querySelector("[data-auto-vietnamese]")?.closest("label"),
      box.querySelector("[data-auto-skip-old-control]"),
      box.querySelector("[data-auto-refresh-idle-control]"),
      box.querySelector("[data-auto-daily-limit-control]"),
      box.querySelector("[data-auto-failure-limit-control]"),
    ];
    const parent = controls.find(Boolean)?.parentElement;
    if (!parent || controls.some((node) => !node || node.parentElement !== parent)) return;
    const sessionRow = [...box.querySelectorAll("h3")].find(
      (node) => node.textContent.trim() === "Thông tin phiên",
    )?.parentElement;
    if (sessionRow?.parentElement === parent) {
      controls.forEach((node) => parent.insertBefore(node, sessionRow));
    } else {
      controls.forEach((node) => parent.append(node));
    }
    const minGapRow = box.querySelector("[data-auto-min-gap-control]");
    const minGapEnabled = minGapRow?.querySelector("[data-auto-min-gap-enabled]");
    if (minGapRow && minGapEnabled) {
      minGapRow.style.opacity = minGapEnabled.checked ? "1" : "0.55";
      minGapRow
        .querySelector("[data-auto-min-gap-value]")
        ?.toggleAttribute("disabled", !minGapEnabled.checked);
      minGapRow
        .querySelector("[data-auto-min-gap-unit]")
        ?.toggleAttribute("disabled", !minGapEnabled.checked);
    }
    const restRow = box.querySelector("[data-auto-rest-row]");
    const restEnabled = restRow?.querySelector("[data-auto-rest]");
    if (restRow && restEnabled) {
      restRow.style.opacity = restEnabled.checked ? "1" : "0.55";
      restRow
        .querySelector("[data-auto-rest-interval]")
        ?.toggleAttribute("disabled", !restEnabled.checked);
    }
    const vietnameseRow = box.querySelector("[data-auto-vietnamese]")?.closest("label");
    const vietnameseEnabled = vietnameseRow?.querySelector("[data-auto-vietnamese]");
    if (vietnameseRow && vietnameseEnabled)
      vietnameseRow.style.opacity = vietnameseEnabled.checked ? "1" : "0.55";
    const skipOldRow = box.querySelector("[data-auto-skip-old-control]");
    const skipOldEnabled = skipOldRow?.querySelector("[data-auto-skip-old-enabled]");
    if (skipOldRow && skipOldEnabled) {
      skipOldRow.style.opacity = skipOldEnabled.checked ? "1" : "0.55";
      skipOldRow
        .querySelector("[data-auto-skip-old-hours]")
        ?.toggleAttribute("disabled", !skipOldEnabled.checked);
    }
  };
  const domHasOwnReply = (handle) => {
    if (!handle) return false;
    const articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
    return articles
      .slice(1)
      .some((article) =>
        article
          .querySelector('[data-testid="User-Name"]')
          ?.textContent?.toLowerCase()
          .includes(handle.toLowerCase()),
      );
  };
  const isProviderTransportError = (value) =>
    /failed to fetch|network error|network request failed|timed out|signal timed out|aborted/iu.test(
      String(value || ""),
    );
  const isProviderCredentialError = (value) =>
    /api key không hợp lệ|api key not valid|invalid api key|unauthorized|forbidden|credential|nhập .*api key/iu.test(
      String(value || ""),
    );
  const isProviderQuotaError = (value) =>
    /chạm hạn mức|quota|rate.?limit|resource_exhausted|http\s*429/iu.test(String(value || ""));
  const assistantBoxForTarget = (targetId) =>
    [...document.querySelectorAll(".xra-box[data-post-id]")].find(
      (box) => String(box.dataset.postId || "") === String(targetId || ""),
    ) || null;
  const editorFromAssistantBox = (box) => {
    if (!box?.isConnected) return null;
    const host = box.previousElementSibling;
    const selector = '[data-testid^="tweetTextarea_"][contenteditable="true"]';
    const direct = host?.querySelector?.(selector);
    if (direct) return direct;
    // X can wrap the composer one level higher after a route update. Only
    // use the parent fallback when it contains a single editor, so a second
    // composer can never steal this post's reply target.
    const nearby = [...(host?.parentElement?.querySelectorAll?.(selector) || [])];
    return nearby.length === 1 ? nearby[0] : null;
  };
  async function submitSelectedReply(expectedText, handle, targetId) {
    const normalize = (value) =>
      String(value || "")
        .replace(/\s+/gu, " ")
        .trim();
    const normalizeReplyButtonLabel = (value) =>
      normalize(value)
        .normalize("NFKC")
        .replace(/[.…:]+$/gu, "")
        .trim()
        .toLowerCase();
    const replyButtonLabels = new Set([
      "trả lời",
      "reply",
      "répondre",
      "responder",
      "rispondi",
      "antworten",
      "antwoorden",
      "svara",
      "odpowiedz",
      "ответить",
      "відповісти",
      "返信",
      "回复",
      "回覆",
      "답글",
      "yanıtla",
      "balas",
      "ตอบกลับ",
      "رد",
      "जवाब दें",
      "răspunde",
      "odpovědět",
      "svar",
      "vastaa",
      "válasz",
      "απάντηση",
      "השב",
    ]);
    const expected = normalize(expectedText);
    const visible = (node) => {
      if (!node || !node.isConnected) return false;
      const rect = node.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) return false;
      const style = getComputedStyle(node);
      return style.display !== "none" && style.visibility !== "hidden";
    };
    const buttonLabels = (node) =>
      [
        node?.getAttribute?.("aria-label"),
        node?.getAttribute?.("title"),
        node?.innerText,
        node?.textContent,
      ]
        .map((value) => normalizeReplyButtonLabel(value))
        .filter(Boolean);
    // Never click a generic submit button. At least one native label must be
    // exactly a localized reply action; labels such as “Post/Đăng” are absent.
    const isReplyButton = (node) =>
      buttonLabels(node).some((label) => replyButtonLabels.has(label));
    let targetBox = assistantBoxForTarget(targetId);
    const onTargetStatus = () =>
      location.pathname.match(/\/status\/(\d+)(?:\/|$)/)?.[1] === String(targetId || "");
    const findEditor = () => {
      targetBox = assistantBoxForTarget(targetId) || targetBox;
      const candidate = editorFromAssistantBox(targetBox);
      return visible(candidate) ? candidate : null;
    };
    const findSendButton = (candidate) => {
      if (!candidate || !targetBox?.isConnected) return null;
      const selector = '[data-testid="tweetButtonInline"], [data-testid="tweetButton"]';
      const editorForButton = (button) => {
        for (let root = button; root && root !== document.documentElement; root = root.parentElement) {
          if (root.matches?.('[data-testid^="tweetTextarea_"][contenteditable="true"]'))
            return root === candidate ? candidate : null;
          const editors = [
            ...(root.querySelectorAll?.(
              '[data-testid^="tweetTextarea_"][contenteditable="true"]',
            ) || []),
          ];
          if (editors.includes(candidate)) return candidate;
          if (editors.length === 1) return editors[0];
        }
        return null;
      };
      const host = targetBox.previousElementSibling;
      const scopes = [
        host,
        host?.parentElement,
        candidate.parentElement,
        candidate.closest('[role="dialog"]'),
        candidate.closest('article[data-testid="tweet"]'),
        document,
      ].filter(Boolean);
      const buttons = [
        ...new Set(scopes.flatMap((scope) => [...(scope.querySelectorAll?.(selector) || [])])),
      ];
      const enabledReplyButtons = buttons.filter(
        (node) =>
          isReplyButton(node) &&
          visible(node) &&
          !node.disabled &&
          node.getAttribute("aria-disabled") !== "true",
      );
      const matched = enabledReplyButtons.find((node) => editorForButton(node) === candidate);
      if (matched) return matched;
      // During an X DOM refresh the button can briefly sit beside, rather
      // than inside, the subtree used to resolve the editor. If this
      // composer scope has exactly one visible native reply button, it
      // is safe to use that exact-labelled button as the fallback.
      const nearby = enabledReplyButtons.filter(
        (node) => host?.contains(node) || host?.parentElement?.contains(node),
      );
      if (nearby.length === 1) return nearby[0];
      return enabledReplyButtons.length === 1 ? enabledReplyButtons[0] : null;
    };
    let editor = null;
    let send = null;
    for (let attempt = 0; attempt < 30 && running; attempt++) {
      if (!onTargetStatus()) return false;
      const blockNotice = readAutomationBlockNotice();
      if (blockNotice) {
        memory.autoBlockNotice = blockNotice;
        return false;
      }
      if (domHasOwnReply(handle)) return true;
      editor = findEditor();
      const editorText = normalize(editor?.innerText || editor?.textContent);
      if (editor && expected && editorText.includes(expected)) {
        send = findSendButton(editor);
        if (send) break;
      }
      await pauseSleep(250);
    }
    if (!running || !onTargetStatus() || !editor || !send || send.disabled) return false;
    editor = findEditor() || editor;
    const latestText = normalize(editor?.innerText || editor?.textContent);
    send = findSendButton(editor) || send;
    if (
      !visible(editor) ||
      (expected && !latestText.includes(expected)) ||
      !visible(send) ||
      send.disabled ||
      send.getAttribute("aria-disabled") === "true"
    )
      return false;
    const beforeSendBlock = readAutomationBlockNotice();
    if (beforeSendBlock) {
      memory.autoBlockNotice = beforeSendBlock;
      return false;
    }
    send.click();
    for (let attempt = 0; attempt < 32 && running; attempt++) {
      await pauseSleep(250);
      const blockNotice = readAutomationBlockNotice();
      if (blockNotice) {
        memory.autoBlockNotice = blockNotice;
        return false;
      }
      if (domHasOwnReply(handle)) return true;
      const currentEditor = findEditor();
      const remaining = normalize(currentEditor?.innerText || currentEditor?.textContent);
      if (!remaining || domHasOwnReply(handle)) return true;
    }
    return false;
  }
  async function returnHome() {
    if (location.href.includes("/home") || location.pathname === "/") return true;
    const home = document.querySelector('a[data-testid="AppTabBar_Home_Link"]');
    if (home) {
      home.click();
      await pauseSleep(700);
      home.click();
    } else history.back();
    for (let i = 0; i < 16; i++) {
      await pauseSleep(500);
      if (location.href.includes("/home") || location.pathname === "/") {
        return true;
      }
    }
    return false;
  }
  const resetNoActionScan = () => {
    memory.noActionPostIds = new Set();
    memory.noActionPostCount = 0;
  };
  const maybeRefreshAfterIdleScan = () => {
    const threshold = readIdleRefreshPostsSetting();
    if (memory.noActionPostCount < threshold) return false;
    const now = Date.now();
    let lastRefresh = Number(memory.lastIdleRefreshAt) || 0;
    try {
      lastRefresh = Math.max(
        lastRefresh,
        Number(localStorage.getItem("assistantAutoLastIdleRefreshAt")) || 0,
      );
    } catch {}
    if (now - lastRefresh < 120_000) {
      log(`Đã quét ${memory.noActionPostCount} bài không có thao tác · tiếp tục cuộn`);
      resetNoActionScan();
      return false;
    }
    memory.lastIdleRefreshAt = now;
    try {
      localStorage.setItem("assistantAutoLastIdleRefreshAt", String(now));
    } catch {}
    log(`Đã cuộn qua ${memory.noActionPostCount} bài không có thao tác · tải lại trang`);
    clearTimeout(timer);
    running = false;
    globalThis.__assistantAutoFlowRunning = false;
    memory.runState = "reloading";
    document.dispatchEvent(new Event("assistant-auto-flow-state"));
    location.reload();
    return true;
  };
  const noteNoActionPost = (id) => {
    const value = String(id || "");
    if (!value) return false;
    if (!(memory.noActionPostIds instanceof Set)) memory.noActionPostIds = new Set();
    if (memory.noActionPostIds.has(value)) return false;
    memory.noActionPostIds.add(value);
    memory.noActionPostCount = memory.noActionPostIds.size;
    return maybeRefreshAfterIdleScan();
  };
  function dashboard() {
    const p = read(processedKey),
      s = read(skippedKey),
      elapsedMs = Math.max(1_000, Date.now() - (Number(sessionStart) || Date.now())),
      mins = elapsedMs / 60_000,
      d = new Date(sessionStart),
      stamp = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
      title = `[DANH SÁCH] Hoàn thành: ${p.length} | Bỏ qua: ${s.length} | Bắt đầu: ${stamp} | Trung bình: ${(p.length / mins).toFixed(2)} trả lời/phút`;
    if (globalThis.__assistantAutoDebug === true) {
      console.groupCollapsed(`${title} (Click để xem chi tiết)`);
      console.log("Danh sách hoàn thành:");
      console.table(p);
      console.log("Danh sách bỏ qua:");
      console.table(s);
      console.groupEnd();
    }
    const box = document.getElementById("assistant-auto-dashboard");
    if (!box) return;
    const miniBadge = box.querySelector("[data-auto-mini-badge]");
    if (miniBadge) {
      const rate = (p.length / mins)
        .toFixed(2)
        .replace(/\.00$/, "")
        .replace(/(\.\d)0$/, "$1");
      const rateNode = miniBadge.querySelector("[data-auto-mini-rate]"),
        doneNode = miniBadge.querySelector("[data-auto-mini-done]"),
        skippedNode = miniBadge.querySelector("[data-auto-mini-skipped]");
      if (rateNode) rateNode.textContent = `${rate}/p`;
      if (doneNode) doneNode.textContent = String(p.length);
      if (skippedNode) skippedNode.textContent = String(s.length);
      return;
    }
    const formatCompletedAt = (value) => {
      if (!value) return "";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "";
      return ` - ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
    };
    const escapeHtml = (value) =>
      String(value || "").replace(
        /[&<>"']/g,
        (character) =>
          ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
      );
    const elapsed = Math.floor((Date.now() - sessionStart) / 60000);
    const stats = box.querySelector("[data-auto-stats]");
    if (!stats) return;
    const iconMarkup = (name) => globalThis.AssistantIcons?.svg(name) || "";
    stats.innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:8px"><div style="display:grid;grid-template-columns:40px minmax(0,1fr);align-items:stretch;min-height:62px;padding:0;border-radius:8px;overflow:hidden;background:transparent;border:1px solid var(--xra-border,#303842)"><span style="display:grid;place-items:center;width:40px;min-width:40px;height:100%;padding-left:5px;box-sizing:border-box;color:#35a7ee">${iconMarkup("arrow")}</span><span style="display:flex;min-width:0;flex:1;flex-direction:column;justify-content:center;padding:5px 7px"><strong style="display:block;font-size:18px;color:#35a7ee">${(p.length / mins).toFixed(2)}</strong><small style="display:block;color:var(--xra-muted,#9aa4af);font-size:10px;white-space:nowrap">trả lời/phút</small></span></div><div style="display:grid;grid-template-columns:40px minmax(0,1fr);align-items:stretch;min-height:62px;padding:0;border-radius:8px;overflow:hidden;background:transparent;border:1px solid var(--xra-border,#303842)"><span style="display:grid;place-items:center;width:40px;min-width:40px;height:100%;padding-left:5px;box-sizing:border-box;color:#20c997">${iconMarkup("badge-check")}</span><span style="display:flex;min-width:0;flex:1;flex-direction:column;justify-content:center;padding:5px 7px"><strong style="display:block;font-size:18px;color:#20c997">${p.length}</strong><small style="display:block;color:var(--xra-muted,#9aa4af);font-size:10px;white-space:nowrap">Hoàn thành</small></span></div><div style="display:grid;grid-template-columns:40px minmax(0,1fr);align-items:stretch;min-height:62px;padding:0;border-radius:8px;overflow:hidden;background:transparent;border:1px solid var(--xra-border,#303842)"><span style="display:grid;place-items:center;width:40px;min-width:40px;height:100%;padding-left:5px;box-sizing:border-box;color:#ff5864">${iconMarkup("circle-x")}</span><span style="display:flex;min-width:0;flex:1;flex-direction:column;justify-content:center;padding:5px 7px"><strong style="display:block;font-size:18px;color:#ff5864">${s.length}</strong><small style="display:block;color:var(--xra-muted,#9aa4af);font-size:10px;white-space:nowrap">Bỏ qua</small></span></div></div>`;
    const statsGrid = stats.firstElementChild;
    if (statsGrid) {
      statsGrid.style.gap = "6px";
      statsGrid.style.marginBottom = "6px";
    }
    stats.style.margin = "4px 0 6px";
    box.querySelectorAll("[data-auto-stats] > div > div").forEach((card) => {
      card.style.setProperty("background", "transparent", "important");
      card.style.gridTemplateColumns = "32px minmax(0,1fr)";
      card.style.minHeight = "50px";
      card.style.borderRadius = "8px";
      const icon = card.querySelector("span:first-child");
      icon?.style.setProperty("width", "32px");
      icon?.style.setProperty("min-width", "32px");
      icon?.style.setProperty("padding-left", "2px");
      icon?.style.setProperty("box-sizing", "border-box");
      icon?.style.setProperty("font-size", "28px");
      icon?.querySelector("svg")?.style.setProperty("width", "28px");
      icon?.querySelector("svg")?.style.setProperty("height", "28px");
      card.querySelector("strong")?.style.setProperty("font-size", "15px");
      card.querySelector("small")?.style.setProperty("font-size", "9px");
      card.querySelector("span:nth-child(2)")?.style.setProperty("min-width", "0");
      card.querySelector("span:nth-child(2)")?.style.setProperty("padding", "4px 6px");
    });
    const sessionStatus = box.querySelector("[data-auto-session-status]");
    if (sessionStatus)
      sessionStatus.textContent = memory.isAutoResting
        ? "● Nghỉ tự động"
        : memory.isPaused
          ? `● Tạm dừng (${elapsed} phút)`
          : `● ${running ? `Đang chạy (${elapsed} phút)` : "Đã dừng"}`;
    const processedList = box.querySelector("[data-auto-list]");
    if (processedList) {
      processedList.style.maxHeight = "220px";
      processedList.style.overflowY = "auto";
      processedList.style.overflowX = "hidden";
      const nextItems = [
        ...p.map((item) => ({ ...item, __autoStatus: "done" })),
        ...s.map((item) => ({ ...item, __autoStatus: "skipped" })),
      ].sort(
        (a, b) =>
          Number(b.completedAt || b.skippedAt || 0) - Number(a.completedAt || a.skippedAt || 0),
      );
      const listSignature = nextItems
        .map((item) => `${item.__autoStatus}:${item.id}:${item.completedAt || item.skippedAt || 0}`)
        .join("|");
      const listChanged = processedList.dataset.signature !== listSignature;
      processedList.__autoItems = nextItems;
      processedList.__autoRender = () => {
        const items = processedList.__autoItems || [],
          shown = Math.min(Number(processedList.dataset.rendered || 10), items.length);
        processedList.innerHTML =
          items
            .slice(0, shown)
            .map(
              (x) =>
                `<button data-auto-url="${escapeHtml(x.url)}" style="display:block;width:100%;margin:0;padding:7px 0;border:0;border-bottom:1px solid var(--xra-border,#303842);border-radius:0;background:transparent;color:${x.__autoStatus === "skipped" ? "#f5a623" : "#1d9bf0"};text-align:left;font-size:13px;cursor:pointer">${escapeHtml(x.displayName || x.handle || "Tên không xác định")} (@${escapeHtml(x.handle || "user")})${formatCompletedAt(x.completedAt || x.skippedAt)}${x.__autoStatus === "skipped" && x.reason ? ` (${escapeHtml(x.reason)})` : ""}</button>`,
            )
            .join("") || "<small>Chưa có bài đã xử lý</small>";
        processedList.querySelectorAll("[data-auto-url]").forEach(
          (b) =>
            (b.onclick = () => {
              location.href = b.dataset.autoUrl;
            }),
        );
      };
      if (processedList.dataset.total !== String(processedList.__autoItems.length)) {
        processedList.dataset.total = String(processedList.__autoItems.length);
        processedList.dataset.rendered = String(Math.min(10, processedList.__autoItems.length));
        processedList.scrollTop = 0;
      }
      if (!processedList.dataset.lazyBound) {
        processedList.dataset.lazyBound = "true";
        processedList.addEventListener("scroll", () => {
          if (
            processedList.scrollTop + processedList.clientHeight >=
            processedList.scrollHeight - 24
          ) {
            processedList.dataset.rendered = String(
              Math.min(
                Number(processedList.dataset.rendered || 10) + 10,
                (processedList.__autoItems || []).length,
              ),
            );
            processedList.__autoRender?.();
          }
        });
      }
      if (listChanged) {
        processedList.dataset.signature = listSignature;
        processedList.__autoRender();
      }
      box.__autoResizeProcessedCard?.();
    }
    const processedCount = box.querySelector("[data-auto-processed-count]");
    if (processedCount)
      processedCount.textContent = `: ${p.length + s.length} (Hoàn thành ${p.length} | Bỏ qua ${s.length})`;
    const currentLog = box.querySelector("[data-auto-log-list]");
    if (currentLog) {
      const latest = compactCurrentLog(currentLog.dataset.expanded !== "false");
      currentLog.textContent = latest;
      currentLog.title = latest;
    }
    syncPauseButton();
  }
  function configureSpeedControl(box) {
    const input = box?.querySelector("[data-auto-speed]");
    if (!input) return;
    input.min = "-5";
    input.max = "5";
    input.step = "0.5";
    const marks = input.nextElementSibling;
    if (marks)
      marks.innerHTML =
        "<span>-5</span><span>-2.5</span><span>0</span><span>2.5</span><span>5</span>";
    input.value = String(
      Math.max(
        -5,
        Math.min(5, Number(localStorage.getItem("assistantAutoSpeed") || memory.speed || 0)),
      ),
    );
    memory.speed = Number(input.value);
    const output = box.querySelector("[data-auto-speed-value]");
    if (output) output.textContent = String(memory.speed);
    if (input.dataset.autoSpeedBound !== "true") {
      input.dataset.autoSpeedBound = "true";
      input.addEventListener("input", (event) => {
        const value = Math.max(-5, Math.min(5, Number(event.target.value) || 0));
        event.target.value = String(value);
        memory.speed = value;
        persistPageSetting("assistantAutoSpeed", value);
        const valueNode = box.querySelector("[data-auto-speed-value]");
        if (valueNode) valueNode.textContent = String(value);
      });
    }
  }
  const AUTO_DASHBOARD_POSITION_KEY = "assistantAutoDashboardPositionV1";
  const AUTO_DASHBOARD_MIN_HEIGHT = 560;
  function readDashboardPosition() {
    try {
      const value = JSON.parse(localStorage.getItem(AUTO_DASHBOARD_POSITION_KEY) || "null");
      const left = Number(value?.left),
        top = Number(value?.top);
      if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
      return {
        left: Math.max(0, Math.min(Math.max(0, innerWidth - 80), left)),
        top: Math.max(0, Math.min(Math.max(0, innerHeight - 80), top)),
        mode: value?.mode === "free" ? "free" : "default",
      };
    } catch {
      return null;
    }
  }
  function saveDashboardPosition(box) {
    if (!box || box.dataset.minimized === "true") return;
    const left = Number.parseFloat(box.style.left),
      top = Number.parseFloat(box.style.top);
    if (!Number.isFinite(left) || !Number.isFinite(top)) return;
    try {
      const position = JSON.stringify({
        left: Math.round(left),
        top: Math.round(top),
        mode: "free",
      });
      persistPageSetting(AUTO_DASHBOARD_POSITION_KEY, position);
    } catch {}
  }
  function dashboardView() {
    let box = document.getElementById("assistant-auto-dashboard");
    if (box) {
      configureSpeedControl(box);
      configureMinimumGapControl(box);
      configureSkipOldPostsControl(box);
      configureIdleRefreshPostsControl(box);
      configureDailyReplyLimitControl(box);
      configureConsecutiveFailureLimitControl(box);
      reorderAutoSetupControls(box);
      box.__autoSyncViewport?.();
      syncPauseButton();
      return box;
    }
    box = document.createElement("aside");
    const syncViewport = () => {
      if (!box.isConnected || box.dataset.minimized === "true") return;
      const available = Math.max(180, innerHeight - 24);
      // The dashboard follows the browser viewport. When the viewport is
      // shorter than the intended compact design height, let the dashboard
      // shrink and scroll internally instead of extending past the window.
      box.style.height = `${available}px`;
      box.style.maxHeight = `${available}px`;
      box.style.minHeight = `${Math.min(AUTO_DASHBOARD_MIN_HEIGHT, available)}px`;
      box.style.overflowY = "auto";
      box.style.overflowX = "hidden";
    };
    box.__autoSyncViewport = syncViewport;
    box.__autoDisposeViewport = () => removeEventListener("resize", syncViewport);
    box.id = "assistant-auto-dashboard";
    box.style.cssText =
      "--xra-font:Roboto,Segoe UI,Arial,sans-serif;--xra-text:var(--xra-color,#e7e9ea);--xra-border:color-mix(in srgb,var(--xra-color,#e7e9ea) 22%,var(--xra-bg,#000));--xra-muted:color-mix(in srgb,var(--xra-color,#e7e9ea) 60%,var(--xra-bg,#000));position:fixed;right:14px;top:auto;bottom:12px;width:min(400px,calc(100vw - 20px));min-width:min(280px,calc(100vw - 20px));min-height:min(240px,calc(100vh - 24px));max-width:calc(100vw - 20px);max-height:calc(100vh - 24px);resize:both;overflow:auto;z-index:2147483647;background:var(--xra-bg,#000);color:var(--xra-color,#e7e9ea);border:1px solid var(--xra-border);border-radius:10px;box-shadow:0 8px 24px #0004;font:12px/1.35 var(--xra-font);padding:10px";
    const savedPosition = readDashboardPosition();
    if (savedPosition?.mode === "free") {
      box.style.left = `${savedPosition.left}px`;
      box.style.top = `${savedPosition.top}px`;
      box.style.bottom = "auto";
      box.style.right = "auto";
    }
    const iconMarkup = (name) => globalThis.AssistantIcons?.svg(name) || "";
    box.innerHTML = `<div data-auto-drag-handle style="display:flex;align-items:center;gap:8px;justify-content:space-between;padding-bottom:12px;border-bottom:1px solid var(--xra-border,#303842);cursor:move;touch-action:none"><span style="display:flex;align-items:center;gap:8px"><img src="${runtimeAssetUrl("assets/logo.svg")}" alt="Assistant" style="width:28px;height:28px"><strong style="font-size:17px;color:var(--xra-text,#edf1f5)">Tự động</strong></span><span style="display:flex;gap:6px"><button data-auto-pause aria-label="Tạm dừng" title="Tạm dừng" style="width:36px;height:32px;padding:0;display:inline-flex;align-items:center;justify-content:center;line-height:0;border:1px solid var(--xra-border,#303842);border-radius:8px;background:#d64555;color:#fff;cursor:pointer;font:700 13px system-ui">${iconMarkup("pause")}</button><button data-auto-minimize aria-label="Thu nhỏ" title="Thu nhỏ" style="width:32px;height:32px;padding:0;display:inline-flex;align-items:center;justify-content:center;line-height:1;border:1px solid var(--xra-border,#303842);border-radius:8px;background:transparent;color:inherit;cursor:pointer;font-size:20px">${iconMarkup("minus")}</button><button data-auto-close aria-label="Đóng dashboard" title="Đóng dashboard" style="width:32px;height:32px;padding:0;display:inline-flex;align-items:center;justify-content:center;line-height:1;border:1px solid var(--xra-border,#303842);border-radius:8px;background:transparent;color:inherit;cursor:pointer;font-size:20px">${iconMarkup("close")}</button></span></div><h3 style="margin:12px 0 5px;font-size:17px">Thiết lập</h3><div style="padding:8px 0 4px"><div style="display:flex;justify-content:space-between;font-size:15px"><b>Tốc độ xử lý</b><output data-auto-speed-value>0</output></div><input data-auto-speed type="range" min="-3" max="3" step="0.5" value="0" style="width:100%;accent-color:var(--xra-accent,#1d9bf0)"><div style="display:flex;justify-content:space-between;color:var(--xra-muted,#9aa4af);font-size:11px"><span>-3</span><span>-1.5</span><span>0</span><span>1.5</span><span>3</span></div></div><label style="display:flex;align-items:center;gap:8px;padding:8px 0;color:var(--xra-text,#edf1f5);font-size:15px"><input data-auto-vietnamese type="checkbox" checked> Chỉ xử lý bài có nội dung tiếng Việt</label><div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:10px 0 5px"><h3 style="margin:0;font-size:17px">Thông tin phiên</h3><span data-auto-session-status style="color:#20c997;font-size:12px;white-space:nowrap">Đang chạy (0 phút)</span></div><div data-auto-stats style="font-size:16px;margin:6px 0 10px;color:var(--xra-muted,#9aa4af);padding:4px 0"></div><div style="padding:12px;border:1px solid var(--xra-border,#303842);border-radius:10px;margin-bottom:10px;font-size:14px"><b style="display:flex;align-items:center"><span style="color:#20c997;font-size:10px;margin-right:4px">●</span> Đang xử lý <span data-auto-current-toggle data-auto-dropdown style="margin-left:auto;font-size:16px;line-height:1"></span></b><div data-auto-log-list style="margin-top:7px;max-height:none;overflow:visible;white-space:pre-wrap;font:13px/1.5 system-ui;color:var(--xra-muted,#9aa4af)">Đang chờ bài tiếp theo</div></div><details style="margin-top:12px"><summary style="font-size:14px;font-weight:700;list-style:none;display:flex;justify-content:flex-start;align-items:center;gap:4px;padding:8px 0;border-bottom:1px solid var(--xra-border,#303842);cursor:pointer">Đã xử lý <span data-auto-processed-count></span><span data-auto-dropdown style="margin-left:auto;font-size:16px;line-height:1"></span></summary><div data-auto-list style="max-height:none;overflow:visible;padding:4px 0;background:transparent;font-size:13px"></div></details><button data-auto-reset style="width:100%;margin-top:12px;padding:9px;border:1px solid var(--xra-border,#303842);border-radius:9px;background:transparent;color:inherit;cursor:pointer;font:600 14px system-ui">Reset số liệu</button>`;
    const dashboardFont = "Roboto, Segoe UI, Arial, sans-serif";
    box.style.setProperty("font-family", dashboardFont, "important");
    box.querySelectorAll("*").forEach((node) => {
      node.style.setProperty("font-family", dashboardFont, "important");
    });
    // Keep the dashboard dense enough for smaller screens while preserving
    // the existing layout and controls.
    box.querySelector("[data-auto-drag-handle] img")?.style.setProperty("width", "24px");
    box.querySelector("[data-auto-drag-handle] img")?.style.setProperty("height", "24px");
    box.querySelector("[data-auto-drag-handle] strong")?.style.setProperty("font-size", "15px");
    box.querySelectorAll("h3").forEach((node) => node.style.setProperty("font-size", "15px"));
    box.querySelectorAll("label").forEach((node) => node.style.setProperty("font-size", "13px"));
    box
      .querySelectorAll("[data-auto-log-list],[data-auto-list]")
      .forEach((node) => {
        node.style.setProperty("font-size", "12px");
        if (node.matches("[data-auto-log-list]")) {
          node.style.setProperty("margin-top", "4px");
          node.style.setProperty("max-height", "18px");
          node.style.setProperty("overflow", "hidden");
          node.style.setProperty("white-space", "nowrap");
          node.style.setProperty("text-overflow", "ellipsis");
          node.style.setProperty("line-height", "1.35");
        }
      });
    const speedLabel = box
      .querySelector("[data-auto-speed]")
      ?.previousElementSibling?.querySelector("b");
    if (speedLabel) {
      speedLabel.style.fontSize = "13px";
      speedLabel.style.fontWeight = "400";
      speedLabel.style.lineHeight = "1.4";
    }
    const dragHandle = box.querySelector("[data-auto-drag-handle]");
    if (dragHandle) {
      dragHandle.style.position = "sticky";
      dragHandle.style.top = "-16px";
      dragHandle.style.zIndex = "5";
      dragHandle.style.margin = "-14px -14px 8px";
      dragHandle.style.padding = "12px 14px 8px";
      dragHandle.style.background = "var(--xra-bg,#000)";
    }
    const headerActions = box.querySelector("[data-auto-drag-handle] > span:last-child");
    if (headerActions) headerActions.style.gap = "4px";
    box.querySelectorAll("[data-auto-drag-handle] > span:last-child button").forEach((button) => {
      if (button.matches("[data-auto-pause]")) return;
      button.style.width = "28px";
      button.style.height = "28px";
      button.style.fontSize = "18px";
    });
    const processingCard = box.querySelector("[data-auto-log-list]")?.parentElement;
    if (processingCard) {
      processingCard.style.padding = "8px";
      processingCard.style.marginBottom = "8px";
      processingCard.style.borderRadius = "9px";
      processingCard.style.fontSize = "13px";
    }
    const vietnameseFilter = box.querySelector("[data-auto-vietnamese]")?.closest("label");
    if (vietnameseFilter) {
      const restRow = document.createElement("label");
      restRow.dataset.autoRestRow = "";
      restRow.style.cssText =
        "display:flex;align-items:center;flex-wrap:wrap;gap:7px;padding:6px 0;color:var(--xra-text,#edf1f5);font-size:13px";
      const enabled = document.createElement("input");
      enabled.type = "checkbox";
      enabled.dataset.autoRest = "";
      enabled.checked = localStorage.getItem("assistantAutoRestEnabled") === "true";
      const interval = document.createElement("input");
      interval.type = "number";
      interval.min = "1";
      interval.max = "1440";
      interval.step = "1";
      interval.dataset.autoRestInterval = "";
      interval.value = String(
        Math.max(
          1,
          Math.min(1440, Number(localStorage.getItem("assistantAutoRestEveryMinutes")) || 30),
        ),
      );
      interval.setAttribute("aria-label", "Số phút giữa các lần nghỉ");
      interval.style.cssText =
        "width:60px;min-width:60px;box-sizing:border-box;padding:5px 7px;border:1px solid var(--xra-border,#303842);border-radius:7px;background:var(--xra-bg,#000);color:var(--xra-text,#e7e9ea);font:inherit";
      restRow.append(enabled, document.createTextNode("Tạm nghỉ sau mỗi "), interval);
      restRow.append(document.createTextNode(" phút"));
      vietnameseFilter.before(restRow);
      const syncRestSettings = () => {
        const everyMinutes = Math.max(1, Math.min(1440, Number(interval.value) || 30));
        interval.value = String(everyMinutes);
        memory.autoRestEnabled = enabled.checked;
        memory.autoRestEveryMinutes = everyMinutes;
        persistPageSetting("assistantAutoRestEnabled", enabled.checked);
        persistPageSetting("assistantAutoRestEveryMinutes", everyMinutes);
        restRow.style.opacity = enabled.checked ? "1" : "0.55";
        interval.disabled = !enabled.checked;
        if (!enabled.checked && memory.isAutoResting) {
          memory.isAutoResting = false;
          memory.autoRestUntil = 0;
          activeRunElapsedMs = 0;
          activeRunSegmentStartedAt = memory.isPaused || !running ? 0 : Date.now();
          log("Đã tắt nghỉ tự động · tiếp tục chạy");
          dashboard();
        }
      };
      memory.autoRestEnabled = enabled.checked;
      memory.autoRestEveryMinutes = Number(interval.value);
      enabled.addEventListener("change", syncRestSettings);
      interval.addEventListener("change", syncRestSettings);
      syncRestSettings();
      const syncVietnameseFilter = () => {
        vietnameseFilter.style.opacity = vietnameseFilter.querySelector("[data-auto-vietnamese]")
          ?.checked
          ? "1"
          : "0.55";
      };
      vietnameseFilter
        .querySelector("[data-auto-vietnamese]")
        ?.addEventListener("change", syncVietnameseFilter);
      syncVietnameseFilter();
    }
    document.documentElement.appendChild(box);
    syncPauseButton();
    configureSpeedControl(box);
    configureMinimumGapControl(box);
    configureSkipOldPostsControl(box);
    configureIdleRefreshPostsControl(box);
    configureDailyReplyLimitControl(box);
    configureConsecutiveFailureLimitControl(box);
    reorderAutoSetupControls(box);
    const tabBadge = document.createElement("span");
    memory.tabBadge ||= Math.random().toString(36).slice(2, 6).toUpperCase();
    tabBadge.dataset.autoTabBadge = "";
    tabBadge.textContent = `TAB · ${memory.tabBadge}`;
    tabBadge.title = `Nhận diện tab hiện tại · ${location.hostname}`;
    tabBadge.style.cssText =
      "margin-left:4px;padding:3px 7px;border:1px solid color-mix(in srgb,#1d9bf0 60%,var(--xra-border,#303842));border-radius:999px;color:#35a7ee;font:600 10px/1 system-ui;white-space:nowrap";
    box.querySelector("[data-auto-drag-handle] > span")?.append(tabBadge);
    const setupTitle = [...box.querySelectorAll("h3")].find(
      (node) => node.textContent.trim() === "Thiết lập",
    );
    if (setupTitle) {
      const setupCard = document.createElement("section");
      setupCard.style.cssText =
        "padding:8px;border:1px solid var(--xra-border);border-radius:9px;background:transparent;margin-bottom:8px";
      setupTitle.parentNode.insertBefore(setupCard, setupTitle);
      setupTitle.style.cssText +=
        ";display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px";
      const setupToggle = document.createElement("button");
      setupToggle.type = "button";
      setupToggle.dataset.autoSetupToggle = "";
      setupToggle.setAttribute("aria-label", "Thu gọn thiết lập");
      setupToggle.title = "Thu gọn thiết lập";
      setupToggle.style.cssText =
        "display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;flex:0 0 28px;padding:0;border:1px solid var(--xra-border,#303842);border-radius:50%;background:transparent;color:inherit;cursor:pointer;line-height:0";
      setupTitle.append(setupToggle);
      const setupBody = document.createElement("div");
      setupBody.dataset.autoSetupBody = "";
      setupCard.append(setupTitle);
      setupCard.append(setupBody);
      // Keep every setup control (including the daily limit and Vietnamese
      // filter) in the same card. Stop before the session information row.
      while (setupCard.nextElementSibling) {
        const next = setupCard.nextElementSibling;
        const isSessionRow = [...next.querySelectorAll("h3")].some(
          (node) => node.textContent.trim() === "Thông tin phiên",
        );
        if (isSessionRow) break;
        setupBody.append(next);
      }
      setupCard.style.padding = "7px";
      setupBody.querySelectorAll("label,[data-auto-min-gap-control]").forEach((row) => {
        row.style.padding = "4px 0";
        row.style.gap = "5px";
        row.style.fontSize = "12px";
        row.style.lineHeight = "1.25";
      });
      setupBody.querySelectorAll('input[type="number"]').forEach((input) => {
        input.style.width = "52px";
        input.style.minWidth = "52px";
        input.style.padding = "4px 6px";
      });
      setupBody.querySelectorAll("select").forEach((select) => {
        select.style.minWidth = "72px";
        select.style.padding = "4px 6px";
      });
      const setupCollapsedKey = "assistantAutoSetupCollapsed";
      const setSetupCollapsed = (collapsed) => {
        setupBody.hidden = collapsed;
        setupCard.dataset.collapsed = String(collapsed);
        setupToggle.setAttribute("aria-expanded", String(!collapsed));
        setupToggle.setAttribute("aria-label", collapsed ? "Mở thiết lập" : "Thu gọn thiết lập");
        setupToggle.title = collapsed ? "Mở thiết lập" : "Thu gọn thiết lập";
        setupToggle.innerHTML = iconMarkup(collapsed ? "down" : "up");
        const icon = setupToggle.querySelector("svg");
        if (icon) {
          icon.style.width = "16px";
          icon.style.height = "16px";
        }
        try {
          persistPageSetting(setupCollapsedKey, collapsed);
        } catch {}
      };
      setupToggle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setSetupCollapsed(!setupBody.hidden);
      });
      let setupCollapsed = false;
      try {
        setupCollapsed = localStorage.getItem(setupCollapsedKey) === "true";
      } catch {}
      setSetupCollapsed(setupCollapsed);
    }
    const sessionRow = [...box.querySelectorAll("h3")].find(
      (node) => node.textContent.trim() === "Thông tin phiên",
    )?.parentElement;
    if (sessionRow) {
      const sessionCard = document.createElement("section");
      sessionCard.style.cssText =
        "padding:8px;border:1px solid var(--xra-border);border-radius:9px;background:transparent";
      sessionRow.parentNode.insertBefore(sessionCard, sessionRow);
      sessionCard.append(
        sessionRow,
        sessionRow.nextElementSibling,
        sessionRow.nextElementSibling?.nextElementSibling,
        sessionRow.nextElementSibling?.nextElementSibling?.nextElementSibling,
      );
    }
    box.querySelector("[data-auto-reset]")?.remove();
    box.querySelectorAll("[data-auto-stats] > div > div").forEach((card) => {
      card.style.setProperty("background", "transparent", "important");
      card.style.gridTemplateColumns = "30% 70%";
      card.style.minHeight = "50px";
      card.style.borderRadius = "8px";
      card.querySelector("span:first-child")?.style.setProperty("font-size", "15px");
      const statIcon = card.querySelector("span:first-child .ui-icon");
      if (statIcon) {
        statIcon.style.width = "28px";
        statIcon.style.height = "28px";
      }
      card.querySelector("strong")?.style.setProperty("font-size", "15px");
      card.querySelector("small")?.style.setProperty("font-size", "9px");
      card.querySelector("span:nth-child(2)")?.style.setProperty("padding", "4px 5px");
    });
    const speedStyle = document.createElement("style");
    speedStyle.textContent =
      "#assistant-auto-dashboard [data-auto-speed]{accent-color:var(--xra-accent,var(--xra-color,#1d9bf0));color-scheme:light dark;background:transparent}#assistant-auto-dashboard [data-auto-speed]::-webkit-slider-runnable-track{height:4px;border-radius:4px;background:color-mix(in srgb,var(--xra-color,#e7e9ea) 28%,var(--xra-bg,#000))}#assistant-auto-dashboard [data-auto-speed]::-webkit-slider-thumb{margin-top:-5px;width:14px;height:14px;border:0;border-radius:50%;background:var(--xra-accent,#1d9bf0);-webkit-appearance:none}#assistant-auto-dashboard [data-auto-speed]::-moz-range-track{height:4px;border-radius:4px;background:color-mix(in srgb,var(--xra-color,#e7e9ea) 28%,var(--xra-bg,#000))}#assistant-auto-dashboard [data-auto-speed]::-moz-range-progress{height:4px;border-radius:4px;background:var(--xra-accent,#1d9bf0)}#assistant-auto-dashboard [data-auto-speed]::-moz-range-thumb{width:14px;height:14px;border:0;border-radius:50%;background:var(--xra-accent,#1d9bf0)}";
    speedStyle.textContent +=
      "#assistant-auto-dashboard{scrollbar-width:none;-ms-overflow-style:none}#assistant-auto-dashboard::-webkit-scrollbar{width:0;height:0;display:none}";
    box.appendChild(speedStyle);
    const processedCard = box.querySelector("details");
    if (processedCard) {
      processedCard.style.cssText =
        "margin-top:8px;padding:8px;border:1px solid var(--xra-border,#303842);border-radius:9px;background:transparent";
      const summary = processedCard.querySelector("summary");
      if (summary) summary.style.padding = "0 0 6px";
      const resizeProcessedCard = () => {
        if (!processedCard.open) {
          syncViewport();
          processedCard.style.height = "";
          const list = processedCard.querySelector("[data-auto-list]");
          if (list) {
            list.style.height = "";
            list.style.maxHeight = "220px";
          }
          return;
        }
        syncViewport();
        requestAnimationFrame(() => {
          const boxRect = box.getBoundingClientRect();
          const cardRect = processedCard.getBoundingClientRect();
          const cardHeight = Math.max(160, box.clientHeight - (cardRect.top - boxRect.top) - 12);
          processedCard.style.height = `${cardHeight}px`;
          processedCard.style.boxSizing = "border-box";
          const list = processedCard.querySelector("[data-auto-list]"),
            summaryHeight = processedCard.querySelector("summary")?.offsetHeight || 30,
            listHeight = Math.max(100, cardHeight - summaryHeight - 24);
          if (list) {
            list.style.height = `${listHeight}px`;
            list.style.maxHeight = `${listHeight}px`;
          }
        });
      };
      box.__autoResizeProcessedCard = resizeProcessedCard;
      processedCard.addEventListener("toggle", resizeProcessedCard);
    }
    box.style.width = "min(360px, calc(100vw - 20px))";
    box.style.height = "560px";
    box.style.minWidth = "min(280px, calc(100vw - 20px))";
    box.style.minHeight = "560px";
    box.style.maxHeight = "calc(100vh - 24px)";
    box.style.resize = "both";
    box.style.overflow = "auto";
    box.style.overflowX = "hidden";
    box.style.scrollbarWidth = "none";
    box.style.msOverflowStyle = "none";
    addEventListener("resize", syncViewport, { passive: true });
    syncViewport();
    const dropdownSvg = globalThis.AssistantIcons?.svg?.("dropdown");
    if (dropdownSvg)
      box.querySelectorAll("[data-auto-dropdown]").forEach((span) => {
        span.innerHTML = dropdownSvg;
      });
    const currentLog = box.querySelector("[data-auto-log-list]");
    const currentToggle = box.querySelector("[data-auto-current-toggle]");
    if (currentLog && currentToggle) {
      const setCurrentExpanded = (expanded) => {
        const next = !!expanded;
        currentLog.dataset.expanded = String(next);
        currentLog.style.maxHeight = next ? "56px" : "18px";
        currentLog.style.whiteSpace = next ? "pre-line" : "nowrap";
        currentToggle.setAttribute("aria-expanded", String(next));
        currentToggle.setAttribute("aria-label", next ? "Thu gọn đang xử lý" : "Mở rộng đang xử lý");
        currentToggle.title = next ? "Thu gọn đang xử lý" : "Mở rộng đang xử lý";
        currentToggle.innerHTML = iconMarkup(next ? "up" : "down");
        currentLog.textContent = compactCurrentLog(next);
        currentLog.title = compactCurrentLog(true);
      };
      currentToggle.setAttribute("role", "button");
      currentToggle.tabIndex = 0;
      currentToggle.style.cursor = "pointer";
      currentToggle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setCurrentExpanded(currentLog.dataset.expanded !== "true");
      });
      currentToggle.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        setCurrentExpanded(currentLog.dataset.expanded !== "true");
      });
      setCurrentExpanded(true);
    }
    const makeDraggable = (
      dragHandle,
      allowInteractive = dragHandle?.matches("[data-auto-restore]"),
    ) => {
      if (allowInteractive && dragHandle) {
        dragHandle.innerHTML = globalThis.AssistantIcons?.svg("maximize") || "";
        dragHandle.style.cssText =
          "display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;padding:0;border:1px solid var(--xra-border);border-radius:50%;background:var(--xra-bg);color:var(--xra-color);cursor:move;line-height:0";
      }
      let dragState = null;
      let dragMoved = false;
      dragHandle?.addEventListener("pointerdown", (event) => {
        if (!allowInteractive && event.target.closest("button, input, select, textarea, a")) return;
        dragState = {
          x: event.clientX - box.offsetLeft,
          y: event.clientY - box.offsetTop,
          startX: event.clientX,
          startY: event.clientY,
        };
        dragMoved = false;
        dragHandle.dataset.autoDragMoved = "false";
        dragHandle.setPointerCapture?.(event.pointerId);
      });
      dragHandle?.addEventListener("pointermove", (event) => {
        if (!dragState) return;
        if (
          Math.abs(event.clientX - dragState.startX) + Math.abs(event.clientY - dragState.startY) >
          4
        )
          dragMoved = true;
        const minimized = box.dataset.minimized === "true",
          inset = minimized ? 12 : 0,
          badgeOverflow = minimized ? 16 : 0,
          maxLeft = Math.max(inset, innerWidth - box.offsetWidth - inset - badgeOverflow),
          maxTop = Math.max(inset, innerHeight - box.offsetHeight - inset);
        box.style.left = `${Math.min(maxLeft, Math.max(inset, event.clientX - dragState.x))}px`;
        box.style.top = `${Math.min(maxTop, Math.max(inset, event.clientY - dragState.y))}px`;
        box.style.bottom = "auto";
        box.style.right = "auto";
      });
      dragHandle?.addEventListener("pointerup", () => {
        if (dragHandle) dragHandle.dataset.autoDragMoved = dragMoved ? "true" : "false";
        saveDashboardPosition(box);
        dragState = null;
      });
      dragHandle?.addEventListener("pointercancel", () => {
        if (dragHandle) dragHandle.dataset.autoDragMoved = dragMoved ? "true" : "false";
        saveDashboardPosition(box);
        dragState = null;
      });
    };
    makeDraggable(box.querySelector("[data-auto-drag-handle]"));
    box
      .querySelectorAll("[data-auto-pause], [data-auto-minimize], [data-auto-close]")
      .forEach((button) =>
        button.addEventListener("pointerdown", (event) => event.stopPropagation()),
      );
    box.querySelector("[data-auto-pause]").onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      globalThis.toggleAutoBotPause?.();
      syncPauseButton();
      log(memory.isPaused ? "Đã tạm dừng" : "Đã tiếp tục");
    };
    box.querySelector("[data-auto-close]").onclick = () => {
      stop("Đã dừng theo yêu cầu");
      box.__autoDisposeViewport?.();
      box.remove();
      notifyPanel(false);
    };
    box.querySelector("[data-auto-minimize]").onclick = () => {
      const currentRect = box.getBoundingClientRect(),
        miniInset = 12,
        miniBadgeOverflow = 16,
        miniWidth = 42,
        miniHeight = 42,
        safeLeft = Math.min(
          Math.max(miniInset, currentRect.left),
          Math.max(miniInset, innerWidth - miniWidth - miniInset - miniBadgeOverflow),
        ),
        safeTop = Math.min(
          Math.max(miniInset, currentRect.top),
          Math.max(miniInset, innerHeight - miniHeight - miniInset),
        );
      box.dataset.minimized = "true";
      box.style.left = `${safeLeft}px`;
      box.style.top = `${safeTop}px`;
      box.style.bottom = "auto";
      box.style.right = "auto";
      box.style.width = "42px";
      box.style.height = "42px";
      box.style.minWidth = "0";
      box.style.minHeight = "0";
      box.style.maxWidth = "none";
      box.style.maxHeight = "none";
      box.style.resize = "none";
      box.style.overflow = "visible";
      box.style.border = "0";
      box.style.borderRadius = "50%";
      box.style.padding = "0";
      box.style.boxShadow = "none";
      box.innerHTML =
        '<button data-auto-restore aria-label="Mở dashboard" title="Mở dashboard" style="display:grid;place-items:center;width:42px;height:42px;padding:0;border:1px solid var(--xra-border);border-radius:50%;background:var(--xra-bg);color:var(--xra-color);font-size:20px;line-height:1;cursor:pointer">' +
        (globalThis.AssistantIcons?.svg("arrow") || "") +
        '</button><span data-auto-mini-badge style="position:absolute;right:-8px;top:-9px;display:flex;align-items:stretch;overflow:hidden;border:1px solid var(--xra-border);border-radius:999px;background:var(--xra-bg);box-shadow:0 2px 7px #0008;color:#fff;font:700 9px/1 system-ui;white-space:nowrap"><span data-auto-mini-rate style="padding:3px 4px;background:#168bd1;color:#fff">0/p</span><span data-auto-mini-done style="padding:3px 4px;background:#129b78;color:#fff">0</span><span data-auto-mini-skipped style="padding:3px 4px;background:#d84252;color:#fff">0</span></span>';
      dashboard();
      makeDraggable(box.querySelector("[data-auto-restore]"));
      box.querySelector("[data-auto-restore]").onclick = (event) => {
        const restore = box.querySelector("[data-auto-restore]");
        if (event.detail > 1 || restore?.dataset.autoDragMoved === "true") {
          if (restore) restore.dataset.autoDragMoved = "false";
          event.preventDefault();
          return;
        }
        const left = box.style.left,
          top = box.style.top;
        box.__autoDisposeViewport?.();
        box.remove();
        const restored = dashboardView();
        restored.style.left = left;
        restored.style.top = top;
        restored.style.bottom = "auto";
        restored.style.right = "auto";
        dashboard();
      };
    };
    return box;
  }
  function stop(reason = "Đã dừng") {
    running = false;
    memory.isPaused = false;
    globalThis.__assistantAutoFlowPaused = false;
    memory.isAutoResting = false;
    memory.autoRestUntil = 0;
    activeRunSegmentStartedAt = 0;
    globalThis.__assistantAutoFlowRunning = false;
    memory.lastStopReason = String(reason || "Đã dừng")
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 240);
    document.dispatchEvent(new Event("assistant-auto-flow-state"));
    memory.runState = "stopped";
    clearTimeout(timer);
    log(reason);
    dashboard();
    notifyPanel(false);
  }
  async function stopForAutomationBlock(item, notice = "") {
    if (item) {
      try {
        await coordinate("release", item);
      } catch {}
    }
    const detail = notice ? ` (${notice.slice(0, 180)})` : "";
    stop(`Đã dừng: X chặn thao tác tự động${detail}`);
  }
  async function loop() {
    if (!running) return;
    const initialBlockNotice = readAutomationBlockNotice();
    if (initialBlockNotice) {
      await stopForAutomationBlock(null, initialBlockNotice);
      return;
    }
    if (/^\/compose\/post(?:\/|$)/i.test(location.pathname)) {
      stop("Đã dừng: phát hiện trình soạn thảo X");
      return;
    }
    if (!(await waitIfPaused())) return;
    if (!location.href.includes("/home") && location.pathname !== "/") {
      log("Không còn ở Home · đang tự chuyển về Home để tiếp tục");
      const returnedHome = await returnHome();
      if (!returnedHome) {
        log("Chưa về được Home · sẽ thử lại sau");
        if (running && !memory.isPaused) timer = setTimeout(loop, 1500);
        return;
      }
    }
    const p = read(processedKey),
      s = read(skippedKey),
      done = new Set([...p, ...s].map((x) => x.id)),
      me = own(),
      excludedAuthors = await excludedAuthorSet();
    const dailyLimit = readDailyReplyLimit();
    if (readDailyReplyCount() >= dailyLimit) {
      stop(`Đã dừng: đạt giới hạn ${dailyLimit} trả lời/ngày`);
      return;
    }
    for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
      if (
        article.querySelector('[data-testid*="promoted" i],[data-testid*="sponsor" i]') ||
        /được quảng bá|promoted/i.test(article.textContent || "")
      )
        continue;
      const id = postId(article),
        link = statusLinkForArticle(article, id),
        author = link?.href.match(/x\.com\/([^/]+)\/status/)?.[1]?.toLowerCase();
      const authorText =
        article
          .querySelector('[data-testid="User-Name"]')
          ?.textContent?.replace(/\s+/g, " ")
          .trim() ||
        author ||
        "unknown";
      const displayName = authorText.split("@")[0].trim() || authorText;
      if (!id) continue;
      if (done.has(id) || author === me) {
        if (noteNoActionPost(id)) return;
        continue;
      }
      if (author && excludedAuthors.has(author)) {
        s.push({
          id,
          url: link.href,
          handle: author,
          displayName,
          reason: "Tài khoản trong danh sách bỏ qua",
          skippedAt: Date.now(),
        });
        done.add(id);
        save(skippedKey, s);
        log(`Bỏ qua @${author}: nằm trong danh sách tài khoản loại trừ`);
        dashboard();
        if (noteNoActionPost(id)) return;
        continue;
      }
      const skipOldPosts = readSkipOldPostsSetting();
      const ageHours = postAgeHours(article);
      if (skipOldPosts.enabled && ageHours !== null && ageHours > skipOldPosts.hours) {
        s.push({
          id,
          url: link.href,
          handle: author || "unknown",
          displayName,
          reason: `Bài quá ${skipOldPosts.hours} giờ`,
          skippedAt: Date.now(),
        });
        done.add(id);
        save(skippedKey, s);
        log(`Bỏ qua ${id}: bài đã quá ${skipOldPosts.hours} giờ`);
        dashboard();
        if (noteNoActionPost(id)) return;
        continue;
      }
      const onlyVietnamese = document.querySelector("[data-auto-vietnamese]")?.checked !== false;
      if (onlyVietnamese && !isVietnamesePost(article)) {
        if (noteNoActionPost(id)) return;
        continue;
      }
      resetNoActionScan();
      clearCurrentProcessing();
      const item = { id, url: link.href, handle: author || "unknown", displayName };
      log(`Bài viết của: ${displayName} - ${author ? "@" + author : "unknown"} | ID: ${id}`);
      if (!(await waitIfPaused())) return;
      link?.click();
      let opened = false;
      for (let wait = 0; wait < 20; wait++) {
        await pauseSleep(500);
        if (location.pathname.includes("/status/")) {
          opened = true;
          break;
        }
      }
      if (!opened) {
        s.push({ ...item, reason: "Không mở được bài viết", skippedAt: Date.now() });
        save(skippedKey, s);
        log("Bỏ qua:", id, "Không mở được bài viết");
        clearCurrentProcessing();
        continue;
      }
      await pauseSleep(2000);
      if ((await excludedAuthorSet()).has(item.handle)) {
        s.push({ ...item, reason: "Tài khoản trong danh sách bỏ qua", skippedAt: Date.now() });
        save(skippedKey, s);
        log(
          `Đã mở bài của @${item.handle} nhưng tài khoản nằm trong danh sách bỏ qua · quay về Home`,
        );
        await returnHome();
        clearCurrentProcessing();
        dashboard();
        break;
      }
      const repostSettings = await readAutoRepostSettings(),
        initialInteractionState = readInteractionState(id, own());
      log(
        "Trạng thái bài: Repost " +
          (initialInteractionState.reposted === null
            ? "chưa xác định"
            : initialInteractionState.reposted
              ? "đã"
              : "chưa") +
          " · Trả lời " +
          (initialInteractionState.replied === null
            ? "chưa xác định"
            : initialInteractionState.replied
              ? "đã"
              : "chưa") +
          " · Like " +
          (initialInteractionState.liked === null
            ? "chưa xác định"
            : initialInteractionState.liked
              ? "đã"
              : "chưa"),
      );
      const likeAction = await likeCurrentPostIfEnabled(id);
      if (likeAction === "clicked") log("Đã thả like theo cài đặt");
      else if (likeAction === "already") log("Đã like từ trước · không thao tác lại");
      // The assistant toolbar is mounted near the reply composer. Do not
      // advance the whole X page while waiting for it; that can run to the
      // bottom of a long conversation when the toolbar is unavailable.
      let replyComposer = document.querySelector(
        '[data-testid="tweetTextarea_0_label"], [data-testid^="tweetTextarea_"]',
      );
      if (!(await waitIfPaused())) return;
      if (!replyComposer) {
        // On a status page X may not mount the inline composer until its
        // native Reply action is opened. Scope the click to this post so it
        // cannot trigger the global compose flow.
        const targetArticle = [...document.querySelectorAll('article[data-testid="tweet"]')].find(
          (candidate) =>
            [...candidate.querySelectorAll('a[href*="/status/"]')].some((anchor) =>
              new RegExp(`/status/${id}(?:$|[?#/])`).test(anchor.href),
            ),
        );
        const nativeReply = targetArticle?.querySelector('[data-testid="reply"]');
        if (nativeReply && !nativeReply.dataset.xraOpened) {
          nativeReply.dataset.xraOpened = "1";
          nativeReply.click();
          log("Đã mở ô Trả lời của bài viết");
          window.dispatchEvent(new Event("assistant-auto-flow-mount"));
        }
        for (let composerWait = 0; composerWait < 20; composerWait++) {
          replyComposer = document.querySelector(
            '[data-testid="tweetTextarea_0_label"], [data-testid^="tweetTextarea_"]',
          );
          if (replyComposer) break;
          await pauseSleep(300);
        }
      }
      window.dispatchEvent(new Event("assistant-auto-flow-mount"));
      replyComposer?.scrollIntoView({ behavior: "auto", block: "center" });
      let targetBox = null;
      let replyButton = null;
      for (let toolbarWait = 0; toolbarWait < 20; toolbarWait++) {
        targetBox = assistantBoxForTarget(id);
        replyButton =
          targetBox?.querySelector(".xra-button.xra-generate,.xra-button.xra-sync") || null;
        if (replyButton) {
          if (!(await waitIfPaused())) return;
          replyButton.scrollIntoView({ behavior: "auto", block: "center" });
          break;
        }
        await pauseSleep(500);
      }
      await pauseSleep(900);
      if (!replyButton) {
        const reason = "Không tải được giao diện trợ lý sau khi mở bài";
        log(`Lỗi: ${reason}`);
        await coordinate("release", item);
        s.push({ ...item, reason, skippedAt: Date.now() });
        save(skippedKey, s);
        await returnHome();
        clearCurrentProcessing();
        dashboard();
        break;
      }
      const currentDone = new Set(
        [...read(processedKey), ...read(skippedKey)].map((entry) => entry.id),
      );
      const myHandle = own();
      const currentInteractionState = readInteractionState(id, myHandle),
        needsTopicForRepost =
          repostSettings.enabled &&
          repostSettings.topics.length > 0 &&
          currentInteractionState.reposted !== true;
      if (currentDone.has(id) || (currentInteractionState.replied && !needsTopicForRepost)) {
        log("Trạng thái: Đã trả lời -> Skip");
        s.push({ ...item, reason: "Đã có reply hoặc đã xử lý", skippedAt: Date.now() });
        save(skippedKey, s);
        await returnHome();
        clearCurrentProcessing();
        dashboard();
        break;
      }
      if (currentInteractionState.replied && needsTopicForRepost)
        log("Đã trả lời từ trước · vẫn phân loại chủ đề để kiểm tra repost");
      const claim = await coordinate("claim", item);
      if (!claim.granted) {
        const reason = "Bài đang được tab khác xử lý";
        log(`Bỏ qua: ${reason} (${id})`);
        s.push({ ...item, reason, skippedAt: Date.now() });
        save(skippedKey, s);
        await returnHome();
        clearCurrentProcessing();
        dashboard();
        break;
      }
      if (claim.waitMs) {
        log(`Đã nhận bài · tạo gợi ý trước, sẽ giữ khoảng giãn cách trước khi gửi`);
      }
      log("Trạng thái: Chưa trả lời");
      let button = null;
      let buttonWait = 0;
      while (running && buttonWait < 60) {
        targetBox = assistantBoxForTarget(id);
        button = targetBox?.querySelector(".xra-button.xra-generate,.xra-button.xra-sync") || null;
        if (button && !button.disabled) break;
        // Do not click X's native Reply button here: that opens the global
        // compose dialog and steals the target article from the assistant.
        // Wait for the assistant content UI to mount instead.
        buttonWait += 1;
        await pauseSleep(flowDelay(700));
      }
      if (!running) {
        await coordinate("release", item);
        return;
      }
      if (!button || button.disabled) {
        const reason = "Giao diện trợ lý không sẵn sàng sau khi chờ";
        log(`Lỗi: ${reason}`);
        await coordinate("release", item);
        s.push({ ...item, reason, skippedAt: Date.now() });
        save(skippedKey, s);
        await returnHome();
        clearCurrentProcessing();
        dashboard();
        break;
      }
      if (button && !button.disabled) {
        if (!(await waitIfPaused())) {
          await coordinate("release", item);
          return;
        }
        let suggestion = targetBox?.querySelector(
          ".xra-results .xra-suggestion-wrap .xra-chip-main",
        );
        let providerError = "";
        if (suggestion) {
          log("Đã có gợi ý sẵn · dùng lại, không gọi gợi ý lần hai");
        } else {
          globalThis.__assistantAutoFlowRequest = true;
          try {
            button.click();
          } finally {
            globalThis.__assistantAutoFlowRequest = false;
          }
          console.log("[Assistant Auto] Status: Normal (đã yêu cầu tạo gợi ý)");
          const suggestionDeadline = Date.now() + 75_000;
          while (running && !suggestion && Date.now() < suggestionDeadline) {
            await pauseSleep(flowDelay(700));
            const blockNotice = readAutomationBlockNotice();
            if (blockNotice) {
              await stopForAutomationBlock(item, blockNotice);
              return;
            }
            targetBox = assistantBoxForTarget(id);
            suggestion = targetBox?.querySelector(
              ".xra-results .xra-suggestion-wrap .xra-chip-main",
            );
            const errorNode = targetBox?.querySelector(
              ".xra-error,[role=alert],.xra-status-error",
            );
            providerError = errorNode?.textContent?.trim() || "";
            if (providerError) break;
          }
          if (!suggestion && !providerError)
            providerError = "Gợi ý quá thời gian chờ · request có thể đã bị treo";
        }
        const providerBlockNotice = readAutomationBlockNotice();
        if (providerBlockNotice) {
          await stopForAutomationBlock(item, providerBlockNotice);
          return;
        }
        if (providerError) {
          const retryButton =
            targetBox?.querySelector(".xra-button.xra-sync,.xra-button.xra-generate") || null;
          if (retryButton && running) {
            log("Lỗi gợi ý -> Tạo lại gợi ý");
            if (!(await waitIfPaused())) {
              await coordinate("release", item);
              return;
            }
            globalThis.__assistantAutoFlowRequest = true;
            try {
              retryButton.click();
            } finally {
              globalThis.__assistantAutoFlowRequest = false;
            }
            providerError = "";
            const retryDeadline = Date.now() + 75_000;
            while (running && Date.now() < retryDeadline) {
              await pauseSleep(flowDelay(500));
              const blockNotice = readAutomationBlockNotice();
              if (blockNotice) {
                await stopForAutomationBlock(item, blockNotice);
                return;
              }
              targetBox = assistantBoxForTarget(id);
              const retryError =
                targetBox
                  ?.querySelector(".xra-error,[role=alert],.xra-status-error")
                  ?.textContent?.trim() || "";
              const retrySuggestion = targetBox?.querySelector(
                ".xra-results .xra-suggestion-wrap .xra-chip-main",
              );
              if (retrySuggestion) {
                suggestion = retrySuggestion;
                break;
              }
              if (retryError) {
                providerError = retryError;
                break;
              }
            }
          }
        }
        if (providerError) {
          const transportFailure = isProviderTransportError(providerError);
          await coordinate("release", item);
          memory.consecutiveFailures += 1;
          memory.sessionFailures += 1;
          // A transient provider/network failure is not a skipped post. Keep
          // it eligible so the next loop can retry the same item.
          if (!transportFailure) {
            s.push({ ...item, reason: providerError, skippedAt: Date.now() });
            save(skippedKey, s);
          }
          log(
            `Lỗi gợi ý (${memory.sessionFailures}/5 phiên, ${memory.consecutiveFailures}/${readConsecutiveFailureLimit()} liên tiếp):`,
            providerError,
          );
          await returnHome();
          clearCurrentProcessing();
          const failureLimit = readConsecutiveFailureLimit();
          if (memory.sessionFailures > 5 || memory.consecutiveFailures >= failureLimit) {
            stop(`Đã dừng: ${failureLimit} bài liên tiếp không trả lời được`);
            return;
          }
          if (transportFailure) {
            log("kết nối API bị gián đoạn, không bỏ qua thêm bài");
            log("Sẽ thử lại bài hiện tại sau một khoảng nghỉ");
            await pauseSleep(Math.min(30_000, 5_000 * memory.consecutiveFailures));
            dashboard();
            break;
          }
          if (isProviderCredentialError(providerError)) {
            stop("Đã dừng: các API key hiện tại không hợp lệ hoặc không còn quyền sử dụng");
            return;
          }
          if (isProviderQuotaError(providerError)) {
            stop("Đã dừng: các API key hiện tại đã chạm hạn mức");
            return;
          }
          dashboard();
          break;
        }
        if (suggestion) {
          const suggestions = Array.from(
              targetBox?.querySelectorAll(".xra-results .xra-suggestion-wrap") || [],
            ),
            preferredSuggestions =
              globalThis.AutoReplySelection?.preferAboveScore(suggestions, 30) || suggestions;
          log("Kết quả gợi ý: " + suggestions.length);
          if (preferredSuggestions.length < suggestions.length)
            log(`Ưu tiên câu trên 30% (${preferredSuggestions.length}/${suggestions.length})`);
          else if (
            suggestions.length &&
            !suggestions.some((item) => Number(item.dataset.relevanceScore) > 30)
          )
            log("Không có câu trên 30% · dùng danh sách hiện có");
          const detectedTopic = String(targetBox?.dataset.replyTopic || "")
              .replace(/\s+/gu, " ")
              .trim(),
            autoSkipRules = String(targetBox?.dataset.autoSkipTopics || "")
              .split(/\n+/u)
              .map((value) => value.trim())
              .filter(Boolean),
            matchedAutoSkipRule = matchingAutoTopicRule(detectedTopic, autoSkipRules);
          if (matchedAutoSkipRule) {
            const reason = `Chủ đề “${matchedAutoSkipRule}” nằm trong quy tắc bỏ qua tự động`;
            s.push({
              ...item,
              topic: detectedTopic,
              reason,
              skippedAt: Date.now(),
            });
            save(skippedKey, s);
            log(`Bỏ qua ${id}: ${reason}${detectedTopic ? ` · Nhãn: ${detectedTopic}` : ""}`);
            await coordinate("release", item);
            if (noteNoActionPost(id)) return;
            await returnHome();
            clearCurrentProcessing();
            dashboard();
            break;
          }
          await repostCurrentPostIfEligible(id, detectedTopic, repostSettings);
          if (currentInteractionState.replied) {
            log("Đã có phản hồi của bạn · repost đã được kiểm tra, không bình luận lần hai");
            s.push({
              ...item,
              topic: detectedTopic,
              reason: "Đã có phản hồi; chỉ kiểm tra repost",
              skippedAt: Date.now(),
            });
            save(skippedKey, s);
            await coordinate("release", item);
            await returnHome();
            clearCurrentProcessing();
            dashboard();
            break;
          }
          const chosen = Math.floor(Math.random() * preferredSuggestions.length);
          log("Lựa chọn: " + (chosen + 1));
          suggestion = preferredSuggestions[chosen]?.querySelector(".xra-chip-main") || suggestion;
          const submitSlot = await coordinate("commit", item);
          if (!submitSlot.granted) {
            log(`Không thể nhận slot gửi comment: ${submitSlot.reason || "lease hết hạn"}`);
            await coordinate("release", item);
            await returnHome();
            clearCurrentProcessing();
            dashboard();
            break;
          }
          if (submitSlot.waitMs) {
            log(
              `Chờ ${Math.ceil(submitSlot.waitMs / 1000)} giây để giãn thời gian comment (mức ${memory.speed || 0})`,
            );
            await pauseSleep(submitSlot.waitMs);
          }
          if (!(await waitIfPaused())) {
            await coordinate("release", item);
            return;
          }
          const beforeSelectBlock = readAutomationBlockNotice();
          if (beforeSelectBlock) {
            await stopForAutomationBlock(item, beforeSelectBlock);
            return;
          }
          const selectedReply =
            suggestion.querySelector(":scope > span:first-child")?.textContent?.trim() ||
            suggestion.textContent?.trim() ||
            "";
          suggestion.click();
          const submitted = await submitSelectedReply(selectedReply, myHandle, id);
          if (!submitted) {
            const blockNotice = memory.autoBlockNotice || readAutomationBlockNotice();
            if (blockNotice) {
              memory.autoBlockNotice = "";
              await stopForAutomationBlock(item, blockNotice);
              return;
            }
            const reason = "Không xác nhận được nút Trả lời sau khi chọn gợi ý";
            log(`Lỗi: ${reason}`);
            await coordinate("release", item);
            s.push({ ...item, reason, skippedAt: Date.now() });
            save(skippedKey, s);
            await returnHome();
            clearCurrentProcessing();
            dashboard();
            break;
          }
          await coordinate("sent", item);
          await coordinate("release", item);
          memory.consecutiveFailures = 0;
          const dailyCount = recordDailyReply();
          p.push({ ...item, completedAt: Date.now() });
          save(processedKey, p);
          resetNoActionScan();
          log(
            "Hoàn thành [Total done: " +
              p.length +
              " | Total skip: " +
              s.length +
              ` | Hôm nay: ${dailyCount}/${readDailyReplyLimit()}]`,
          );
          await pauseSleep(1800);
        }
      }
      await coordinate("release", item);
      dashboard();
      console.log("[Assistant Auto] Đang quay về Home để chuyển bài tiếp theo");
      const returnedHome = await returnHome();
      if (!returnedHome)
        console.warn("[Assistant Auto] Cảnh báo: chưa xác nhận được Home, tiếp tục kiểm tra lại");
      clearCurrentProcessing();
      dashboard();
      await pauseSleep(flowDelay(1200));
      break;
    }
    if (running) {
      if (!(await waitIfPaused())) return;
      window.scrollBy({ top: 450, behavior: "smooth" });
      if (running && !memory.isPaused) timer = setTimeout(loop, flowDelay(2200));
    }
  }
  const resumeCurrentRun = () => {
    if (running) {
      setPaused(false);
      return;
    }
    if (!memory.isPaused || memory.runState !== "paused") return;
    memory.runId ||= createRunId();
    memory.runStartedAt ||= Date.now();
    sessionStart = Number(memory.runStartedAt) || Date.now();
    processedKey = runStorageKey(memory.runId, "processed");
    skippedKey = runStorageKey(memory.runId, "skipped");
    memory.processed = read(processedKey);
    memory.skipped = read(skippedKey);
    activeRunSegmentStartedAt = memory.isAutoResting ? 0 : Date.now();
    memory.isPaused = false;
    globalThis.__assistantAutoFlowPaused = false;
    memory.runState = "running";
    running = true;
    globalThis.__assistantAutoFlowRunning = true;
    markXUsageMode();
    document.dispatchEvent(new Event("assistant-auto-flow-state"));
    syncPauseButton();
    log("Tiếp tục phiên hiện tại · giữ nguyên số liệu");
    dashboard();
    notifyPanel(true);
    sendRuntimeMessage({
      type: "autoFlowPauseState",
      paused: false,
      runId: memory.runId,
    });
    (async () => {
      if (!location.href.includes("/home") && location.pathname !== "/") {
        log("Đang chuyển về Home để tiếp tục phiên");
        await returnHome();
      }
      await loop();
    })().catch((error) => {
      log("Lỗi khi tiếp tục:", error);
      stop("Đã dừng do lỗi khi tiếp tục");
    });
  };
  const currentFlowMetrics = () => {
    const completed = read(processedKey),
      skipped = read(skippedKey),
      elapsedMinutes = Math.max(
        1 / 60,
        (Date.now() - (Number(sessionStart) || Date.now())) / 60_000,
      ),
      dailyLimit = readDailyReplyLimit(),
      dailyCount = readDailyReplyCount();
    return {
      completed: completed.length,
      skipped: skipped.length,
      rate: completed.length / elapsedMinutes,
      elapsedMinutes,
      dailyCount,
      dailyLimit,
    };
  };
  try {
    chrome.runtime.onMessage.addListener((m, _s, send) => {
      if (m?.type === "autoFlowIdentity") {
        send({
          ok: true,
          runId: memory.runId || null,
          enabled: !!memory.runState && memory.runState !== "idle",
          running,
          paused: !!memory.isPaused,
          statusReason: String(memory.lastStopReason || "").slice(0, 240),
          account: own(),
          accountProfile: ownIdentity(),
          metrics: currentFlowMetrics(),
          url: location.href,
        });
        return false;
      }
      if (m?.type === "autoFlowControl") {
        if (m.action === "pause") setPaused(true);
        else if (m.action === "resume") {
          if (memory.isPaused && !running && memory.runState === "paused") resumeCurrentRun();
          else setPaused(false);
        } else if (m.action === "stop") stop("Đã dừng theo yêu cầu từ Telegram");
        send({ ok: true, action: m.action });
        return false;
      }
      if (m?.type !== "autoReplyFlow") return;
      stop("Đã reset phiên");
      if (m.enabled) {
        persistentSettingsReady
          .then(() => {
            const restoredPaused = m.restore === true && m.paused === true;
            sessionStart = Date.now();
            memory.autoRestEnabled = localStorage.getItem("assistantAutoRestEnabled") === "true";
            memory.autoRestEveryMinutes = Math.max(
              1,
              Math.min(1440, Number(localStorage.getItem("assistantAutoRestEveryMinutes")) || 30),
            );
            readConsecutiveFailureLimit();
            scheduleDailyReplyReset();
            memory.runId = createRunId();
            memory.runStartedAt = sessionStart;
            memory.runState = restoredPaused ? "paused" : "running";
            memory.isPaused = restoredPaused;
            memory.lastStopReason = "";
            globalThis.__assistantAutoFlowPaused = restoredPaused;
            memory.isAutoResting = false;
            memory.autoRestUntil = 0;
            activeRunElapsedMs = 0;
            activeRunSegmentStartedAt = restoredPaused ? 0 : sessionStart;
            processedKey = runStorageKey(memory.runId, "processed");
            skippedKey = runStorageKey(memory.runId, "skipped");
            memory.sessionFailures = 0;
            memory.consecutiveFailures = 0;
            memory.autoBlockNotice = "";
            resetNoActionScan();
            memory.processed = [];
            memory.skipped = [];
            memory.logs = [];
            save(processedKey, []);
            save(skippedKey, []);
            running = true;
            globalThis.__assistantAutoFlowRunning = true;
            markXUsageMode();
            document.dispatchEvent(new Event("assistant-auto-flow-state"));
            notifyPanel(true);
            log(
              restoredPaused
                ? `Khôi phục phiên tự động đang tạm dừng · ID ${memory.runId}`
                : `Bắt đầu phiên tự động · ID ${memory.runId}`,
            );
            dashboardView();
            dashboard();
            (async () => {
              // A restored paused session must not navigate or process anything
              // until the user explicitly presses Continue.
              if (restoredPaused && !(await waitIfPaused())) return;
              if (!location.href.includes("/home") && location.pathname !== "/") {
                const currentAuthor = location.pathname
                    .match(/^\/([^/]+)\/status\//i)?.[1]
                    ?.toLowerCase(),
                  excluded = await excludedAuthorSet();
                log(
                  currentAuthor && excluded.has(currentAuthor)
                    ? `Bài của @${currentAuthor} nằm trong danh sách bỏ qua · chuyển về Home`
                    : "Đang chuyển về Home (click 2 lần)",
                );
                const home = document.querySelector("a[data-testid=AppTabBar_Home_Link]");
                home?.click();
                await pauseSleep(700);
                home?.click();
                await pauseSleep(4000);
              }
              loop().catch((e) => {
                log("Lỗi:", e);
                stop("Đã dừng do lỗi");
              });
            })();
          })
          .catch((error) => {
            log("Lỗi khôi phục cài đặt tự động:", error);
            stop("Đã dừng do lỗi khôi phục cài đặt");
          });
      }
      send({ ok: true });
      return false;
    });
  } catch (error) {
    if (!isInvalidatedContext(error)) throw error;
  }
  sendRuntimeMessage({ type: "autoFlowReady" });
})();
