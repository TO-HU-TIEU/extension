(() => {
  const defaults = [
    ["natural", "Mặc định", "Tự nhiên, gọn, có duyên, tiếng lóng nhẹ khi phù hợp."],
    ["serious", "Trang trọng", "Điềm tĩnh, lịch sự, rõ ý, không đùa với nội dung nghiêm túc."],
    ["witty", "Hóm hỉnh", "Hóm hỉnh về tình huống, không công kích cá nhân."],
    ["insight", "Phân tích", "Thêm góc nhìn cụ thể dựa trên dữ kiện, không suy diễn."],
    [
      "cultivation",
      "Tiên hiệp",
      "Ví von tiên hiệp dí dỏm khi hợp ngữ cảnh, không làm sai sự việc.",
    ],
  ].map(([id, name, prompt]) => ({ id, name, prompt }));
  const names = {
      natural: "Mặc định",
      serious: "Trang trọng",
      witty: "Hóm hỉnh",
      insight: "Phân tích",
      cultivation: "Tiên hiệp",
    },
    aliases = {
      natural: ["Teen (Mặc định)", "Teen", "Tự nhiên trên X", "Mặc định"],
      serious: ["Nghiêm túc", "Trang trọng"],
      witty: ["Châm biếm nhẹ", "Hóm hỉnh"],
      insight: ["Có góc nhìn", "Phân tích"],
      cultivation: ["Tiên hiệp"],
    };
  const label = (style) => {
    const id = style?.id || style?.styleId;
    return Object.prototype.hasOwnProperty.call(aliases, id) && aliases[id].includes(style.name)
      ? names[id]
      : style?.name || "";
  };
  const handle = (value) => {
    try {
      const path = new URL(value, "https://x.com").pathname;
      const name = path.match(/^\/([A-Za-z0-9_]{1,15})(?:\/|$)/)?.[1];
      return name &&
        !/^(home|explore|notifications|messages|search|settings|i|compose|intent)$/i.test(name)
        ? name.toLowerCase()
        : "";
    } catch {
      return "";
    }
  };
  const catalog = (s) => {
    const source = s.replyStyleCatalog?.length
      ? s.replyStyleCatalog
      : [...(s.remotePresetCache?.styles || defaults), ...(s.customStyles || [])];
    return source
      .filter(
        (x) =>
          x &&
          typeof x.id === "string" &&
          typeof x.name === "string" &&
          typeof x.prompt === "string",
      )
      .map((x) => ({
        id: x.id.slice(0, 80),
        name: label(x).slice(0, 80),
        prompt: x.prompt.slice(0, 6000),
      }));
  };
  const personFor = (s, value) => {
    const key = handle(value),
      map = s.personalReplyStyles;
    return map &&
      Object.prototype.hasOwnProperty.call(map, key) &&
      map[key] &&
      typeof map[key] === "object"
      ? map[key]
      : null;
  };
  function classifyType(post = {}) {
    const text = String(post.target_text || post.text || "").trim(),
      hasText = !!text,
      hasMedia =
        Number(post.mediaCount ?? post.media_count ?? 0) > 0 ||
        (Array.isArray(post.mediaUrls) && post.mediaUrls.length > 0) ||
        (Array.isArray(post.media_urls) && post.media_urls.length > 0) ||
        (Array.isArray(post.mediaInline) && post.mediaInline.length > 0) ||
        (Array.isArray(post.media_inline) && post.media_inline.length > 0) ||
        (!!post.mediaKind && post.mediaKind !== "none") ||
        (!!post.media_kind && post.media_kind !== "none");
    let context = post.context || post.embedded || "";
    if (typeof context === "string") {
      try {
        context = JSON.parse(context);
      } catch {
        context = {};
      }
    }
    const embedded = Array.isArray(context?.embedded)
        ? context.embedded
        : Array.isArray(post.embedded)
          ? post.embedded
          : [],
      hasLink = embedded.some((item) => /quoted_post|link_preview/i.test(String(item?.type || "")));
    if (hasText && hasMedia) return hasLink ? "text+media+link" : "text+media";
    if (hasText && hasLink) return "text+link";
    if (hasText) return "text";
    if (hasMedia) return hasLink ? "media+link" : "media-only";
    if (hasLink) return "link-only";
    return "other";
  }
  function languageOf(post = {}) {
    const text = String(post.target_text || post.text || "").trim(),
      declared = String(post.lang || post.language_hint || "");
    try {
      return text && globalThis.X_REPLY_LANGUAGE
        ? String(globalThis.X_REPLY_LANGUAGE(text, declared) || "").split("-")[0]
        : String(declared).split("-")[0];
    } catch {
      return String(declared).split("-")[0];
    }
  }
  function corpusHint(post, corpus) {
    if (!Array.isArray(corpus)) return "";
    const type = classifyType(post),
      language = languageOf(post),
      typed = corpus.filter(
        (item) => item && item.type === type && typeof item.reply === "string" && item.reply.trim(),
      );
    if (!typed.length) return "";
    const sameLanguage = language ? typed.filter((item) => item.language === language) : [],
      languageGroups = new Map();
    if (sameLanguage.length) {
      languageGroups.set(language, sameLanguage);
    } else if (!language) {
      for (const item of typed) {
        const key = item.language || "";
        languageGroups.set(key, [...(languageGroups.get(key) || []), item]);
      }
    }
    const chosenLanguage = sameLanguage.length
      ? language
      : [...languageGroups.entries()].sort((a, b) => b[1].length - a[1].length)[0]?.[0];
    let relevant = languageGroups.get(chosenLanguage) || [];
    if (!relevant.length) return "";
    const mediaKind = String(post.mediaKind || post.media_kind || ""),
      sameMediaKind = mediaKind ? relevant.filter((item) => item.mediaKind === mediaKind) : [];
    if (sameMediaKind.length >= 2) relevant = sameMediaKind;
    const wordCounts = relevant.map((item) => (item.reply.trim().match(/\S+/gu) || []).length),
      averageWords = Math.round(wordCounts.reduce((sum, n) => sum + n, 0) / wordCounts.length),
      punctuation = relevant.reduce((counts, item) => {
        const end = item.reply.trim().slice(-1),
          key = end === "!" ? "!" : end === "?" ? "?" : /[.!?…]$/u.test(end) ? "period" : "none";
        counts[key] = (counts[key] || 0) + 1;
        return counts;
      }, {}),
      ending = Object.entries(punctuation).sort((a, b) => b[1] - a[1])[0]?.[0] || "none",
      examples = relevant
        .slice()
        .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
        .slice(0, 3)
        .map((item) => item.reply.trim());
    const confidence =
      relevant.length < 5 ? "Dữ liệu còn ít, chỉ tham khảo" : "Xu hướng từ tập mẫu";
    return `\nMẫu tự viết theo loại bài ${type}${mediaKind ? `/${mediaKind}` : ""}${chosenLanguage ? `, ngôn ngữ ${chosenLanguage}` : ""} (${relevant.length} mẫu; ${confidence}): thường khoảng ${averageWords} từ, kiểu kết câu ${ending}. Chỉ xem đây là xu hướng giọng văn; dùng tối đa các ví dụ gần ngữ cảnh sau để học nhịp/cách diễn đạt, không sao chép câu hoặc lấy nội dung làm dữ kiện: ${JSON.stringify(examples)}`;
  }
  function resolve(post, s) {
    const person = personFor(s, post.url),
      list = catalog(s),
      preset = person && (list.find((x) => x.id === person.styleId) || person);
    const baseStyle = preset
      ? `${preset.prompt || ""}${person.extraPrompt ? "\nYêu cầu riêng cho tài khoản này: " + String(person.extraPrompt).slice(0, 2000) : ""}`
      : post.style ||
        list.find((x) => x.id === s.styleId)?.prompt ||
        s.stylePrompt ||
        defaults[0].prompt;
    const learnedHint = corpusHint(post, s.replyStyleCorpus);
    const styleAdditions = learnedHint,
      baseLimit = Math.max(0, 8000 - styleAdditions.length);
    return {
      ...post,
      style: `${String(baseStyle).slice(0, baseLimit)}${styleAdditions}`,
      fastMode: !!s.fastReplyMode,
    };
  }
  globalThis.ReplyPreferences = {
    handle,
    catalog,
    resolve,
    label,
    person: personFor,
    classifyType,
  };
})();
