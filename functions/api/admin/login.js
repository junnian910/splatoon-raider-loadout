/**
 * POST /api/admin/login — 管理员登录
 * 请求体: { password: string }
 * 校验通过后下发签名 token（HttpOnly cookie），有效期 7 天。
 */

import { json, signToken, setCookieHeader, clearCookieHeader } from '../../_auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  // 如果没设 ADMIN_PASSWORD，拒绝（避免未配置就开放）
  if (!env.ADMIN_PASSWORD) {
    return json({ error: '服务器未配置管理员密码' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体不是合法 JSON' }, 400);
  }

  const password = String(body?.password || '');
  if (!password) return json({ error: '请输入密码' }, 400);

  // 用恒定时间比较防时序攻击
  const a = new TextEncoder().encode(password);
  const b = new TextEncoder().encode(env.ADMIN_PASSWORD);
  if (a.length !== b.length) return json({ error: '密码错误' }, 401);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  if (diff !== 0) return json({ error: '密码错误' }, 401);

  const token = await signToken(env);
  return json({ ok: true, message: '登录成功' }, 200, { 'Set-Cookie': setCookieHeader(token) });
}
