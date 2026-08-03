/**
 * 一次性脚本：把现有零件数据（plugin-data.js + data.js seed）导入 D1 数据库。
 *
 * 用法（在项目根目录）：
 *   node tools-seed-db.js > seed-data.sql      # 生成 SQL 文件
 *   npx wrangler d1 execute splatoon-raider-db --remote --file=seed-data.sql   # 执行导入
 *
 * 原理：plugin-data.js / data.js 用 window.RAIDER_IMPORTED_PLUGINS / window.RAIDER_SEED 暴露数据，
 * 这里伪造一个 window 对象加载它们，拿到所有 plugin，转成 INSERT 语句。
 * 所有零件导入为 status='approved'（作为初始正式共享库）。
 */
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

// 伪造浏览器 window，让 data.js / plugin-data.js 能正常运行
const fakeWindow = {};
global.window = fakeWindow;

// 加载顺序必须和 library.html 一致：plugin-data.js → data.js
require(path.join(__dirname, 'plugin-data.js'));
require(path.join(__dirname, 'data.js'));

const seed = fakeWindow.RAIDER_SEED;
if (!seed || !Array.isArray(seed.plugins)) {
  console.error('错误：未能从 data.js 加载到 RAIDER_SEED.plugins');
  process.exit(1);
}

// quality 文件路径 → 枚举 key 的反查表
// data.js 里 qualityBorders = { white: '零件外观图片/白色品质边框.png', ... }
const pathToQualityKey = {};
Object.entries(seed.qualityBorders).forEach(([key, filePath]) => {
  pathToQualityKey[filePath] = key;
});

// 当前时间戳（导入时统一）
const now = new Date().toISOString();

function sqlEscape(value) {
  // SQLite 字符串转义：单引号翻倍
  return String(value == null ? '' : value).replace(/'/g, "''");
}

const plugins = seed.plugins.filter((p) => p && p.id && !p.deletedAt);
console.error(`[info] 共 ${seed.plugins.length} 条零件，其中 ${plugins.length} 条未软删，将导入为 approved`);

// 生成 INSERT 语句（每条一行，用 INSERT OR IGNORE 防止重复导入时冲突）
const lines = [];
lines.push('-- Splatoon Raider 初始零件数据导入');
lines.push(`-- 生成时间: ${now}`);
lines.push(`-- 共 ${plugins.length} 条零件，全部 status='approved'`);
lines.push('-- 注意：D1 执行文件时不允许 BEGIN/COMMIT，用 INSERT OR IGNORE 防重复');
lines.push('');

plugins.forEach((p) => {
  const qualityKey = pathToQualityKey[p.quality] || 'white'; // 找不到回退白
  const id = sqlEscape(p.id);
  const skillId = sqlEscape(p.skillId);
  const name = sqlEscape(p.name);
  const slotCost = Number.isFinite(p.slotCost) ? p.slotCost : 0;
  const quality = sqlEscape(qualityKey);
  const effectText = sqlEscape(p.effectText || '');
  const bonusText = sqlEscape(p.bonusText || '');
  const image = sqlEscape(p.image || ''); // 现有数据 image 全是空串
  lines.push(
    `INSERT OR IGNORE INTO plugins (id, skill_id, name, slot_cost, quality, effect_text, bonus_text, image, status, submitted_by, created_at, reviewed_at, deleted_at) VALUES ('${id}', '${skillId}', '${name}', ${slotCost}, '${quality}', '${effectText}', '${bonusText}', '${image}', 'approved', 'seed-import', '${now}', '${now}', NULL);`
  );
});

lines.push('');

// 输出到 stdout，便于重定向到文件
process.stdout.write(lines.join('\n') + '\n');
console.error(`[info] SQL 生成完成，共 ${plugins.length} 条 INSERT`);
