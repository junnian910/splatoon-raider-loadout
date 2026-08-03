'use strict';

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const memory = new Map();
const context = {
  window: {},
  document: {
    addEventListener: () => {},
    querySelector: () => null
  },
  localStorage: {
    getItem: (key) => memory.get(key) || null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key)
  },
  TextEncoder,
  TextDecoder,
  Uint8Array,
  Date,
  JSON,
  btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
  atob: (value) => Buffer.from(value, 'base64').toString('binary')
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('data.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('core.js', 'utf8'), context);

const { seed, rules, clone } = context.window.Raider;
const catalog = {
  skills: clone(seed.skills),
  categories: clone(seed.categories),
  plugins: clone(seed.plugins),
  treasures: clone(seed.treasures),
  weaponTypes: clone(seed.weaponTypes),
  weapons: clone(seed.weapons),
  weaponEffects: clone(seed.weaponEffects)
};

// Create test plugins for 'power-1' skill
function makePlugin(id, slotCost) {
  return {
    id,
    skillId: 'power-1',
    name: `测试零件 ${id}`,
    slotCost,
    quality: seed.qualityBorders.gold,
    effectText: '测试效果',
    bonusText: `+${slotCost}`,
    image: '',
    deletedAt: null
  };
}

// Add 10 test plugins with cost 1 each
for (let i = 1; i <= 10; i += 1) {
  catalog.plugins.push(makePlugin(`test-plugin-${i}`, 1));
}
// Add 6 high-cost plugins with cost 8 each
for (let i = 1; i <= 6; i += 1) {
  catalog.plugins.push(makePlugin(`test-cost8-${i}`, 8));
}

function build() {
  const value = clone(seed.defaultBuild);
  value.mainPackId = 'power';
  value.skillIds = ['power-1', 'power-2', 'speed-1'];
  return value;
}

// Skill validation tests
assert.equal(rules.validateSkills(build(), catalog).valid, true, '合法技能组合应通过');

const storedBuild = build();
storedBuild.packStates = {
  power: { mainPackId: 'power', skillIds: ['power-1', 'power-2', 'speed-1'], pluginsBySkillId: {}, treasureIds: [], weaponId: null, weaponEffectIds: [] },
  speed: { mainPackId: 'speed', skillIds: ['speed-1', 'speed-2', 'technique-1'], pluginsBySkillId: {}, treasureIds: [], weaponId: null, weaponEffectIds: [] }
};
context.window.Raider.storage.saveBuild(storedBuild);
const restoredBuild = context.window.Raider.storage.loadBuild();
assert.deepEqual(restoredBuild.packStates.power.skillIds, ['power-1', 'power-2', 'speed-1'], 'power pack keeps its own skills');
assert.deepEqual(restoredBuild.packStates.speed.skillIds, ['speed-1', 'speed-2', 'technique-1'], 'speed pack keeps its own skills');

const duplicateSkills = build(); duplicateSkills.skillIds = ['power-1', 'power-1', 'speed-1'];
assert.equal(rules.validateSkills(duplicateSkills, catalog).valid, false, '技能不可重复');
const invalidPack = build(); invalidPack.skillIds = ['power-1', 'power-2', 'technique-1'];
assert.equal(rules.validateSkills(invalidPack, catalog).valid, false, '不可携带错误跨包技能');

// Plugin install tests: 9-slot limit
const pluginBuild = build();
const cheapPlugins = catalog.plugins.filter((item) => item.skillId === 'power-1' && item.slotCost === 1);
pluginBuild.pluginsBySkillId['power-1'] = cheapPlugins.slice(0, 9).map((item) => item.id);
assert.match(rules.canInstallPlugin(pluginBuild, catalog, 'power-1', cheapPlugins[9].id).reason, /9 个/, '第十个插件应拒绝');

// Plugin cost limit: 40 max
const costBuild = build();
const costEight = catalog.plugins.filter((item) => item.skillId === 'power-1' && item.slotCost === 8);
costBuild.pluginsBySkillId['power-1'] = costEight.slice(0, 5).map((item) => item.id);
assert.equal(rules.pluginTotal(costBuild, catalog, 'power-1'), 40, '五个 8 点插件应为 40');
assert.match(rules.canInstallPlugin(costBuild, catalog, 'power-1', costEight[5].id).reason, /48\/40/, '48 点必须拒绝');

// Remove already-installed plugin
assert.equal(rules.canInstallPlugin(costBuild, catalog, 'power-1', costEight[0].id).remove, true, '再次点击已装零件应取消');

// Treasure tests
const treasureBuild = build();
treasureBuild.treasureIds = ['power-treasure-1', 'power-treasure-2', 'speed-treasure-1'];
assert.equal(rules.canInstallTreasure(treasureBuild, catalog, 'speed-treasure-2').allowed, false, '跨包秘宝最多一个');
assert.equal(rules.canInstallTreasure(treasureBuild, catalog, 'power-treasure-3').allowed, true, '同背包秘宝可自由安装');
treasureBuild.treasureIds = ['common-treasure-1', 'common-treasure-2', 'common-treasure-3', 'common-treasure-4', 'common-treasure-5'];
assert.equal(rules.canInstallTreasure(treasureBuild, catalog, 'common-treasure-6').allowed, false, '秘宝最多五个');
assert.equal(rules.canInstallTreasure(treasureBuild, catalog, 'common-treasure-1').remove, true, '再次点击已装秘宝应取消');

// Weapon tests
const weaponBuild = build();
weaponBuild.weaponId = 'weapon-1';
weaponBuild.weaponEffectIds = ['weapon-effect-1', 'weapon-effect-1'];
assert.equal(rules.validateBuild(weaponBuild, catalog).valid, false, '武器效果不可重复');

// share / import round-trip
const snapshot = context.window.Raider.share.makeSnapshot(costBuild, catalog);
const code = context.window.Raider.share.encodeShare(snapshot);
const decoded = context.window.Raider.share.decodeShare(code);
assert.equal(decoded.build.mainPackId, 'power', '分享码应保留主背包');
const imported = context.window.Raider.share.importSnapshot(decoded);
assert.equal(imported.build.mainPackId, 'power', '导入后主背包应一致');

console.log('rules.test.js: all assertions passed');
