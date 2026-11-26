// Hashtags, mentions and URLs are context, not evidence of the caption language.
// Expand common Vietnamese chat shorthand only as an interpretation hint; keep
// the original target_text unchanged so replies still answer the exact comment.
globalThis.X_REPLY_NORMALIZE = (text) => {
  const value = String(text || "").normalize("NFC");
  if (!/\bt\s*[2-7]\b|\bcn\b|\bz\s+ta\b|\b(?:e|a)\b\s*$/iu.test(value)) return value;
  return value
    .replace(/\bt\s*([2-7])\b/giu, "thứ $1")
    .replace(/\bcn\b/giu, "chủ nhật")
    .replace(/\bz\s+ta\b/giu, "vậy ta")
    .replace(/\be\b/giu, "em")
    .replace(/\ba\b/giu, "anh");
};
globalThis.X_REPLY_LANGUAGE = (text, declared = "") => {
  const prose = String(text)
    .normalize("NFC")
    .replace(/https?:\/\/\S+|[#＃@][\p{L}\p{M}\p{N}_]+/gu, " ");
  // “GM/Gm” is a greeting abbreviation, not meaningful English evidence
  // when Vietnamese words follow it (for example, “Gm em nha”).
  const standaloneGm = prose.replace(/[\p{P}\p{S}\s]/gu, "").toLocaleLowerCase() === "gm";
  const scoredProse = prose.replace(/\b(?:gm)\b/giu, " ");
  const vietnameseShorthand =
    /\bt\s*[2-7]\b|\bcn\b|\bz\s+ta\b|\b(?:e|a)\b\s*$/iu.test(scoredProse);
  const count = (pattern) => (scoredProse.match(pattern) || []).length;
  const latin = count(/\p{Script=Latin}/gu);
  const words = scoredProse.toLocaleLowerCase().match(/\p{Script=Latin}+/gu) || [];
  const viWords = new Set([
    "không",
    "có",
    "của",
    "cho",
    "với",
    "nhưng",
    "đang",
    "được",
    "này",
    "đó",
    "thì",
    "lại",
    "vẫn",
    "một",
    "những",
    "người",
    "anh",
    "em",
    "nha",
    "nhe",
    "ơi",
    "oi",
    "nè",
    "mọi",
    "rất",
    "nay",
    "à",
    "e",
    "thật",
    "nhìn",
    "thấy",
    "nói",
    "về",
    "từ",
    "khi",
    "nếu",
    "mà",
    "đã",
    "sẽ",
    "hơn",
    "cũng",
    "vào",
    "ra",
    "là",
  ]);
  const enWords = new Set([
    "the",
    "and",
    "is",
    "are",
    "was",
    "were",
    "this",
    "that",
    "with",
    "for",
    "from",
    "not",
    "more",
    "good",
    "morning",
    "people",
    "about",
    "have",
    "has",
    "will",
    "would",
    "can",
    "could",
    "it",
    "its",
    "to",
    "of",
    "in",
    "on",
    "a",
    "an",
  ]);
  const viScore = words.filter((word) => viWords.has(word)).length,
    enScore = words.filter((word) => enWords.has(word)).length,
    scored = viScore + enScore;
  const scripts = [
    ["ko", count(/\p{Script=Hangul}/gu)],
    ["ja", count(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu)],
    ["zh", count(/\p{Script=Han}/gu)],
    ["ru", count(/\p{Script=Cyrillic}/gu)],
    ["ar", count(/\p{Script=Arabic}/gu)],
  ];
  // Kana and Han together identify Japanese prose.
  if (scripts[1][1]) {
    scripts[1][1] += scripts[2][1];
    scripts[2][1] = 0;
  }
  scripts.sort((a, b) => b[1] - a[1]);
  if (scripts[0][1] > latin) return scripts[0][0];
  // A standalone “gm!” is itself an English greeting. Do this after script
  // detection so mixed-language comments such as “Gm em nha” remain Vietnamese.
  if (standaloneGm) return "en";
  const greeting = prose.replace(/[\p{P}\p{S}\uFE0F]/gu, " ").replace(/\s+/gu, " ").trim();
  if (/^(?:good\s+)?(?:morning|afternoon|evening)(?:\s+(?:everyone|all|folks|friends))?$/iu.test(greeting))
    return "en";
  if (
    latin &&
    (/[ăđơưảạằẳẵắặầẩẫấậẻẽẹềểễếệỉĩịỏọồổỗốộờởỡớợủụừửữứựỷỹỵ]/i.test(prose) ||
      vietnameseShorthand ||
      (scored >= 2 && viScore / scored >= 0.6))
  )
    return "vi";
  if (latin && scored >= 2 && enScore / scored >= 0.6) return "en";
  // Let the model distinguish Latin languages when X supplied a conflicting script.
  if (latin && /^(?:zh|ja|ko|ru|ar)(?:-|$)/i.test(declared)) return "";
  return declared;
};

const replyWordSegmenters = new Map();
const replyWordSegmentationLanguages = new Set(["ja", "zh", "th", "lo", "km", "my"]);

globalThis.X_REPLY_WORD_COUNT = (text, language) => {
  const value = String(text || "").normalize("NFC");
  if (!replyWordSegmentationLanguages.has(language)) {
    return (value.match(/\S+/gu) || []).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  }
  if (!replyWordSegmenters.has(language)) {
    replyWordSegmenters.set(language, new Intl.Segmenter(language, { granularity: "word" }));
  }
  let words = 0;
  for (const { isWordLike } of replyWordSegmenters.get(language).segment(value)) {
    if (isWordLike) words++;
  }
  return words;
};

globalThis.X_REPLY_WORD_RANGE_INSTRUCTION = ({ min, max }, language) => {
  if (replyWordSegmentationLanguages.has(language)) {
    return min + "-" + max +
      " words inclusive, counted with Intl.Segmenter word boundaries for " + language +
      ". Count word-like segments only, including particles when separately segmented. " +
      "Keep normal spelling without adding artificial spaces. Aim for the middle of the range. ";
  }
  return min + "-" + max +
    " whitespace-separated words inclusive. Count only tokens containing a letter or number. ";
};
