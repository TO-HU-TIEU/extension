(() => {
  const limit = (key, fallback) => globalThis.RemoteConfig?.get("limits")?.[key] || fallback;
  const clean = (value) =>
    String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  function stripSourceFooter(value) {
    let text = clean(value),
      changed = true;
    const source =
      "(?:Odaily|PA\\s*News|PANews|The\\s*Block|CoinDesk|Cointelegraph|Bloomberg|Reuters|Decrypt|Wu\\s*Blockchain|SoSoValue|CryptoSlate|TechFlow|Foresight\\s*News|BlockBeats|NewsBTC|U\\.Today|Watcher\\s*Guru|[A-Z][A-Za-z0-9&.,\\- ]{1,40}(?:News|Daily|Research|Capital|Labs|Media))";
    const bracketed = new RegExp(
      `(?:\\s*(?:\\[|【|\\()\\s*${source}\\s*(?:\\]|】|\\))[.。]*)+$`,
      "iu",
    );
    const anyBracketedFooter = /(?:\s*(?:\[[^\]\n]{1,80}\]|【[^】\n]{1,80}】)[.。]*)+$/u;
    const bareLine = new RegExp(`(?:\\n\\s*(?:Source\\s*:\\s*)?${source}\\s*[.。]*)+$`, "iu");
    while (changed) {
      const next = clean(
        text.replace(bracketed, "").replace(anyBracketedFooter, "").replace(bareLine, ""),
      );
      changed = next !== text;
      text = next;
    }
    return text;
  }
  function normalizeTitle(value) {
    return clean(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }
  function stripRepeatedLead(title, value) {
    let text = clean(value),
      key = normalizeTitle(title);
    if (!text || !key) return text;
    const parts = text
      .split(/\n+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length > 1 && normalizeTitle(parts[0]) === key)
      text = clean(parts.slice(1).join("\n\n"));
    const escaped = String(title || "")
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const direct = escaped && new RegExp("^" + escaped + "\\s*([.!?。！？:]\\s*)?", "iu");
    if (direct && direct.test(text)) return clean(text.replace(direct, ""));
    const firstSentence = text.match(/^(.{8,260}?[.!?。！？])\s+/u)?.[1];
    return firstSentence && normalizeTitle(firstSentence.replace(/[.!?。！？]+$/u, "")) === key
      ? clean(text.slice(firstSentence.length))
      : text;
  }
  function sourceRules(value) {
    const lines = Array.isArray(value) ? value : String(value || "").split("\n");
    const rules = [
      ...new Set(
        lines
          .map((line) => String(line).trim())
          .filter(Boolean)
          .map((line) => {
            const url = new URL(line.includes("://") ? line : `https://${line}`);
            if (
              url.protocol !== "https:" ||
              url.username ||
              url.password ||
              url.port ||
              !url.hostname.includes(".")
            )
              throw new Error("Nguồn phải là địa chỉ HTTPS hợp lệ.");
            url.hash = "";
            url.pathname = url.pathname.replace(/\/+$/, "") || "/";
            return url.href;
          }),
      ),
    ];
    if (rules.length > limit("maxSources", 20)) throw new Error("Tối đa 20 nguồn.");
    return rules;
  }
  function matches(raw, rules) {
    try {
      const url = new URL(raw);
      return rules.some((rule) => {
        const source = new URL(rule),
          path = source.pathname.replace(/\/$/, "");
        return (
          url.origin === source.origin &&
          (!path || url.pathname === path || url.pathname.startsWith(path + "/")) &&
          (!source.search || source.search === url.search)
        );
      });
    } catch {
      return false;
    }
  }
  const origins = (rules) => [...new Set(rules.map((rule) => `${new URL(rule).origin}/*`))];
  function fingerprint(text) {
    let hash = 2166136261;
    for (const character of text) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }
  function article(input, sourceUrl) {
    const rawText = stripSourceFooter(input.text).slice(0, limit("maxSourceCharacters", 10000));
    if (rawText.length < limit("minSourceCharacters", 80)) return null;
    let url;
    try {
      url = new URL(input.url || sourceUrl, sourceUrl);
    } catch {
      return null;
    }
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()])
      if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
    const page = new URL(sourceUrl);
    page.hash = "";
    const explicitTitle = clean(input.title).slice(0, 200),
      title = explicitTitle || rawText.split("\n")[0].slice(0, 160),
      candidateText = explicitTitle ? stripRepeatedLead(title, rawText) : rawText,
      text = candidateText.length >= limit("minSourceCharacters", 80) ? candidateText : rawText;
    if (text.length < limit("minSourceCharacters", 80)) return null;
    const identity = url.href === page.href ? `${url.href}|${text}` : url.href;
    return {
      id: "article-" + fingerprint(identity),
      url: url.href,
      sourceUrl: page.href,
      title,
      text,
      language: globalThis.X_REPLY_LANGUAGE(text, clean(input.lang).slice(0, 35)),
      publishedAt: globalThis.ContentReader?.date(input.publishedAt) || null,
      publishedApproximate: !!input.publishedApproximate,
      publishedLabel: clean(input.publishedLabel).slice(0, 60),
      discoveredAt: new Date().toISOString(),
      status: "inbox",
      translationStatus: "idle",
      translationVi: null,
      drafts: [],
    };
  }
  const emptyState = () => ({ version: 1, items: [], skipped: [] });
  function ingest(state, inputs, sourceUrl) {
    const known = new Set([...state.items.map((item) => item.id), ...state.skipped]);
    let added = 0;
    for (const input of inputs.slice(0, 20)) {
      const item = article(input, sourceUrl);
      if (!item) continue;
      const existing = state.items.find((value) => value.id === item.id);
      if (existing && existing.status === "inbox") {
        if (item.publishedAt && !existing.publishedAt) {
          existing.publishedAt = item.publishedAt;
          existing.publishedApproximate = item.publishedApproximate;
          existing.publishedLabel = item.publishedLabel;
        }
        if (item.text !== existing.text) {
          existing.text = item.text;
          existing.title = item.title;
          existing.language = item.language;
          existing.translationVi = null;
          existing.translationStatus = /^vi(?:-|$)/i.test(item.language) ? "done" : "idle";
          existing.revision = (existing.revision || 0) + 1;
        }
      }
      if (known.has(item.id) || state.items.length >= limit("maxArticles", 120)) continue;
      known.add(item.id);
      state.items.push(item);
      added++;
      if (/^vi(?:-|$)/i.test(item.language)) item.translationStatus = "done";
    }
    return added;
  }
  function transition(state, id, action) {
    const item = state.items.find((item) => item.id === id);
    if (!item) throw new Error("Bài đã được xử lý ở bảng khác.");
    if (action === "translate") {
      if (/^vi(?:-|$)/i.test(item.language || "") || item.translationStatus === "done") return item;
      item.translationStatus = "queued";
      item.translationError = "";
      return item;
    }
    if (action === "remove") {
      state.items = state.items.filter((value) => value.id !== id);
      state.skipped = [...new Set([...state.skipped, id])].slice(-500);
      return null;
    }
    if (action === "skip") {
      if (item.status !== "inbox") throw new Error("Chỉ bỏ qua bài trong danh sách quét.");
      state.items = state.items.filter((value) => value.id !== id);
      state.skipped = [...new Set([...state.skipped, id])].slice(-500);
      return null;
    }
    if (action === "queue") {
      if (item.status !== "inbox") return item;
      if (state.items.filter((value) => value.status !== "inbox").length >= limit("maxQueue", 120))
        throw new Error("Mục chờ đăng đã đầy.");
      item.status = item.drafts?.length === 2 ? "ready" : "queued";
      item.error = "";
      item.revision = (item.revision || 0) + 1;
      return item;
    }
    if (action === "return") {
      item.status = "inbox";
      item.revision = (item.revision || 0) + 1;
      return item;
    }
    if (action === "retry") {
      if (item.status === "error") {
        item.status = "queued";
        item.error = "";
      } else if (item.translationStatus === "error") {
        item.translationStatus = "queued";
        item.translationError = "";
      }
      return item;
    }
    throw new Error("Thao tác không hợp lệ.");
  }
  function swipe(dx, dy, width = 320) {
    return Math.abs(dx) >= Math.max(55, Math.min(100, width * 0.22)) &&
      Math.abs(dx) > Math.abs(dy) * 1.4
      ? dx < 0
        ? "queue"
        : "skip"
      : null;
  }
  function drafts(value) {
    if (!Array.isArray(value?.drafts) || value.drafts.length !== 2)
      throw new Error("Mô hình chưa trả về content hợp lệ.");
    const result = value.drafts.map((text) => {
      if (
        typeof text !== "string" ||
        text.trim().length < 80 ||
        Array.from(text.trim()).length > 520 ||
        text.includes("```")
      )
        throw new Error("Mẫu bài viết chưa đúng định dạng.");
      const paragraphs = text.trim().split(/\n\s*\n/);
      if (
        paragraphs.length < 2 ||
        paragraphs.length > 3 ||
        paragraphs.some((paragraph) => Array.from(paragraph).length > 350)
      )
        throw new Error("Mỗi mẫu cần 2–3 đoạn rõ ràng.");
      if (globalThis.X_REPLY_LANGUAGE(text, "") !== "vi")
        throw new Error("Mẫu bài viết phải bằng tiếng Việt.");
      return text.trim();
    });
    if (result[0] === result[1]) throw new Error("Content gợi ý bị trùng.");
    return result;
  }
  function ordered(items) {
    return items
      .slice()
      .sort(
        (a, b) =>
          Number(!!b.publishedAt) - Number(!!a.publishedAt) ||
          (Date.parse(b.publishedAt || b.discoveredAt) || 0) -
            (Date.parse(a.publishedAt || a.discoveredAt) || 0),
      );
  }
  function batch(state, ids, action) {
    const selected = [...new Set(ids)].filter((id) =>
      state.items.some((item) => item.id === id && item.status === "inbox"),
    );
    if (!["queue", "skip"].includes(action)) throw new Error("Thao tác không hợp lệ.");
    if (
      action === "queue" &&
      state.items.filter((item) => item.status !== "inbox").length + selected.length >
        limit("maxQueue", 120)
    )
      throw new Error("Mục chờ đăng đã đầy.");
    for (const id of selected) transition(state, id, action);
    return selected.length;
  }
  function clearInbox(state) {
    const count = state.items.length;
    state.items = [];
    state.skipped = [];
    return count;
  }
  globalThis.ContentCore = {
    limit,
    ordered,
    batch,
    clearInbox,
    clean,
    stripSourceFooter,
    stripRepeatedLead,
    sourceRules,
    matches,
    origins,
    article,
    emptyState,
    ingest,
    transition,
    swipe,
    drafts,
  };
})();
