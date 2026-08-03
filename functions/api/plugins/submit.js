/**
 * POST /api/plugins/submit — 访客提交新零件，写入 status=pending（待审核）
 * 所有人可访问。提交后不直接公开，需管理员审核通过。
 */

import { json } from '../../_auth.js';
import { validatePlugin } from '../plugins.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体不是合法 JSON' }, 400);
  }

  const { errors, value } = validatePlugin(body);
  if (errors.length) return json({ error: '提交内容不合法', detail: errors }, 400);

  // 生成唯一 ID 与时间戳
  const id = `plugin-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  // 提交者标识：用昵称（可选）或 IP 哈希前缀，仅用于后台展示，不公开
  const submittedBy = (body.submittedBy && String(body.submittedBy).trim().slice(0, 30)) || '匿名';

  try {
    await env.DB.prepare(
      `INSERT INTO plugins (id, skill_id, name, slot_cost, quality, effect_text, bonus_text, image, status, submitted_by, created_at, reviewed_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, NULL, NULL)`
    ).bind(id, value.skillId, value.name, value.slotCost, value.quality, value.effectText, value.bonusText, value.image, submittedBy, now);
    return json({ ok: true, id, message: '已提交，等待管理员审核' });
  } catch (err) {
    return json({ error: '写入数据库失败', detail: String(err) }, 500);
  }
}
