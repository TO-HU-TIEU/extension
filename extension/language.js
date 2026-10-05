// Hashtags, mentions and URLs are context, not evidence of the caption language.
globalThis.X_REPLY_LANGUAGE = (text, declared = '') => {
  const prose = String(text).normalize('NFC')
    .replace(/https?:\/\/\S+|[#＃@][\p{L}\p{M}\p{N}_]+/gu, ' ');
  const count = pattern => (prose.match(pattern) || []).length;
  const latin = count(/\p{Script=Latin}/gu);
  const words = prose.toLocaleLowerCase().match(/\p{Script=Latin}+/gu) || [];
  const viWords = new Set(['không','có','của','cho','với','nhưng','đang','được','này','đó','thì','lại','vẫn','một','những','người','anh','em','mọi','rất','thật','nhìn','thấy','nói','về','từ','khi','nếu','mà','đã','sẽ','hơn','cũng','vào','ra','là']);
  const enWords = new Set(['the','and','is','are','was','were','this','that','with','for','from','not','more','good','morning','people','about','have','has','will','would','can','could','it','its','to','of','in','on','a','an']);
  const viScore = words.filter(word => viWords.has(word)).length, enScore = words.filter(word => enWords.has(word)).length, scored = viScore + enScore;
  const scripts = [
    ['ko', count(/\p{Script=Hangul}/gu)],
    ['ja', count(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu)],
    ['zh', count(/\p{Script=Han}/gu)],
    ['ru', count(/\p{Script=Cyrillic}/gu)],
    ['ar', count(/\p{Script=Arabic}/gu)]
  ];
  // Kana and Han together identify Japanese prose.
  if (scripts[1][1]) { scripts[1][1] += scripts[2][1]; scripts[2][1] = 0; }
  scripts.sort((a, b) => b[1] - a[1]);
  if (scripts[0][1] > latin) return scripts[0][0];
  if (latin && (/[ăđơưảạằẳẵắặầẩẫấậẻẽẹềểễếệỉĩịỏọồổỗốộờởỡớợủụừửữứựỷỹỵ]/i.test(prose) || (scored >= 3 && viScore / scored >= .6))) return 'vi';
  if (latin && scored >= 2 && enScore / scored >= .6) return 'en';
  // Let the model distinguish Latin languages when X supplied a conflicting script.
  if (latin && /^(?:zh|ja|ko|ru|ar)(?:-|$)/i.test(declared)) return '';
  return declared;
};
