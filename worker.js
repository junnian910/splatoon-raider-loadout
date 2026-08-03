/**
 * Worker 入口：统一处理所有请求。
 * - /api/* 走后端接口逻辑（零件库 CRUD + 管理员审核）
 * - 其余路径交给静态资源（env.ASSETS）托管 HTML/CSS/JS/图片
 *
 * 说明：本项目用 Workers assets 模式部署（wrangler deploy），
 * 该模式不像 Pages 那样自动识别 functions/ 目录，故用本入口统一分发路由。
 */

import { signToken, verifyToken, getTokenFromRequest, setCookieHeader, clearCookieHeader, json } from './_auth.js';
import { validatePlugin, QUALITY_BORDERS, rowToPlugin, VALID_SKILL_IDS, VALID_QUALITIES } from './_plugins.js';

// ---------- 零件接口 ----------
async function handleGetPlugins(env) {
  try {
    const { results } = await env.DB.prepare(
      "SELECT id, skill_id, name, slot_cost, quality, effect_text, bonus_text, image, deleted_at FROM plugins WHERE status = 'approved' AND deleted_at IS NULL ORDER BY skill_id, slot_cost"
    ).all();
    return json({ plugins: (results || []).map(rowToPlugin) });
  } catch (err) {
    return json({ error: '数据库查询失败', detail: String(err) }, 500);
  }
}

async function handleSubmit(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: '请求体不是合法 JSON' }, 400); }
  const { errors, value } = validatePlugin(body);
  if (errors.length) return json({ error: '提交内容不合法', detail: errors }, 400);
  const id = `plugin-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const submittedBy = (body.submittedBy && String(body.submittedBy).trim().slice(0, 30)) || '匿名';
  try {
    await env.DB.prepare(
      `INSERT INTO plugins (id, skill_id, name, slot_cost, quality, effect_text, bonus_text, image, status, submitted_by, created_at, reviewed_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, NULL, NULL)`
    ).bind(id, value.skillId, value.name, value.slotCost, value.quality, value.effectText, value.bonusText, value.image, submittedBy, now).run();
    return json({ ok: true, id, message: '已提交，等待管理员审核' });
  } catch (err) {
    return json({ error: '写入数据库失败', detail: String(err) }, 500);
  }
}

// ---------- 管理员接口 ----------
async function handleLogin(request, env) {
  if (!env.ADMIN_PASSWORD) return json({ error: '服务器未配置管理员密码' }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: '请求体不是合法 JSON' }, 400); }
  const password = String(body?.password || '');
  if (!password) return json({ error: '请输入密码' }, 400);
  const a = new TextEncoder().encode(password);
  const b = new TextEncoder().encode(env.ADMIN_PASSWORD);
  if (a.length !== b.length) return json({ error: '密码错误' }, 401);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  if (diff !== 0) return json({ error: '密码错误' }, 401);
  const token = await signToken(env);
  return json({ ok: true, message: '登录成功' }, 200, { 'Set-Cookie': setCookieHeader(token) });
}

function handleLogout() {
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookieHeader() });
}

async function handlePending(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: '未登录或登录已过期' }, 401);
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, skill_id, name, slot_cost, quality, effect_text, bonus_text, image, status, submitted_by, created_at
       FROM plugins WHERE status = 'pending' ORDER BY created_at ASC`
    ).all();
    const plugins = (results || []).map((row) => ({
      id: row.id, skillId: row.skill_id, name: row.name, slotCost: row.slot_cost,
      quality: QUALITY_BORDERS[row.quality] || QUALITY_BORDERS.white, qualityKey: row.quality,
      effectText: row.effect_text || '', bonusText: row.bonus_text || '', image: row.image || '',
      submittedBy: row.submitted_by || '匿名', createdAt: row.created_at,
    }));
    return json({ plugins });
  } catch (err) {
    return json({ error: '数据库查询失败', detail: String(err) }, 500);
  }
}

async function handleApprove(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: '未登录或登录已过期' }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: '请求体不是合法 JSON' }, 400); }
  const id = String(body?.id || '').trim();
  if (!id) return json({ error: '缺少零件 id' }, 400);
  try {
    const now = new Date().toISOString();
    const result = await env.DB.prepare(
      `UPDATE plugins SET status = 'approved', reviewed_at = ? WHERE id = ? AND status = 'pending'`
    ).bind(now, id).run();
    if (result.meta.changes === 0) return json({ error: '未找到该待审核零件（可能已被处理）' }, 404);
    return json({ ok: true, message: '已通过' });
  } catch (err) {
    return json({ error: '数据库更新失败', detail: String(err) }, 500);
  }
}

async function handleReject(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: '未登录或登录已过期' }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: '请求体不是合法 JSON' }, 400); }
  const id = String(body?.id || '').trim();
  if (!id) return json({ error: '缺少零件 id' }, 400);
  try {
    const now = new Date().toISOString();
    const result = await env.DB.prepare(
      `UPDATE plugins SET status = 'rejected', reviewed_at = ? WHERE id = ? AND status = 'pending'`
    ).bind(now, id).run();
    if (result.meta.changes === 0) return json({ error: '未找到该待审核零件（可能已被处理）' }, 404);
    return json({ ok: true, message: '已拒绝' });
  } catch (err) {
    return json({ error: '数据库更新失败', detail: String(err) }, 500);
  }
}

async function requireAdmin(request, env) {
  const token = getTokenFromRequest(request);
  return verifyToken(env, token);
}

// ---------- 路由分发 ----------
async function handleApi(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  // GET /api/plugins
  if (path === '/api/plugins' && method === 'GET') return handleGetPlugins(env);
  // POST /api/plugins/submit
  if (path === '/api/plugins/submit' && method === 'POST') return handleSubmit(request, env);
  // POST /api/admin/login
  if (path === '/api/admin/login' && method === 'POST') return handleLogin(request, env);
  // POST /api/admin/logout
  if (path === '/api/admin/logout' && method === 'POST') return handleLogout();
  // GET /api/admin/pending
  if (path === '/api/admin/pending' && method === 'GET') return handlePending(request, env);
  // POST /api/admin/approve
  if (path === '/api/admin/approve' && method === 'POST') return handleApprove(request, env);
  // POST /api/admin/reject
  if (path === '/api/admin/reject' && method === 'POST') return handleReject(request, env);

  return json({ error: '接口不存在', path }, 404);
}

// ---------- 主入口 ----------
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // /api/* 走后端逻辑
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env, url);
    }

    // 其余路径交给静态资源托管
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response('Not Found', { status: 404 });
  },
};
