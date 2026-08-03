const fs = require('fs');
const path = require('path');

const root = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin-import-manifest.json'), 'utf8'));
const qualityBorders = {
  white: '零件外观图片/白色品质边框.png',
  green: '零件外观图片/绿色品质边框.png',
  purple: '零件外观图片/紫色品质边框.png',
  gold: '零件外观图片/金色品质边框.png',
  rainbow: '零件外观图片/彩色品质边框.png'
};
const oneCosts = [
  ['rainbow', 8], ['rainbow', 3], ['gold', 6], ['gold', 4], ['gold', 2],
  ['purple', 7], ['purple', 5], ['purple', 3], ['green', 8], ['green', 6],
  ['green', 4], ['green', 2], ['white', 7], ['white', 5], ['white', 3], ['white', 1]
];
const twoCosts = [['rainbow', 8], ['gold', 5], ['purple', 7], ['purple', 4], ['green', 6], ['green', 3], ['white', 5], ['white', 2]];
const oneBonuses = ['+100%', '+38%', '+60%', '+40%', '+20%', '+58%', '+42%', '+25%', '+53%', '+40%', '+27%', '+13%', '+35%', '+25%', '+15%', '+5%'];
const twoBonuses = ['+100%', '+50%', '+60%', '+33%', '+40%', '+20%', '+25%', '+10%'];

function correctedCost(quality, raw, qualityIndex = 0) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  if (quality === 'rainbow') return n - (qualityIndex === 0 ? 2 : 1);
  if (quality === 'gold' || quality === 'purple') return n - 1;
  return n;
}

function normalizeBonus(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return /^\+?\d+(?:\.\d+)?%?$/.test(text)
    ? `+${text.replace(/^\+/, '').replace(/%$/, '')}%`
    : text;
}

function cardsFor(item) {
  if (item.kind === 'one') return oneCosts.map(([quality, cost], index) => ({ quality, cost: correctedCost(quality, cost, index), bonusText: oneBonuses[index] }));
  if (item.kind === 'two') return twoCosts.map(([quality, cost], index) => ({ quality, cost: correctedCost(quality, cost, index), bonusText: twoBonuses[index] }));
  if (item.kind === 'five4') return [['rainbow', 4], ['gold', 4], ['purple', 4], ['green', 4], ['white', 4]].map(([quality, raw], index) => ({ quality, cost: correctedCost(quality, raw, index), bonusText: '' }));
  if (item.kind === 'cold4') return [['rainbow', 8], ['gold', 5], ['purple', 7], ['purple', 4]].map(([quality, raw], index) => ({ quality, cost: correctedCost(quality, raw, index), bonusText: '' }));
  return (item.cards || []).map(([quality, raw], index) => ({ quality, cost: correctedCost(quality, raw, index), bonusText: '' }));
}

const records = [];
const seen = new Set();
const legacySeedNames = new Set();
let rowIndex = 0;
for (const item of manifest) {
  rowIndex += 1;
  const image = '';
  for (const card of cardsFor(item)) {
    const dedupeKey = [item.skillId, item.name, card.quality, card.cost, card.bonusText].join('|');
    if (item.skillId === 'speed-2' && legacySeedNames.has(item.name) && card.bonusText) continue;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    records.push({
      id: `imported-plugin-${String(records.length + 1).padStart(4, '0')}`,
      skillId: item.skillId,
      name: item.name,
      slotCost: card.cost,
      quality: qualityBorders[card.quality],
      effectText: '',
      bonusText: normalizeBonus(card.bonusText),
      image,
      deletedAt: null,
      sourceScreenshot: item.source
    });
  }
}

const out = `/* Generated from plugin-import-manifest.json. */\nwindow.RAIDER_IMPORTED_PLUGINS = ${JSON.stringify(records, null, 2)};\n`;
fs.writeFileSync(path.join(root, 'plugin-data.js'), out, 'utf8');

const catalogPath = path.join(root, 'splatoon-raider-catalog-v5.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const importedIds = new Set(records.map((record) => record.id));
catalog.plugins = catalog.plugins.filter((plugin) => !importedIds.has(plugin.id));
catalog.plugins.push(...records);
fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
console.log(`generated ${records.length} imported plugin records; catalog now contains ${catalog.plugins.length} plugins`);
