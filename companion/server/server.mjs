import http from 'node:http';
import { createExtensionUpdater } from './extension-updater.mjs';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createAuth } from './auth.mjs';
import { validatePost, buildRequest, consumeResponseStream, parseReplies, completeTranslations } from './replies.mjs';
let config;
try { config = (await import('./config.local.mjs')).default; }
catch { throw new Error('Chạy npm run setup trước để tạo config.local.mjs.'); }
if (!Number.isInteger(config.port) || config.port < 1024 || config.port > 65535 || typeof config.localToken !== 'string' || config.localToken.length < 32) {
  throw new Error('Cấu hình port/localToken không hợp lệ.');
}
const auth = await createAuth(config.port);
const extensionUpdater = createExtensionUpdater(config);
const cache = new Map();
let busy = false;
const hash = value => createHash('sha256').update(value).digest();
const matchesToken = value => typeof value === 'string' && timingSafeEqual(hash(value), hash(config.localToken));
const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > 16000000) throw new Error('Request quá lớn.');
  }
  return raw ? JSON.parse(raw) : {};
}
async function openai(path, token, options = {}) {
  const response = await fetch(`https://api.openai.com/v1/${path}`, {
    ...options, headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers },
    signal: options.signal || AbortSignal.timeout(20000)
  });
  if (!response.ok) {
    let detail;
    try { detail = await response.json(); } catch { /* Non-JSON gateway errors. */ }
    const code = detail?.error?.code || '';
    if (response.status === 401) throw new Error('OpenAI 401: phiên đăng nhập/key không còn hợp lệ. Đăng nhập lại hoặc kiểm tra key.');
    if (response.status === 429) throw new Error(`OpenAI 429 (${code || 'limit'}): hết hạn mức hoặc vượt tốc độ. Kiểm tra Usage/billing rồi thử lại.`);
    if (response.status === 403) throw new Error('OpenAI 403: tài khoản hoặc mô hình chưa được cấp quyền.');
    throw new Error(`OpenAI ${response.status}: ${detail?.error?.message || 'Yêu cầu không thành công.'}`);
  }
  return response;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.headers.host !== `127.0.0.1:${config.port}`) return json(res, 403, { error: 'Host không hợp lệ.' });
  const url = new URL(req.url, `http://127.0.0.1:${config.port}`);
  if (url.pathname === '/auth/callback' && req.method === 'GET') {
    try {
      const enabled = await auth.callback(url);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" });
      res.end(`<meta charset="utf-8"><h2>${enabled ? 'Đã kết nối ChatGPT' : 'Đã đăng nhập; chưa có quyền dùng gói ChatGPT'}</h2><p>Đóng tab này, quay lại X và bấm Làm mới kết nối.</p>`);
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" });
      res.end(`<meta charset="utf-8"><h2>Đăng nhập chưa thành công</h2><p>${escapeHtml(error.message)}</p><p>Quay lại extension, làm mới kết nối và đăng nhập lại.</p>`);
    }
    return;
  }
  const origin = req.headers.origin;
  if (origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) return json(res, 403, { error: 'Chỉ extension được phép gọi server.' });
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Local-Token');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (!matchesToken(req.headers['x-local-token'])) return json(res, 401, { error: 'Local token không khớp. Chạy setup hoặc kiểm tra hai file config.local.' });
  try {
    if (req.method === 'GET' && url.pathname === '/extension-update/status') return json(res, 200, await extensionUpdater.status());
    if (req.method === 'POST' && url.pathname === '/extension-update/install') {
      if (busy) return json(res, 409, { error: 'Chờ tác vụ gợi ý hoàn tất trước khi cập nhật.' });
      return json(res, 200, await extensionUpdater.install());
    }
    if (req.method === 'GET' && url.pathname === '/status') {
      return json(res, 200, { ...auth.summary(), apiConfigured: Boolean(config.openaiApiKey), apiModel: config.apiModel });
    }
    if (req.method === 'POST' && url.pathname === '/auth/start') {
      const data = await readJson(req); return json(res, 200, await auth.start(data.profileId || null));
    }
    if (req.method === 'POST' && url.pathname === '/auth/select') {
      const data = await readJson(req); cache.clear(); return json(res, 200, await auth.select(data.id));
    }
    if (req.method === 'POST' && url.pathname === '/auth/disconnect') {
      if (busy) throw new Error('Hủy tác vụ tạo gợi ý trước khi ngắt kết nối.');
      cache.clear(); return json(res, 200, await auth.disconnect());
    }
    if (req.method === 'GET' && url.pathname === '/models') {
      const credential = await auth.credential();
      const value = await (await openai('models', credential.token)).json();
      const models = (value.models || []).filter(m => m.visibility === 'list').map(m => ({ id: m.slug, name: m.display_name || m.slug }));
      if (!models.length) throw new Error('Không có mô hình dành cho tài khoản này. Kiểm tra quyền hoặc dùng API.');
      return json(res, 200, { models });
    }
    if (req.method === 'POST' && url.pathname === '/suggest') {
      if (busy) return json(res, 409, { error: 'Đang tạo gợi ý. Chờ hoàn tất hoặc hủy tác vụ trước.' });
      const input = await readJson(req);
      const post = validatePost(input.post);
      const mode = input.mode === 'api' ? 'api' : 'plus';
      busy = true;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs);
      res.on('close', () => { if (!res.writableEnded) controller.abort(); });
      try {
        const credential = mode === 'plus' ? await auth.credential() : { token: config.openaiApiKey, profileId: 'api' };
        if (!credential.token) throw new Error('Điền openaiApiKey trong server/config.local.mjs rồi khởi động lại server.');
        const model = mode === 'api' ? config.apiModel : String(input.model || '');
        if (!model || model.length > 120) throw new Error('Hãy chọn mô hình sau khi làm mới kết nối.');
        const cacheKey = hash(JSON.stringify([credential.profileId, mode, model, post])).toString('hex');
        const cached = cache.get(cacheKey);
        if (!input.force && cached && cached.until > Date.now()) return json(res, 200, { result: cached.result, cached: true, model, mediaAnalyzed: post.media_urls.length + (post.media_inline?.length || 0) });
        const start = Date.now();
        const response = await openai('responses', credential.token, {
          method: 'POST', body: JSON.stringify(buildRequest(model, post, mode)), signal: controller.signal
        });
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8' });
        const send = data => { if (!res.destroyed) res.write(`${JSON.stringify(data)}\n`); };
        send({ type: 'status', message: 'AI đang viết gợi ý…' });
        let last = 0;
        let result = await consumeResponseStream(response, () => {
          if (Date.now() - last > 400) { send({ type: 'progress' }); last = Date.now(); }
        }, post.reply_count,raw=>parseReplies(raw,post.reply_count,true));
        result=await completeTranslations(result,post,model,mode,async request=>{const translation=await openai('responses',credential.token,{method:'POST',body:JSON.stringify(request),signal:controller.signal});return consumeResponseStream(translation,()=>{},post.reply_count,JSON.parse)});
        if (post.media_expected && (!result.grounding?.media_observation?.trim() || result.grounding.confidence === 'no_media')) throw new Error('Mô hình chưa phân tích được media. Hãy tạo lại hoặc chọn model multimodal khác.');
        for (const [key, value] of cache) if (value.until < Date.now()) cache.delete(key);
        if (cache.size >= 100) cache.delete(cache.keys().next().value);
        cache.set(cacheKey, { result, until: Date.now() + 10 * 60 * 1000 });
        send({ type: 'result', result, cached: false, model, mediaAnalyzed: post.media_urls.length + (post.media_inline?.length || 0), elapsedMs: Date.now() - start });
        res.end();
      } catch (error) {
        const message = controller.signal.aborted ? 'Tác vụ đã bị hủy hoặc hết thời gian chờ. Thử tạo lại.' : error.message;
        if (!res.destroyed) {
          if (res.headersSent) { res.write(`${JSON.stringify({ type: 'error', error: message })}\n`); res.end(); }
          else json(res, 400, { error: message });
        }
      } finally { clearTimeout(timer); busy = false; }
      return;
    }
    json(res, 404, { error: 'Route không tồn tại.' });
  } catch (error) { if (!res.headersSent) json(res, 400, { error: error.message }); }
});
server.requestTimeout = 70000;
server.headersTimeout = 15000;
server.listen(config.port, '127.0.0.1', () => {
  console.log(`X Reply Assistant: http://127.0.0.1:${config.port}`);
  console.log('Mở X, bấm icon extension để mở bảng gợi ý. Ctrl+C để dừng.');
  console.log(`Thông tin đăng nhập local: ${auth.storagePath} (không chia sẻ thư mục này).`);
});
