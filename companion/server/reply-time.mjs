const PERIODS = { night: [21, 6], morning: [5, 11], lunch: [11, 14], afternoon: [14, 18], dinner: [18, 21] };
const SLEEP = /\b(?:good\s*night|gn|night\s+(?:everyone|guys|all)|see\s+(?:u|you)\s+tomorrow|ngủ\s*ngon|chúc\s*ngủ\s*ngon|ngủ\s*sớm|đi\s*ngủ|nghỉ\s*ngơi|tắt\s*máy|ngủ\s*đây)\b/iu;
const MORNING = /\b(?:good\s*morning|gm|morning\s+(?:guys|everyone|all)|chào\s*buổi\s*sáng|buổi\s*sáng|sáng\s*(?:nay|mai)|ăn\s*sáng|bữa\s*sáng|breakfast)\b/iu;
const LUNCH = /\b(?:ăn\s*trưa|bữa\s*trưa|lunch|buổi\s*trưa|nghỉ\s*trưa|nap|siesta)\b/iu;
const AFTERNOON = /\b(?:ăn\s*chiều|bữa\s*chiều|afternoon\s*(?:snack|tea)|buổi\s*chiều)\b/iu;
const DINNER = /\b(?:ăn\s*tối|bữa\s*tối|dinner|good\s*evening|buổi\s*tối)\b/iu;
const FOOD = /\b(?:phở|bún|cơm|cháo|mì|mỳ|bánh mì|cà phê|coffee|tea|tô|món|đồ ăn|ngon|food|meal|eat|ăn)\b/iu;

const inPeriod = (hour, [start, end]) => Number.isFinite(hour) && (start < end ? hour >= start && hour < end : hour >= start || hour < end);
const hourInZone = (date, timeZone) => { try { return Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(date)); } catch { return null; } };
const classify = text => {
  const value = String(text || '');
  if (SLEEP.test(value)) return 'sleep_night';
  if (MORNING.test(value) || FOOD.test(value) && /\b(?:sáng|morning|breakfast)\b/iu.test(value)) return 'morning_breakfast';
  if (LUNCH.test(value)) return 'lunch';
  if (AFTERNOON.test(value)) return 'afternoon';
  if (DINNER.test(value)) return 'dinner';
  return 'none';
};
const periodFor = hour => Object.entries(PERIODS).find(([, range]) => inPeriod(hour, range))?.[0] || 'unknown';
const intentPeriod = intent => intent === 'sleep_night' ? 'night' : intent === 'morning_breakfast' ? 'morning' : intent;

export function temporalInstructions(post, now = new Date()) {
  const language = /^vi(?:-|$)/i.test(String(post?.language_hint || '')) ? 'vi' : 'en';
  const timeZone = language === 'vi' ? 'Asia/Ho_Chi_Minh' : 'UTC';
  const published = new Date(post?.published_at || '');
  const validPublished = Number.isFinite(published.getTime()) ? published : null;
  const ageHours = validPublished ? Math.max(0, (now.getTime() - validPublished.getTime()) / 3600000) : null;
  const intent = classify(post?.target_text);
  const currentHour = hourInZone(now, timeZone);
  const publishedHour = validPublished ? hourInZone(validPublished, timeZone) : null;
  const period = intentPeriod(intent);
  const periodMatches = period && PERIODS[period] && (inPeriod(currentHour, PERIODS[period]) || inPeriod(publishedHour, PERIODS[period]));
  const policy = intent !== 'none' && ageHours !== null && ageHours <= 3 && periodMatches ? 'recent_mirror' : intent === 'none' ? 'none' : 'past_or_mismatch';
  const age = ageHours === null ? 'unknown' : `${ageHours.toFixed(2)}h`;
  return `TEMPORAL_CONTEXT: source_language=${language}; timezone=${timeZone}; age_hours=${age}; current_period=${periodFor(currentHour)}; published_period=${periodFor(publishedHour)}; temporal_intent=${intent}; temporal_policy=${policy}. ${policy === 'recent_mirror' ? 'The post is recent (0–3 hours) and matches the local activity period, so a brief reciprocal sleep greeting or current meal reaction is allowed when grounded in the text.' : policy === 'past_or_mismatch' ? 'Do not answer as if this activity is happening now. Avoid stale good-night/good-morning or current meal wording; react to durable food, mood, or wording details instead.' : 'Do not invent a meal, sleep, or greeting time. Keep the reaction grounded and timeless.'} For recent breakfast or meal invitations, use a simple personal reaction only when supported by the post; after three hours or a period mismatch, shift to a durable detail and avoid routine questions.`;
}
