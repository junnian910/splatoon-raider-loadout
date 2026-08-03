(function () {
  'use strict';
  const { seed, storage, rules, el } = window.Raider;
  const visual = (item, className = '') => {
    const frame = el('span', { className: `asset-frame ${className}` });
    if (item?.image) frame.append(el('img', { src: item.image, alt: '' }));
    else frame.append(el('span', { className: 'asset-glyph', text: item?.glyph || '?' }));
    return frame;
  };
  function render() {
    const catalog = storage.loadCatalog(); const build = storage.loadBuild();
    const status = rules.validateBuild(build, catalog); document.querySelector('#showcaseStatus').textContent = status.valid ? '配置规则检查通过' : status.problems[0] || '配置尚未完成';
    const skillHost = document.querySelector('#showcaseSkills');
    skillHost.replaceChildren(...build.skillIds.map((skillId, index) => {
      const skill = rules.skillById(catalog, skillId);
      if (!skill) return el('article', { className: 'showcase-skill empty-showcase' }, [el('span', { text: `0${index + 1}` }), el('h2', { text: '未选择配件' })]);
      const pack = rules.packById(skill.packId); const plugins = (build.pluginsBySkillId[skill.id] || []).map((id) => rules.pluginById(catalog, id)).filter(Boolean); const total = rules.pluginTotal(build, catalog, skill.id);
      const list = el('div', { className: 'showcase-plugin-list' });
      if (!plugins.length) list.append(el('p', { className: 'empty-state', text: '未安装零件' }));
      plugins.forEach((plugin) => {
        list.append(el('div', { className: 'showcase-plugin' }, [
          el('span', { className: 'showcase-thumb' }, [
            el('img', { src: plugin.quality || seed.qualityBorders.gold, className: 'showcase-border', alt: '' }),
            plugin.image ? el('img', { src: plugin.image, className: 'showcase-part-img', alt: '' }) : null
          ]),
          el('span', {}, [el('strong', { text: plugin.name }), el('small', { text: plugin.effectText || '' })]),
          el('b', { text: String(plugin.slotCost) })
        ]));
      });
      const meter = el('div', { className: 'showcase-meter' }, [el('div', {}, [el('span', { text: '零件成本' }), el('strong', { text: `${total}/40` })]), el('span', { className: 'meter-track' }, el('i', { style: `width:${Math.min(100, total / 40 * 100)}%` }))]);
      return el('article', { className: 'showcase-skill' }, [el('header', {}, [el('span', { className: 'showcase-position', text: `0${index + 1}` }), visual(skill, 'asset-showcase-skill'), el('div', {}, [el('small', { text: pack.name }), el('h2', { text: skill.name }), el('p', { text: `${plugins.length}/9 已安装` })])]), list, meter]);
    }));
    const pack = rules.packById(build.mainPackId);
    document.querySelector('#packSummary').replaceChildren(el('span', { className: 'summary-label', text: 'MAIN BACKPACK' }), visual(pack ? { glyph: pack.short } : null, 'asset-summary'), el('div', {}, [el('h2', { text: pack ? `${pack.name}背包` : '未选择背包' }), el('p', { text: pack ? `可携带一个${rules.packById(pack.cross).name}系单位` : '返回编辑器选择主背包' })]));
    const treasures = build.treasureIds.map((id) => rules.treasureById(catalog, id)).filter(Boolean); const treasureHost = document.querySelector('#treasureSummary'); treasureHost.replaceChildren(el('span', { className: 'summary-label', text: `TREASURES ${treasures.length}/5` }), el('div', { className: 'summary-item-grid' }, treasures.length ? treasures.map((item) => el('div', {}, [visual(item, 'asset-summary-small'), el('span', {}, [el('strong', { text: item.name }), el('small', { text: item.description })])])) : el('p', { className: 'empty-state', text: '未安装秘宝' })));
    const weapon = catalog.weapons.find((item) => item.id === build.weaponId); const effects = build.weaponEffectIds.map((id) => catalog.weaponEffects.find((item) => item.id === id)).filter(Boolean); document.querySelector('#weaponSummary').replaceChildren(el('span', { className: 'summary-label', text: 'WEAPON' }), visual(weapon, 'asset-summary'), el('div', {}, [el('h2', { text: weapon?.name || '未选择武器' }), el('p', { text: weapon?.description || '武器可以留空' }), el('div', { className: 'preview-effects' }, effects.map((item) => el('span', { text: item.name })))]));
  }
  document.querySelector('#reloadBuild')?.addEventListener('click', render);
  try {
    render();
    const shell = document.querySelector('.showcase-shell');
    if (shell) {
      shell.classList.remove('is-entering');
      void shell.offsetWidth;
      shell.classList.add('is-entering');
      window.setTimeout(() => shell.classList.remove('is-entering'), 1200);
    }
  } catch (error) {
    console.error('[showcase] render failed', error);
    const status = document.querySelector('#showcaseStatus');
    if (status) status.textContent = '配置读取失败，请返回编辑器重新保存一次';
    document.querySelector('#showcaseSkills')?.replaceChildren(el('p', { className: 'empty-state', text: '暂时无法读取当前配置' }));
  }
})();
