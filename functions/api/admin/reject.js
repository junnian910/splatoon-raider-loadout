/**
 * POST /api/admin/reject — 拒绝一条待审核零件
 * 请求体: { id: string }
 * 仅管理员可访问。把 status 从 pending 改为 rejected（保留记录，不公开）。
 */

import { json, requireAdmin } from '../../_auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!(await requireAdmin(request, env))) return json({ error: '未登录或登录已过期' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体不是合法 JSON' }, 400);
  }
  const id = String(body?.id || '').trim();
  if (!id) return json({ error: '缺少零件 id' }, 400);

  try {
    const now = new Date().toISOString();
    const result = await env.DB.prepare(
      `UPDATE plugins SET status = 'rejected', reviewed_at = ? WHERE id = ? AND status = 'pending'`
    ).bind(now, id);
    if (result.meta.changes === 0) return json({ error: '未找到该待审核零件（可能已被处理）' }, 404);
    return json({ ok: true, message: '已拒绝' });
  } catch (err) {
    return json({ error: '数据库更新失败', detail: String(err) }, 500);
  }
}
