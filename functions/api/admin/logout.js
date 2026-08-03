/**
 * POST /api/admin/logout — 管理员登出，清除 cookie
 */

import { json, clearCookieHeader } from '../../_auth.js';

export async function onRequestPost() {
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookieHeader() });
}
