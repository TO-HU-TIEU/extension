/* Pure reply schema and input validators shared by every runtime. */
(() => {
  const X_HOSTS = new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com"]);
  const MEDIA_HOSTS = new Set(["pbs.twimg.com", "video.twimg.com"]);
  const REPLY_SCHEMA = Object.freeze({
    type: "object",
    additionalProperties: false,
    properties: {
      source_language: { type: "string" },
      grounding: {
        type: "object",
        additionalProperties: false,
        properties: {
          media_observation: { type: "string" },
          combined_context: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low", "no_media"] },
        },
        required: ["media_observation", "combined_context", "confidence"],
      },
      replies: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          properties: { reply: { type: "string" }, translation_vi: { type: ["string", "null"] } },
          required: ["reply", "translation_vi"],
        },
      },
    },
    required: ["source_language", "grounding", "replies"],
  });
  const schemaForCount = (count) => ({
    ...REPLY_SCHEMA,
    properties: {
      ...REPLY_SCHEMA.properties,
      replies: { ...REPLY_SCHEMA.properties.replies, minItems: count, maxItems: count },
    },
  });
  const parsePostUrl = (value) => {
    let url;
    try {
      url = new URL(value || "");
    } catch {
      throw new Error("URL bài viết không hợp lệ.");
    }
    if (url.protocol !== "https:" || !X_HOSTS.has(url.hostname))
      throw new Error("URL bài viết không hợp lệ.");
    const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)(?:\/|$)/);
    if (!match) throw new Error("Cần mở đúng đường dẫn bài viết chi tiết.");
    return { author: match[1], id: match[2], url: `https://x.com/${match[1]}/status/${match[2]}` };
  };
  const mediaUrls = (values, { strictPaths = false } = {}) =>
    [...new Set(Array.isArray(values) ? values : [])]
      .filter((value) => {
        try {
          const url = new URL(value);
          if (url.protocol !== "https:" || !MEDIA_HOSTS.has(url.hostname)) return false;
          return (
            !strictPaths ||
            url.hostname === "video.twimg.com" ||
            /^\/(?:media|ext_tw_video_thumb|amplify_video_thumb|tweet_video_thumb)\//.test(
              url.pathname,
            )
          );
        } catch {
          return false;
        }
      })
      .slice(0, 4);
  const inlineMedia = (values) =>
    (Array.isArray(values) ? values : [])
      .filter(
        (value) =>
          typeof value === "string" &&
          /^data:image\/(?:jpeg|png|webp);base64,/.test(value) &&
          value.length < 3_000_000,
      )
      .slice(0, 5);
  const replyCount = (value) => Math.min(10, Math.max(1, Number.parseInt(value, 10) || 3));
  globalThis.X_REPLY_CONTRACT = Object.freeze({
    REPLY_SCHEMA,
    schemaForCount,
    parsePostUrl,
    mediaUrls,
    inlineMedia,
    replyCount,
  });
})();
