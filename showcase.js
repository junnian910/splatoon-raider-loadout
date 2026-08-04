(function () {
  'use strict';
  const { seed, storage, rules, el } = window.Raider;
  const visual = (item, className = '') => {
    const frame = el('span', { className: `asset-frame ${className}` });
    if (item?.image) frame.append(el('img', { src: item.image, alt: '' }));
    else frame.append(el('span', { className: 'asset-glyph', text: item?.glyph || '?' }));
    return frame;
  };
  // —— 零件折叠：一正一反 accordion 折堆 + 锁链式 Verlet 落下 ——
  // 折叠位：每张卡交替左右偏 + 交替旋转（像折扇/梯子收起），底端最后一张只露右下角
  function foldCards(list) {
    const cards = [...list.children].filter((n) => n.classList.contains('showcase-plugin'));
    if (!cards.length) return null;
    list.classList.add('is-folding');
    const restY = cards.map((c) => c.offsetTop);       // 布局槽位（transform 不影响 offsetTop）
    const cardH = cards[0].offsetHeight || 54;
    const pairLen = restY.slice(1).map((y, i) => Math.max(6, y - restY[i]));  // 相邻链节长度（移动端两列时不同）
    const peek = 26;
    const step = 9;
    const folds = cards.map((_, i) => {
      const alt = i % 2 === 0 ? -1 : 1;                 // 一正一反
      const depth = Math.min(i, 5);                     // 越往下弯曲越明显
      return {
        x: alt * (4 + depth * 2.4),                     // 左右交替偏移
        y: (i - (cards.length - 1)) * step + peek - cardH,
        rot: alt * (1.5 + depth * 0.32)                 // 交替倾斜 → 弧形弯曲
      };
    });
    cards.forEach((c, i) => {
      c.style.transform = `translate(${folds[i].x}px, ${folds[i].y - restY[i]}px) rotate(${folds[i].rot}deg)`;
    });
    return { cards, restY, folds, pairLen };
  }

  // Verlet 链：槽位弹簧（远处加速 = 物理下落感）+ 相邻距离约束 + 每节独立相位摆动
  function dropFold(state) {
    const { cards, restY, folds, pairLen } = state;
    const N = cards.length;
    const links = cards.map((_, i) => ({
      el: cards[i],
      x: folds[i].x, y: folds[i].y - restY[i],
      px: folds[i].x, py: folds[i].y - restY[i] - 9,   // 初始向下冲量
      rot: folds[i].rot, prot: folds[i].rot,
      restY: restY[i],
      phase: (i % 3) * 0.85 + Math.random() * 0.7       // 每个摆动都不一样
    }));
    const spring = 120, damping = 0.9;
    let raf = 0, last = performance.now(), frames = 0;
    const step = (ts) => {
      const dt = Math.min((ts - last) / 1000, 0.033); last = ts; frames += 1;
      const dt2 = dt * dt;
      // Verlet 积分 + 弹簧拉向槽位（远离时加速，近处无静力下垂）
      for (const L of links) {
        const vx = (L.x - L.px) * damping;
        const vy = (L.y - L.py) * damping;
        L.px = L.x; L.py = L.y;
        L.x += vx - L.x * spring * dt2;
        L.y += vy - L.y * spring * dt2;
      }
      // 锁链距离约束（绝对位置 = 槽位 + 偏移）
      for (let k = 0; k < 3; k += 1) {
        for (let i = 0; i < N - 1; i += 1) {
          const a = links[i], b = links[i + 1];
          const dx = b.x - a.x;
          const dy = (b.restY + b.y) - (a.restY + a.y);
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
          const diff = (dist - pairLen[i]) / dist;
          a.x += dx * 0.5 * diff; a.y += dy * 0.5 * diff;
          b.x -= dx * 0.5 * diff; b.y -= dy * 0.5 * diff;
        }
      }
      // 渲染 + 摆动（离槽位越远摆动越强，随收敛衰减）
      let maxOff = 0;
      for (const L of links) {
        const vr = (L.rot - L.prot) * damping;
        L.prot = L.rot;
        L.rot += vr + Math.sin(ts / 330 + L.phase) * 0.5 * Math.min(1, Math.abs(L.y) / 90);
        L.rot += -L.rot * 0.07;
        maxOff = Math.max(maxOff, Math.abs(L.x), Math.abs(L.y), Math.abs(L.rot));
        L.el.style.transform = `translate(${L.x.toFixed(2)}px, ${L.y.toFixed(2)}px) rotate(${L.rot.toFixed(2)}deg)`;
      }
      if (maxOff < 0.5 && frames > 30) {
        links.forEach((L) => { L.el.style.transform = ''; });
        cards[0].closest('.showcase-plugin-list')?.classList.remove('is-folding');
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function render() {    const catalog = storage.loadCatalog(); const build = storage.loadBuild();
    // 用当前选中的主背包作为展示页主题色（speed/power/technique）
    if (build.mainPackId) document.body.dataset.activePack = build.mainPackId;
    else document.body.removeAttribute('data-active-pack');
    const status = rules.validateBuild(build, catalog);
    const statusEl = document.querySelector('#showcaseStatus');
    if (statusEl) statusEl.textContent = status.valid ? '配置规则检查通过' : status.problems[0] || '配置尚未完成';
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
            plugin.image ? el('img', { src: plugin.image, className: 'showcase-part-img', alt: '' }) : null,
            el('span', { className: 'showcase-cost', text: String(plugin.slotCost) })
          ]),
          el('span', {}, [el('strong', { text: plugin.name }), el('small', { text: plugin.effectText || '' })]),
          el('b', { text: plugin.bonusText || '' })
        ]));
      });
      const meter = el('div', { className: 'showcase-meter' }, [el('div', {}, [el('span', { text: '零件成本' }), el('strong', { text: `${total}/40` })]), el('span', { className: 'meter-track' }, el('i', { style: `width:${Math.min(100, total / 40 * 100)}%` }))]);
      // 零件折叠动画：一正一反的 accordion 折堆藏在配件标题后，只露右下角；
      // 落下用锁链式 Verlet 物理（每节摆动不同），点击角标立即落，5 秒自动落
      const grip = el('button', { className: 'showcase-fold-grip', attrs: { type: 'button' }, text: '零件 ▾' });
      const article = el('article', { className: 'showcase-skill', dataset: { pack: skill.packId } }, [el('header', {}, [el('span', { className: 'showcase-position', text: `0${index + 1}` }), visual(skill, 'asset-showcase-skill'), el('div', {}, [el('small', { text: pack.name }), el('h2', { text: skill.name }), el('p', { text: `${plugins.length}/9 已安装` })])]), list, grip, meter]);
      if (!plugins.length) article.classList.add('is-unfolded');
      else {
        let foldState = null;
        requestAnimationFrame(() => { if (!article.dataset.dropped) foldState = foldCards(list); });
        const drop = () => {
          if (article.dataset.dropped) return;
          article.dataset.dropped = '1';
          article.classList.add('is-unfolded');
          if (!foldState) foldState = foldCards(list);
          if (foldState) dropFold(foldState);
        };
        grip.addEventListener('click', (e) => { e.stopPropagation(); drop(); });
        article.addEventListener('click', drop);
        window.setTimeout(drop, 5000);
      }
      return article;
    }));
    const pack = rules.packById(build.mainPackId);
    document.querySelector('#packSummary').replaceChildren(el('span', { className: 'summary-label', text: 'MAIN BACKPACK' }), visual(pack || null, 'asset-summary'), el('span', { className: `pack-card-label showcase-pack-label ${pack ? 'pack-card-label--' + pack.id : ''}`, text: pack ? `${pack.name}背包` : '未选择背包' }));
    const treasures = build.treasureIds.map((id) => rules.treasureById(catalog, id)).filter(Boolean); const treasureHost = document.querySelector('#treasureSummary'); treasureHost.replaceChildren(el('span', { className: 'summary-label', text: 'TREASURES' }), el('div', { className: 'summary-item-grid' }, treasures.length ? treasures.map((item) => el('div', { dataset: { scope: item.scope, pack: item.packId || '' } }, [visual(item, 'asset-summary-small'), el('span', {}, [el('strong', { text: item.name }), el('small', { text: item.description })])])) : el('p', { className: 'empty-state', text: '未安装秘宝' })));
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
