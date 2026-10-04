import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { userInfo } from 'node:os';

const AUTH = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const DATA = new URL('./.data/', import.meta.url);
const AUTH_FILE = new URL('accounts.dat', DATA);
const LEGACY_AUTH_FILE = new URL('accounts.json', DATA);
const random = () => randomBytes(32).toString('base64url');
const dpapi = (operation, input) => new Promise((resolve, reject) => {
  const protect = operation === 'protect';
  const script = protect
    ? 'Add-Type -AssemblyName System.Security;$v=[Console]::In.ReadToEnd();$b=[Text.Encoding]::UTF8.GetBytes($v);$p=[System.Security.Cryptography.ProtectedData]::Protect($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($p))'
    : 'Add-Type -AssemblyName System.Security;$v=[Console]::In.ReadToEnd();$b=[Convert]::FromBase64String($v);$p=[System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Text.Encoding]::UTF8.GetString($p))';
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let output = '', error = '';
  child.stdout.setEncoding('utf8').on('data', value => { output += value; });
  child.stderr.setEncoding('utf8').on('data', value => { error += value; });
  child.once('error', reject); child.once('exit', code => code === 0 ? resolve(output) : reject(new Error(`Không thể ${protect ? 'mã hóa' : 'giải mã'} dữ liệu tài khoản bằng Windows DPAPI. ${error}`)));
  child.stdin.end(input);
});
let discovery, jwks;
async function getDiscovery() {
  if (!discovery) {
    const response = await fetch(`${AUTH}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Không tải được cấu hình đăng nhập OpenAI.');
    const value = await response.json();
    if (value.issuer !== AUTH) throw new Error('OIDC issuer không đúng.');
    for (const key of ['authorization_endpoint', 'token_endpoint', 'jwks_uri']) {
      if (new URL(value[key]).origin !== AUTH) throw new Error('OIDC endpoint không đúng.');
    }
    discovery = value;
  }
  return discovery;
}

async function tokenRequest(params) {
  const config = await getDiscovery();
  const response = await fetch(config.token_endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params), signal: AbortSignal.timeout(20000)
  });
  const value = await response.json();
  if (!response.ok) throw new Error(`Đăng nhập/refresh thất bại (${value.error || response.status}). Hãy đăng nhập lại.`);
  if (!value.access_token) throw new Error('Token response thiếu access_token.');
  return value;
}

export async function createAuth(port) {
  await mkdir(DATA, { recursive: true, mode: 0o700 });
  // mode 0700/0600 không thiết lập ACL trên Windows; giới hạn thư mục cho user hiện tại.
  if (process.platform === 'win32') {
    execFileSync('icacls', [fileURLToPath(DATA), '/inheritance:r', '/grant:r', `${userInfo().username}:(OI)(CI)F`], { stdio: 'ignore' });
  }
  let state, migrated = false;
  try { state = JSON.parse(await readFile(LEGACY_AUTH_FILE, 'utf8')); migrated = true; }
  catch (legacyError) {
    if (legacyError.code !== 'ENOENT') throw legacyError;
    try { state = JSON.parse(await dpapi('unprotect', await readFile(AUTH_FILE, 'utf8'))); }
    catch (encryptedError) {
      if (encryptedError.code !== 'ENOENT') throw encryptedError;
      state = { hostId: `urn:uuid:${randomUUID()}`, activeId: null, profiles: [] };
    }
  }
  let saveQueue = Promise.resolve();
  const save = () => {
    const json = JSON.stringify(state);
    const write = async () => {
      const temporary = new URL('accounts.tmp', DATA);
      await writeFile(temporary, await dpapi('protect', json), { mode: 0o600 });
      await rename(temporary, AUTH_FILE);
    };
    saveQueue = saveQueue.then(write, write);
    return saveQueue;
  };
  await save();
  if (migrated) await rm(LEGACY_AUTH_FILE, { force: true });
  const attempts = new Map(), refreshes = new Map();
  const active = () => state.profiles.find(p => p.id === state.activeId);
  const summary = () => ({
    activeId: state.activeId,
    profiles: state.profiles.map(p => ({
      id: p.id, label: p.email || 'Đăng nhập chưa hoàn tất',
      registration: p.clientId.slice(-8), connected: Boolean(p.credentials?.access_token),
      planEnabled: Boolean(p.credentials?.scope?.split(' ').includes('chatgpt.tokens.use.direct'))
    }))
  });

  return {
    summary,
    storagePath: fileURLToPath(DATA),
    async start(profileId) {
      const config = await getDiscovery();
      const selected = profileId ? state.profiles.find(p => p.id === profileId) : null;
      if (profileId && !selected) throw new Error('Tài khoản không tồn tại.');
      for (const [key, value] of attempts) if (Date.now() > value.expiresAt) attempts.delete(key);
      if (attempts.size >= 5) throw new Error('Có quá nhiều phiên đăng nhập. Hoàn tất phiên đang mở hoặc chờ 10 phút.');
      const attempt = {
        state: random(), nonce: random(), verifier: random(), selectedId: selected?.id,
        clientId: selected?.clientId, redirectUri: `http://127.0.0.1:${port}/auth/callback`,
        expiresAt: Date.now() + 10 * 60 * 1000
      };
      attempts.set(attempt.state, attempt);
      const url = new URL(config.authorization_endpoint);
      const params = {
        client_id: selected?.clientId || 'dynamic_agent_client', ext_agent_host_id: state.hostId,
        response_type: 'code', redirect_uri: attempt.redirectUri,
        scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
        resource: RESOURCE, state: attempt.state, nonce: attempt.nonce,
        code_challenge_method: 'S256', code_challenge: createHash('sha256').update(attempt.verifier).digest('base64url')
      };
      if (!selected) params.agent_name_hint = 'X Reply Assistant';
      if (selected?.credentials?.id_token) params.id_token_hint = selected.credentials.id_token;
      if (selected?.email) params.login_hint = selected.email;
      url.search = new URLSearchParams(params).toString();
      return { url: url.toString() };
    },
    async callback(url) {
      const returnedState = url.searchParams.get('state');
      const attempt = attempts.get(returnedState);
      if (!attempt || Date.now() > attempt.expiresAt) throw new Error('Phiên đăng nhập hết hạn hoặc state không hợp lệ.');
      attempts.delete(returnedState); // One-time consumption.
      if (url.searchParams.has('error')) throw new Error('Đăng nhập bị hủy hoặc quyền dùng gói ChatGPT chưa được cấp.');
      const code = url.searchParams.get('code');
      const issued = url.searchParams.get('client_id') || attempt.clientId;
      if (!code || !issued || issued === 'dynamic_agent_client') throw new Error('Callback thiếu code hoặc client_id đã đăng ký.');
      if (attempt.clientId && issued !== attempt.clientId) throw new Error('client_id không khớp tài khoản đã chọn.');
      let profile = state.profiles.find(p => p.id === attempt.selectedId);
      if (!profile) {
        profile = { id: randomUUID(), clientId: issued, subject: null, email: null, credentials: null };
        state.profiles.push(profile);
      }
      // Giữ issued client ID kể cả khi code exchange thất bại để có thể thử lại.
      await save();
      const tokens = await tokenRequest({
        grant_type: 'authorization_code', client_id: issued, code,
        code_verifier: attempt.verifier, redirect_uri: attempt.redirectUri, resource: RESOURCE
      });
      const config = await getDiscovery();
      const { createRemoteJWKSet, jwtVerify } = await import('jose');
      jwks ||= createRemoteJWKSet(new URL(config.jwks_uri));
      const { payload } = await jwtVerify(tokens.id_token, jwks, {
        issuer: config.issuer, audience: issued, algorithms: ['RS256', 'ES256', 'PS256']
      });
      if (!payload.exp || !payload.sub || payload.nonce !== attempt.nonce) throw new Error('ID token thiếu exp/sub hoặc nonce không khớp.');
      if (profile.subject && profile.subject !== payload.sub) throw new Error('Bạn đã đăng nhập khác tài khoản đã chọn. Dùng nút Thêm tài khoản.');
      profile.subject = payload.sub;
      profile.email = typeof payload.email === 'string' ? payload.email : 'Tài khoản ChatGPT';
      profile.credentials = tokens;
      profile.expiresAt = Date.now() + Number(tokens.expires_in || 3600) * 1000;
      state.activeId = profile.id;
      await save();
      return tokens.scope?.split(' ').includes('chatgpt.tokens.use.direct');
    },
    async select(id) {
      if (!state.profiles.some(p => p.id === id)) throw new Error('Không tìm thấy tài khoản.');
      state.activeId = id; await save(); return summary();
    },
    async credential() {
      const profile = active();
      if (!profile?.credentials?.access_token) throw new Error('Hãy Continue with ChatGPT trước.');
      if (profile.expiresAt <= Date.now() + 60000) {
        if (!refreshes.has(profile.id)) {
          refreshes.set(profile.id, (async () => {
            const previous = profile.credentials;
            if (!previous.refresh_token) throw new Error('Phiên đăng nhập hết hạn. Hãy đăng nhập lại.');
            const tokens = await tokenRequest({
              grant_type: 'refresh_token', client_id: profile.clientId,
              refresh_token: previous.refresh_token, resource: RESOURCE
            });
            profile.credentials = { ...previous, ...tokens };
            profile.expiresAt = Date.now() + Number(tokens.expires_in || 3600) * 1000;
            await save();
          })().finally(() => refreshes.delete(profile.id)));
        }
        await refreshes.get(profile.id);
      }
      if (!profile.credentials.scope?.split(' ').includes('chatgpt.tokens.use.direct')) {
        throw new Error('Tài khoản chưa cấp quyền dùng gói ChatGPT. Đăng nhập lại và cấp quyền, hoặc dùng API.');
      }
      return { token: profile.credentials.access_token, profileId: profile.id };
    },
    async disconnect() {
      const profile = active();
      if (!profile) return { revoked: true };
      if (refreshes.has(profile.id)) await refreshes.get(profile.id).catch(() => {});
      let revoked = !profile.credentials?.refresh_token;
      try {
        if (profile.credentials?.refresh_token) {
          const config = await getDiscovery();
          if (!config.revocation_endpoint || new URL(config.revocation_endpoint).origin !== AUTH) throw new Error('Không có revocation endpoint.');
          const response = await fetch(config.revocation_endpoint, {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token: profile.credentials.refresh_token, token_type_hint: 'refresh_token', client_id: profile.clientId }),
            signal: AbortSignal.timeout(15000)
          });
          revoked = response.status === 200;
        }
      } catch { revoked = false; }
      state.profiles = state.profiles.filter(item => item.id !== profile.id);
      state.activeId = state.profiles[0]?.id || null;
      await save();
      return { revoked };
    }
  };
}
