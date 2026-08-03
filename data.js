(function () {
  'use strict';

  const VERSION = 5;
  const packs = [
    { id: 'speed', name: '速度', short: '速', cross: 'technique', motif: 'slash', image: '背包照片/速度背包.png' },
    { id: 'power', name: '力量', short: '力', cross: 'speed', motif: 'burst', image: '背包照片/力量背包.png' },
    { id: 'technique', name: '技巧', short: '技', cross: 'power', motif: 'orbit', image: '背包照片/技巧背包.png' }
  ];
  const qualityNames = { white: '白', green: '绿', purple: '紫', gold: '金', rainbow: '彩' };
  const qualityBorders = {
    white: '零件外观图片/白色品质边框.png',
    green: '零件外观图片/绿色品质边框.png',
    purple: '零件外观图片/紫色品质边框.png',
    gold: '零件外观图片/金色品质边框.png',
    rainbow: '零件外观图片/彩色品质边框.png'
  };
  const namedSkills = {
    speed: ['跃升炸弹', '冲锋踢馆鞋', '冲刺炸弹', '喷射回旋镖', '忍者黏索'],
    power: ['填涂卫星', '陨石手套', '锋回斩击斧', '旋转之轮', '涡卷破坏枪'],
    technique: ['技巧配件1', '技巧配件2', '技巧配件3', '技巧配件4', '技巧配件5']
  };
  const skills = [];
  packs.forEach((pack) => {
    for (let index = 1; index <= 5; index += 1) {
      const skillId = `${pack.id}-${index}`;
      skills.push({ id: skillId, packId: pack.id, name: namedSkills[pack.id][index - 1], glyph: `${pack.short}${index}`, image: '', deletedAt: null });
    }
  });
  const categories = [];
  const plugins = [];
  // Seed test plugins: ~2-3 per skill with varying quality and cost
  const qualities = ['white', 'green', 'purple', 'gold', 'rainbow'];
  const qualityKeys = Object.keys(qualityBorders);
  skills.forEach((skill) => {
    const count = 2 + (skills.indexOf(skill) % 3);
    for (let i = 1; i <= count; i += 1) {
      const qk = qualityKeys[(skills.indexOf(skill) + i) % 5];
      plugins.push({
        id: `seed-plugin-${skill.id}-${i}`,
        skillId: skill.id,
        name: `${skill.name}·强化${i}`,
        slotCost: i * 2 + (skills.indexOf(skill) % 3),
        quality: qualityBorders[qk],
        effectText: `提升${skill.name}的${['攻击力','范围','速度','冷却','效果'][i-1]}`,
        bonusText: `+${(i*15+10)}%`,
        image: '',
        deletedAt: null
      });
    }
  });

  const treasures = [];
  for (let index = 1; index <= 9; index += 1) treasures.push({ id: `common-treasure-${index}`, scope: 'common', packId: null, name: `普通秘宝${index}`, description: `普通秘宝效果说明 ${index}`, glyph: `秘${index}`, image: '', deletedAt: null });
  packs.forEach((pack) => { for (let index = 1; index <= 5; index += 1) treasures.push({ id: `${pack.id}-treasure-${index}`, scope: 'pack', packId: pack.id, name: `${pack.name}秘宝${index}`, description: `${pack.name}背包专属秘宝效果说明 ${index}`, glyph: `${pack.short}秘`, image: '', deletedAt: null }); });
  const weaponTypes = [
    { id: 'weapon-type-1', name: '射击枪', short: '射', weaponCount: 9, image: '', deletedAt: null },
    { id: 'weapon-type-2', name: '滚筒', short: '滚', weaponCount: 6, image: '', deletedAt: null },
    { id: 'weapon-type-3', name: '蓄力狙击枪', short: '狙', weaponCount: 6, image: '', deletedAt: null },
    { id: 'weapon-type-4', name: '泼桶', short: '泼', weaponCount: 6, image: '', deletedAt: null },
    { id: 'weapon-type-5', name: '旋转枪', short: '旋', weaponCount: 6, image: '', deletedAt: null },
    { id: 'weapon-type-6', name: '机动枪', short: '机', weaponCount: 6, image: '', deletedAt: null },
    { id: 'weapon-type-7', name: '防空伞', short: '伞', weaponCount: 6, image: '', deletedAt: null },
    { id: 'weapon-type-8', name: '爆破枪', short: '爆', weaponCount: 6, image: '', deletedAt: null },
    { id: 'weapon-type-9', name: '画笔', short: '笔', weaponCount: 3, image: '', deletedAt: null },
    { id: 'weapon-type-10', name: '猎鱼弓', short: '弓', weaponCount: 3, image: '', deletedAt: null },
    { id: 'weapon-type-11', name: '刮水刀', short: '刮', weaponCount: 3, image: '', deletedAt: null }
  ];
  const weapons = [];
  weaponTypes.forEach((wt) => {
    weapons.push({
      id: `seed-weapon-${wt.id}`,
      typeId: wt.id,
      name: `${wt.name}·试做型`,
      description: `${wt.name}类型的测试武器，可替换为正式版本。`,
      image: '',
      deletedAt: null
    });
  });
  const weaponEffects = Array.from({ length: 15 }, (_, index) => ({ id: `weapon-effect-${index + 1}`, name: `武器效果${index + 1}`, description: `武器效果说明 ${index + 1}`, glyph: `E${index + 1}`, image: '', deletedAt: null }));
  const defaultBuild = { version: VERSION, mainPackId: null, packStates: {}, skillIds: [null, null, null], pluginsBySkillId: {}, treasureIds: [], weaponId: null, weaponEffectIds: [] };
  // Imported plugin screenshots are kept in a separate generated file so the
  // hand-maintained seed remains readable. The script is loaded before this
  // module and contributes the same records to a fresh catalog.
  if (Array.isArray(window.RAIDER_IMPORTED_PLUGINS)) plugins.push(...window.RAIDER_IMPORTED_PLUGINS.map((plugin) => ({ ...plugin })));
  window.RAIDER_SEED = { version: VERSION, packs, qualityNames, qualityBorders, skills, categories, plugins, treasures, weaponTypes, weapons, weaponEffects, defaultBuild };
})();
