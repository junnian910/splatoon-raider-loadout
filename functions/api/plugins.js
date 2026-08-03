/**
 * 零件接口
 * GET  /api/plugins        — 返回所有正式库零件（status=approved 且未软删），所有人可访问
 * POST /api/plugins/submit — 访客提交新零件（写入 status=pending），所有人可访问
 *
 * 路由说明：Cloudflare Pages Functions 把本文件挂在 /api/plugins。
 * POST /api/plugins/submit 由 submit.js 单独处理（functions/api/plugins/submit.js）。
 */

import { json } from '../_auth.js';

// quality 枚举 key → 前端要的图片路径（与 data.js qualityBorders 一致）
const QUALITY_BORDERS = {
  white: '零件外观图片/白色品质边框.png',
  green: '零件外观图片/绿色品质边框.png',
  purple: '零件外观图片/紫色品质边框.png',
  gold: '零件外观图片/金色品质边框.png',
  rainbow: '零件外观图片/彩色品质边框.png',
};
const VALID_QUALITIES = Object.keys(QUALITY_BORDERS);

// 合法的 skillId（与 data.js 一致：3 背包 × 5 配件）
const VALID_SKILL_IDS = new Set([
  'speed-1', 'speed-2', 'speed-3', 'speed-4', 'speed-5',
  'power-1', 'power-2', 'power-3', 'power-4', 'power-5',
  'technique-1', 'technique-2', 'technique-3', 'technique-4', 'technique-5',
]);

/** 把 DB 行转成前端要的 plugin 对象（quality key → 图片路径） */
function rowToPlugin(row) {
  return {
    id: row.id,
    skillId: row.skill_id,
    name: row.name,
    slotCost: row.slot_cost,
    quality: QUALITY_BORDERS[row.quality] || QUALITY_BORDERS.white,
    qualityKey: row.quality,
    effectText: row.effect_text || '',
    bonusText: row.bonus_text || '',
    image: row.image || '',
    deletedAt: row.deleted_at || null,
  };
}

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const { results } = await env.DB.prepare(
      'SELECT id, skill_id, name, slot_cost, quality, effect_text, bonus_text, image, deleted_at FROM plugins WHERE status = ? AND deleted_at IS NULL ORDER BY skill_id, slot_cost'
    ).bind('approved');
    return json({ plugins: (results || []).map(rowToPlugin) });
  } catch (err) {
    return json({ error: '数据库查询失败', detail: String(err) }, 500);
  }
}

// 提交校验：供 submit.js 复用
export function validatePlugin(input) {
  const errors = [];
  const skillId = String(input.skillId || '').trim();
  if (!VALID_SKILL_IDS.has(skillId)) errors.push('配件不合法');

  const name = String(input.name || '').trim();
  if (!name) errors.push('名称不能为空');
  else if (name.length > 40) errors.push('名称过长（≤40字）');

  const slotCost = Number(input.slotCost);
  if (!Number.isInteger(slotCost) || slotCost < 0 || slotCost > 40) errors.push('成本必须是非负整数');

  const quality = String(input.quality || '').trim();
  if (!VALID_QUALITIES.includes(quality)) errors.push('品质不合法');

  const effectText = String(input.effectText || '').trim();
  if (effectText.length > 120) errors.push('效果说明过长（≤120字）');

  // bonusText 标准化（与前端 normalizeBonus 一致）
  let bonusText = String(input.bonusText || '').trim();
  if (/^\+?\d+(?:\.\d+)?%?$/.test(bonusText)) {
    bonusText = `+${bonusText.replace(/^\+/, '').replace(/%$/, '')}%`;
  }
  if (bonusText.length > 30) errors.push('加成文本过长（≤30字）');

  // image：base64 dataURL 或空串，限制 5MB
  let image = String(input.image || '');
  if (image) {
    if (!image.startsWith('data:image/')) errors.push('图片格式不合法');
    else if (image.length > 5 * 1024 * 1024) errors.push('图片过大（≤5MB）');
  }

  return {
    errors,
    value: errors.length ? null : { skillId, name, slotCost, quality, effectText, bonusText, image },
  };
}

export { VALID_SKILL_IDS, VALID_QUALITIES, QUALITY_BORDERS, rowToPlugin };
