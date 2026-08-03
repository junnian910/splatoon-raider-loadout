/**
 * GET /api/admin/pending — 返回所有待审核零件（status=pending）
 * 仅管理员可访问。
 */

import { json, requireAdmin } from '../../_auth.js';
import { QUALITY_BORDERS } from '../plugins.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!(await requireAdmin(request, env))) return json({ error: '未登录或登录已过期' }, 401);

  try {
    const { results } = await env.DB.prepare(
      `SELECT id, skill_id, name, slot_cost, quality, effect_text, bonus_text, image, status, submitted_by, created_at
       FROM plugins WHERE status = 'pending' ORDER BY created_at ASC`
    ).all();
    const plugins = (results || []).map((row) => ({
      id: row.id,
      skillId: row.skill_id,
      name: row.name,
      slotCost: row.slot_cost,
      quality: QUALITY_BORDERS[row.quality] || QUALITY_BORDERS.white,
      qualityKey: row.quality,
      effectText: row.effect_text || '',
      bonusText: row.bonus_text || '',
      image: row.image || '',
      submittedBy: row.submitted_by || '匿名',
      createdAt: row.created_at,
    }));
    return json({ plugins });
  } catch (err) {
    return json({ error: '数据库查询失败', detail: String(err) }, 500);
  }
}
