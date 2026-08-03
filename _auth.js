/**
 * 共享鉴权工具：管理员 token 的签发与校验。
 * 用 Web Crypto API 的 HMAC-SHA256 签名，不引入外部依赖。
 *
 * Token 格式: base64url(payload).base64url(signature)
 * payload: { exp: 过期时间戳(秒) }
 * 密钥来自环境变量 TOKEN_SECRET。
 */

const TEXT = new TextEncoder();
const DEC = new TextDecoder();

function b64urlEncode(bytes) {
  let s = '';
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  const pad = '='.repeat((4 - (str.length % 4)) % 4);
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function getKey(secret) {
  return crypto.subtle.importKey('raw', TEXT.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** 签发 token，有效期 7 天 */
export async function signToken(env) {
  const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  const payload = b64urlEncode(TEXT.encode(JSON.stringify({ exp })));
  const key = await getKey(env.TOKEN_SECRET);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, TEXT.encode(payload)));
  return `${payload}.${b64urlEncode(sig)}`;
}

/** 校验 token，返回 true/false */
export async function verifyToken(env, token) {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  let parsed;
  try {
    parsed = JSON.parse(DEC.decode(b64urlDecode(payload)));
  } catch {
    return false;
  }
  if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) return false;
  const key = await getKey(env.TOKEN_SECRET);
  let valid = false;
  try {
    valid = await crypto.subtle.verify('HMAC', key, b64urlDecode(sig), TEXT.encode(payload));
  } catch {
    valid = false;
  }
  return valid;
}

/** 从请求的 cookie 中提取 token */
export function getTokenFromRequest(request) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(/(?:^|;\s*)admin_token=([^;]+)/);
  return match ? match[1] : null;
}

/** 设置登录 cookie 的响应头（HttpOnly, SameSite, 7天） */
export function setCookieHeader(token) {
  return `admin_token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 60 * 60}`;
}

/** 清除 cookie 的响应头 */
export function clearCookieHeader() {
  return 'admin_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
}

/** 统一 JSON 响应 */
export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

/** 校验：请求是否来自已登录管理员，否则返回 401 */
export async function requireAdmin(request, env) {
  const token = getTokenFromRequest(request);
  const ok = await verifyToken(env, token);
  return ok;
}
