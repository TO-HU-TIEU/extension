// Deterministic time context for replies. The model still writes the reply,
// but it receives an explicit, locale-aware policy for time-sensitive posts.
(() => {
  const PERIODS = {
    night: [21, 6],
    morning: [5, 11],
    lunch: [11, 14],
    afternoon: [14, 18],
    dinner: [18, 21],
  };
  const SLEEP =
    /\b(?:good\s*night|gn|night\s+(?:everyone|guys|all)|see\s+(?:u|you)\s+tomorrow|ngủ\s*ngon|chúc\s*ngủ\s*ngon|ngủ\s*sớm|đi\s*ngủ|nghỉ\s*ngơi|tắt\s*máy|ngủ\s*đây)\b/iu;
  const MORNING =
    /\b(?:good\s*morning|gm|morning\s+(?:guys|everyone|all)|chào\s*buổi\s*sáng|buổi\s*sáng|sáng\s*(?:nay|mai)|ăn\s*sáng|bữa\s*sáng|breakfast)\b/iu;
  const LUNCH = /\b(?:ăn\s*trưa|bữa\s*trưa|lunch|buổi\s*trưa|nghỉ\s*trưa|nap|siesta)\b/iu;
  const AFTERNOON = /\b(?:ăn\s*chiều|bữa\s*chiều|afternoon\s*(?:snack|tea)|buổi\s*chiều)\b/iu;
  const DINNER = /\b(?:ăn\s*tối|bữa\s*tối|dinner|good\s*evening|buổi\s*tối)\b/iu;
  const FOOD =
    /\b(?:phở|bún|cơm|cháo|mì|mỳ|bánh mì|cà phê|coffee|tea|tô|món|đồ ăn|ngon|food|meal|eat|ăn)\b/iu;

  function languageFor(post) {
    const text = String(post?.target_text || post?.text || post?.caption || "");
    const declared = String(post?.language_hint || post?.lang || "").toLowerCase();
    let detected = "";
    try {
      detected = String(globalThis.X_REPLY_LANGUAGE?.(text, declared) || "").toLowerCase();
    } catch {}
    return (detected || declared || "en").split(/[-_]/)[0] === "vi" ? "vi" : "en";
  }

  function safeDate(value) {
    const date = value ? new Date(value) : null;
    return date && Number.isFinite(date.getTime()) ? date : null;
  }

  function inPeriod(hour, range) {
    if (!Number.isFinite(hour)) return false;
    const [start, end] = range;
    return start < end ? hour >= start && hour < end : hour >= start || hour < end;
  }

  function hourInZone(date, timeZone) {
    if (!date) return null;
    try {
      return Number(
        new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(
          date,
        ),
      );
    } catch {
      return null;
    }
  }

  function formatDate(date, timeZone, language) {
    if (!date) return "unknown";
    try {
      return new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-US", {
        timeZone,
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
    } catch {
      return date.toISOString();
    }
  }

  function classify(text) {
    const value = String(text || "");
    if (SLEEP.test(value)) return "sleep_night";
    if (MORNING.test(value) || (FOOD.test(value) && /\b(?:sáng|morning|breakfast)\b/iu.test(value)))
      return "morning_breakfast";
    if (LUNCH.test(value)) return "lunch";
    if (AFTERNOON.test(value)) return "afternoon";
    if (DINNER.test(value)) return "dinner";
    return "none";
  }

  function periodFor(hour) {
    return Object.entries(PERIODS).find(([, range]) => inPeriod(hour, range))?.[0] || "unknown";
  }

  function matchingPeriod(intent, hour) {
    const period =
      intent === "sleep_night" ? "night" : intent === "morning_breakfast" ? "morning" : intent;
    return period !== "none" && period !== "unknown" && inPeriod(hour, PERIODS[period]);
  }

  function build(post, now = new Date()) {
    const language = languageFor(post);
    // Vietnamese posts follow Vietnam biological time; English posts use UTC
    // as a stable international reference independent of the user's browser.
    const timeZone = language === "vi" ? "Asia/Ho_Chi_Minh" : "UTC";
    const published = safeDate(
      post?.published_at || post?.publishedAt || post?.created_at || post?.createdAt,
    );
    const captured = safeDate(post?.generated_at || post?.generatedAt);
    const ageHours = published
      ? Math.max(0, (now.getTime() - published.getTime()) / 3600000)
      : null;
    const sourceText = String(post?.target_text || post?.text || post?.caption || "");
    const intent = classify(sourceText);
    const nowHour = hourInZone(now, timeZone);
    const publishedHour = hourInZone(published, timeZone);
    const currentPeriod = periodFor(nowHour);
    const publishedPeriod = periodFor(publishedHour);
    const recent = ageHours !== null && ageHours <= 3;
    const periodMatches = matchingPeriod(intent, nowHour) || matchingPeriod(intent, publishedHour);
    let policy = "none";
    if (intent !== "none" && recent && periodMatches) policy = "recent_mirror";
    else if (intent !== "none") policy = "past_or_mismatch";
    const ageLabel = ageHours === null ? "unknown" : `${ageHours.toFixed(2)}h`;
    const timing =
      policy === "recent_mirror"
        ? "The post is recent (0–3 hours) and its activity period matches the local clock. A natural reciprocal greeting or current meal reaction is allowed when it fits the exact text."
        : policy === "past_or_mismatch"
          ? "Do not answer as if this activity is happening now. Avoid stale good-night/good-morning or current meal wording; react to durable details instead, using a timeless phrase or an anchored past reference only when natural."
          : "No explicit time-sensitive activity was detected; do not invent a meal, sleep, or greeting time.";
    return [
      "TEMPORAL_CONTEXT:",
      `source_language=${language}; timezone=${timeZone}; now_local=${formatDate(now, timeZone, language)}; published_local=${formatDate(published, timeZone, language)}; age_hours=${ageLabel}; current_period=${currentPeriod}; published_period=${publishedPeriod}; temporal_intent=${intent}; temporal_policy=${policy}; captured_at=${formatDate(captured, timeZone, language)}.`,
      timing,
      "For recent sleep/night wishes, reciprocate briefly (for example, a natural good-night response) instead of changing the subject. For recent breakfast/morning or meal invitations, use a simple personal reaction only when supported by the post. After three hours or when the period does not match, shift to a durable reaction to the food, mood, or wording; do not force a question.",
      "CONVERSATION_CONTINUATION: If target_text is already a reply in a thread, do not repeat its compliment or restate the same conclusion. Treat it as the latest turn and add a new concrete detail, nuance, or natural next-turn response. For fashion comments, move to a different visible detail such as layering, accessory, silhouette or setting rather than praising the same colors or energy again.",
      "REASONING_PROTOCOL: Before drafting, silently classify (1) the exact speaker and turn being answered, (2) content type: text, media_only, minimal, link_only, quote or mixed, (3) the post intent such as question, confirmation, report, joke, opinion, request or disclosure, (4) the strongest verified text/media evidence, (5) the original language rather than translated UI text, (6) what has already been said in ancestor turns, and (7) the safest useful response mode. For media_only or minimal posts, use visible media evidence without inventing a caption; for a reply chain, answer the focused target while using only the nearest 5–8 relevant turns as context. Generate several internal candidate angles, reject candidates that repeat, invent facts, answer the wrong speaker, overreact to appearance, change domain, or mistake a quote/translation for the author's words, then return only the strongest distinct replies with meaningful relevance scores. Prefer a simple direct answer when the context is simple; use deeper analysis only when the post genuinely requires it.",
    ].join(" ");
  }

  globalThis.XReplyTime = Object.freeze({ build, classify, languageFor, periodFor });
})();
