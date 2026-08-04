(function () {
  'use strict';

  const { seed, storage, rules, share, el, ui } = window.Raider;
  let catalog = storage.loadCatalog();
  let build = storage.loadBuild();
  let activeSkillId = build.skillIds.find(Boolean) || null;
  let editingSlot = 0;
  let lastDialogTrigger = null;
  let weaponTypeIndex = 0;

  const refs = {
    packGrid: document.querySelector('#packGrid'),
    notice: document.querySelector('#buildNotice'),
    skillSlots: document.querySelector('#skillSlots'),
    pluginTabs: document.querySelector('#pluginTabs'),
    pluginCatalog: document.querySelector('#pluginCatalog'),
    installedPane: document.querySelector('#installedPane'),
    treasureCatalog: document.querySelector('#treasureCatalog'),
    treasureInstalled: document.querySelector('#treasureInstalled'),
    weaponSelectButton: document.querySelector('#weaponSelectButton'),
    weaponDialog: document.querySelector('#weaponDialog'),
    weaponPickerBody: document.querySelector('#weaponPickerBody'),
    weaponListGrid: document.querySelector('#weaponListGrid'),
    weaponPrev: document.querySelector('#weaponPrev'),
    weaponNext: document.querySelector('#weaponNext'),
    weaponEffects: document.querySelector('#weaponEffects'),
    weaponPreview: document.querySelector('#weaponPreview'),
    skillDialog: document.querySelector('#skillDialog'),
    skillPicker: document.querySelector('#skillPicker'),
    shareDialog: document.querySelector('#shareDialog'),
    shareCode: document.querySelector('#shareCode'),
    importDialog: document.querySelector('#importDialog'),
    importCode: document.querySelector('#importCode'),
    toast: document.querySelector('#toast'),
    hovercard: document.querySelector('#pluginHovercard')
  };

  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function activeItems(items) {
    return items.filter((item) => !item.deletedAt);
  }

  function save() {
    if (build.mainPackId) {
      build.packStates ||= {};
      build.packStates[build.mainPackId] = {
        mainPackId: build.mainPackId,
        skillIds: build.skillIds.slice(),
        pluginsBySkillId: copy(build.pluginsBySkillId),
        treasureIds: build.treasureIds.slice(),
        weaponId: build.weaponId,
        weaponEffectIds: build.weaponEffectIds.slice()
      };
    }
    storage.saveBuild(build);
  }

  function switchPack(packId) {
    save();
    const state = build.packStates?.[packId] || {
      mainPackId: packId,
      skillIds: [null, null, null],
      pluginsBySkillId: {},
      treasureIds: [],
      weaponId: null,
      weaponEffectIds: []
    };
    build.mainPackId = packId;
    build.skillIds = state.skillIds.slice();
    build.pluginsBySkillId = copy(state.pluginsBySkillId);
    build.treasureIds = state.treasureIds.slice();
    build.weaponId = state.weaponId;
    build.weaponEffectIds = state.weaponEffectIds.slice();
    activeSkillId = build.skillIds.find(Boolean) || null;
    save();
  }

  function imageOrGlyph(item, className = '', fallbackText = null) {
    const frame = el('span', { className: `asset-frame ${className}${item?.image ? ' has-image' : ''}` });
    if (item?.image) frame.append(el('img', { src: item.image, alt: '' }));
    else frame.append(el('span', { className: 'asset-glyph', text: fallbackText || item?.glyph || '?' }));
    return frame;
  }

  function shake(node) {
    if (!node) return;
    node.classList.remove('is-rejected');
    void node.offsetWidth;
    node.classList.add('is-rejected');
    window.setTimeout(() => node.classList.remove('is-rejected'), 520);
  }

  function notify(message, source) {
    refs.toast.textContent = message;
    refs.toast.hidden = false;
    refs.toast.classList.remove('toast-pop');
    void refs.toast.offsetWidth;
    refs.toast.classList.add('toast-pop');
    shake(source);
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => { refs.toast.hidden = true; }, 2400);
  }

  function showDialog(dialog, trigger) {
    lastDialogTrigger = trigger || document.activeElement;
    dialog.showModal();
  }

  function closeDialog(dialog) {
    dialog.close();
    lastDialogTrigger?.focus?.();
  }

  function showPluginHovercard(button, plugin) {
    refs.hovercard.replaceChildren(
      el('span', { className: 'hovercard-effect-value', text: plugin.bonusText || '' })
    );
    const target = button.getBoundingClientRect();
    refs.hovercard.style.left = `${Math.min(window.innerWidth - 150, target.left + target.width / 2)}px`;
    refs.hovercard.style.top = `${Math.max(12, target.top - 24)}px`;
    refs.hovercard.hidden = false;
    refs.hovercard.classList.add('is-visible');
  }

  function hidePluginHovercard() {
    refs.hovercard.hidden = true;
    refs.hovercard.classList.remove('is-visible');
  }

  function showPackResetBtn(show, packId) {
    var existing = document.querySelector('#packResetBtn');
    if (existing) existing.remove();
    // Update next button color
    document.querySelectorAll('.specular-btn').forEach(function(nextBtn) {
      nextBtn.classList.remove('specular-btn--speed', 'specular-btn--power', 'specular-btn--technique');
      if (packId) nextBtn.classList.add('specular-btn--' + packId);
    });
    if (!show) return;
    var btn = el('button', { id: 'packResetBtn', className: 'pack-reset-btn', text: '重新选择', onclick: function() {
      build.mainPackId = null; save(); renderAll();
    }});
    btn.addEventListener('pointermove', function(e) {
      var rect = btn.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var y = e.clientY - rect.top;
      var cx = rect.width / 2, cy = rect.height / 2;
      var dx = x - cx, dy = y - cy;
      var kx = dx !== 0 ? cx / Math.abs(dx) : Infinity;
      var ky = dy !== 0 ? cy / Math.abs(dy) : Infinity;
      var edge = Math.min(Math.max(1 / Math.min(kx, ky), 0), 1) * 100;
      var angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
      if (angle < 0) angle += 360;
      btn.style.setProperty('--edge', edge.toFixed(1));
      btn.style.setProperty('--angle', angle.toFixed(1) + 'deg');
    });
    btn.addEventListener('pointerleave', function() {
      btn.style.setProperty('--edge', '0');
    });
    var header = document.querySelector('#builderWrap');
    if (header) header.style.position = 'relative';
    // Insert at bottom-left of builder header area
    var target = document.querySelector('#step-pack');
    if (target) target.style.position = 'relative';
    if (target) target.append(btn);
  }

  function renderPacks() {
    var selectedPackId = build.mainPackId;
    var packData = [
      { id: 'speed', name: '速度', front: '背包照片/速度正面卡.jpg', back: '背包照片/速度背包.png' },
      { id: 'power', name: '力量', front: '背包照片/力量正面卡.jpg', back: '背包照片/力量背包.png' },
      { id: 'technique', name: '技巧', front: '背包照片/技巧正面卡.jpg', back: '背包照片/技巧背包.png' }
    ];

    var container = el('div', { className: 'pack-stage' });

    function bindTiltedCard(card, amplitude, hoverScale) {
      if (!card || card.dataset.tiltBound) return card;
      card.dataset.tiltBound = 'true';
      card.addEventListener('pointermove', function (event) {
        if (event.pointerType === 'touch') return;
        var rect = card.getBoundingClientRect();
        var nx = (event.clientX - rect.left) / rect.width - .5;
        var ny = (event.clientY - rect.top) / rect.height - .5;
        card.style.transform = 'perspective(1000px) rotateX(' + (-ny * amplitude).toFixed(2) + 'deg) rotateY(' + (nx * amplitude).toFixed(2) + 'deg) scale(' + hoverScale + ')';
      });
      card.addEventListener('pointerleave', function () { card.style.transform = ''; });
      return card;
    }

    function makeCard(pd) {
      var isSelected = selectedPackId === pd.id;
      var backCls = 'pack-card-back pack-card-back--' + pd.id;
      var labelCls = 'pack-card-label pack-card-label--' + pd.id;
      var inner = el('div', { className: 'pack-card-inner' }, [
        el('div', { className: 'pack-card-front' }, [el('img', { src: pd.front, alt: '' })]),
        el('div', { className: backCls }, [el('img', { src: pd.back, alt: '' })])
      ]);
      var cls = 'pack-card-3d';
      if (isSelected) cls += ' is-flipped is-chosen';
      var card3d = el('div', { className: cls }, [inner, el('div', { className: labelCls, text: pd.name })]);
      card3d.addEventListener('click', function() {
        if (!card3d.classList.contains('is-flipped')) {
          // Flip this one, unflip others
          container.querySelectorAll('.pack-card-3d').forEach(function(c) {
            c.classList.remove('is-flipped', 'is-chosen');
          });
          card3d.classList.add('is-flipped', 'is-chosen');
          switchPack(pd.id);
          setTimeout(function() { renderAll(); }, 500);
        }
      });
      return bindTiltedCard(card3d, 30, 1.10);
    }

    // Already selected: show cards directly in a row
    if (selectedPackId) {
      container.classList.add('pack-stage--' + selectedPackId);
      var row = el('div', { className: 'pack-row' });
      packData.forEach(function(pd) { row.append(makeCard(pd)); });
      container.append(row);
      refs.packGrid.replaceChildren(container);
      showPackResetBtn(true, selectedPackId);
      return;
    }
    showPackResetBtn(false, null);

    // Not selected: show big image, split on hover
    var mainImg = el('img', { src: '背包照片/首先展示图片.jpg', alt: '' });
    var mainDiv = el('div', { className: 'pack-main' }, [mainImg]);
    container.append(mainDiv);

    var cardRow = el('div', { className: 'pack-row', style: 'position:absolute;inset:0;pointer-events:none;' });
    var cardEls = [];
    packData.forEach(function(pd) {
      var c = makeCard(pd);
      c.style.opacity = '0';
      c.style.transform = 'scale(0.5)';
      cardRow.append(c);
      cardEls.push(c);
    });
    container.append(cardRow);

    // Auto-start split after 2500ms from entry, or on hover
    var splitStarted = false;
    var splitTimer = null;
    var delayMs = 2500;
    var splitDuration = 800;
    function startSplit() {
      if (splitStarted) return;
      splitStarted = true;
      if (splitTimer) clearTimeout(splitTimer);
      mainDiv.classList.add('is-splitting');
      var start = performance.now();
      function anim(ts) {
        var t = Math.min((ts - start) / splitDuration, 1);
        var e = 1 - Math.pow(1 - t, 3);
        cardEls.forEach(function(c) {
          c.style.opacity = String(e);
          c.style.transform = 'scale(' + (0.3 + 0.7 * e) + ')';
          c.style.pointerEvents = t >= 1 ? 'auto' : 'none';
        });
        if (t < 1) requestAnimationFrame(anim);
      }
      requestAnimationFrame(anim);
    }
    mainDiv.addEventListener('mouseenter', startSplit);
    splitTimer = setTimeout(startSplit, delayMs);

    refs.packGrid.replaceChildren(container);
  }

  function renderNotice() {
    const result = rules.validateSkills(build, catalog);
    refs.notice.hidden = result.valid || result.message.includes('还需选择');
    refs.notice.textContent = result.message;
  }

  function openSkillPicker(slotIndex, trigger) {
    if (!build.mainPackId) {
      notify('请先选择主背包。', trigger);
      return;
    }
    editingSlot = slotIndex;
    refs.skillPicker.replaceChildren(...seed.packs.map((pack) => {
      const column = el('section', { className: 'picker-column' }, [
        el('header', {}, [el('span', { text: pack.short }), el('h3', { text: pack.name })])
      ]);
      activeItems(catalog.skills).filter((skill) => skill.packId === pack.id).forEach((skill) => {
        const check = rules.canSelectSkill(build, catalog, skill.id, slotIndex);
        column.append(el('button', {
          className: `picker-skill${build.skillIds[slotIndex] === skill.id ? ' is-current' : ''}`,
          dataset: { pack: skill.packId },
          attrs: { type: 'button', disabled: check.allowed ? null : '' },
          onclick() {
            build.skillIds[editingSlot] = skill.id;
            build.pluginsBySkillId[skill.id] ||= [];
            activeSkillId = skill.id;
            save();
            closeDialog(refs.skillDialog);
            renderSkillSlots();
            renderNotice();
            renderPlugins();
          }
        }, [imageOrGlyph(skill, 'asset-small'), el('span', {}, [
          el('strong', { text: skill.name }),
          el('small', { text: check.reason || '' })
        ])]));
      });
      return column;
    }));
    showDialog(refs.skillDialog, trigger);
  }

  function renderSkillSlots() {
    const activeSkill = rules.skillById(catalog, activeSkillId);
    if (activeSkill) document.body.dataset.activePack = activeSkill.packId;
    else document.body.removeAttribute('data-active-pack');
    refs.skillSlots.replaceChildren(...build.skillIds.map((skillId, index) => {
      const skill = rules.skillById(catalog, skillId);
      if (!skill) {
        return el('button', {
          className: 'skill-slot skill-slot-empty',
          attrs: { type: 'button' },
          onclick(event) { openSkillPicker(index, event.currentTarget); }
        }, [
          el('span', { className: 'empty-cross', text: '+' }),
          el('strong', { text: `选择配件 ${index + 1}` }),
          el('small', { text: '打开三列配件选择器' })
        ]);
      }
      const pack = rules.packById(skill.packId);
      const count = (build.pluginsBySkillId[skill.id] || []).length;
      const total = rules.pluginTotal(build, catalog, skill.id);
      const card = el('article', { className: `skill-slot skill-slot-filled${activeSkillId === skill.id ? ' is-active' : ''}`, dataset: { pack: skill.packId } }, [
        el('span', { className: 'slot-label', text: `配件 ${index + 1}` }),
        imageOrGlyph(skill, 'asset-skill'),
        el('div', { className: 'skill-slot-copy' }, [
          el('small', { text: pack.name }),
          el('h3', { text: skill.name }),
          el('span', { text: `${count}/9 零件 · ${total}/40 成本` })
        ]),
        el('button', {
          className: 'change-button', text: '×',
          attrs: { type: 'button', title: '移除配件', 'aria-label': `移除${skill.name}` },
          onclick() {
            build.skillIds[index] = null;
            if (activeSkillId === skill.id) activeSkillId = build.skillIds.find(Boolean) || null;
            save();
            renderSkillSlots();
            renderNotice();
            renderPlugins();
          }
        })
      ]);
      card.addEventListener('click', (event) => {
        if (event.target.closest('button')) return;
        activeSkillId = skill.id;
        renderPlugins();
      });
      return card;
    }));
  }

  function renderPluginTabs() {
    const selectedSkills = build.skillIds.map((id) => rules.skillById(catalog, id)).filter(Boolean);
    if (!selectedSkills.some((skill) => skill.id === activeSkillId)) activeSkillId = selectedSkills[0]?.id || null;
    refs.pluginTabs.replaceChildren(...selectedSkills.map((skill) => el('button', {
      className: `skill-tab${activeSkillId === skill.id ? ' is-selected' : ''}`,
      dataset: { pack: skill.packId },
      attrs: { type: 'button', role: 'tab', 'aria-selected': String(activeSkillId === skill.id) },
      onclick() { activeSkillId = skill.id; renderPlugins(); }
    }, [imageOrGlyph(skill, 'asset-tab'), el('span', {}, [
      el('strong', { text: skill.name }),
      el('small', { text: `${(build.pluginsBySkillId[skill.id] || []).length}/9 已安装` })
    ])])));
  }

  function installPlugin(plugin, button) {
    let ids = (build.pluginsBySkillId[activeSkillId] || []).slice();
    const sameTypeIds = ids.filter((id) => rules.pluginById(catalog, id)?.name === plugin.name);
    if (ids.includes(plugin.id)) {
      // Parts sharing a name are one switchable type. Clicking the active part removes that type.
      ids = ids.filter((id) => !sameTypeIds.includes(id));
    } else {
      // Validate against the post-switch state so replacing a costly part can still fit the 40-point cap.
      const projected = copy(build);
      projected.pluginsBySkillId = copy(build.pluginsBySkillId);
      projected.pluginsBySkillId[activeSkillId] = ids.filter((id) => !sameTypeIds.includes(id));
      const decision = rules.canInstallPlugin(projected, catalog, activeSkillId, plugin.id);
      if (!decision.allowed) {
        notify(decision.reason, button);
        return;
      }
      ids = projected.pluginsBySkillId[activeSkillId].concat(plugin.id);
    }
    build.pluginsBySkillId[activeSkillId] = ids;
    save();
    renderSkillSlots();
    renderPlugins();
  }

  function pluginQualityKey(plugin) {
    return Object.entries(seed.qualityBorders).find(([, value]) => value === plugin.quality)?.[0] || 'white';
  }

  function sortPlugins(a, b) {
    const qualityRank = { rainbow: 0, gold: 1, purple: 2, green: 3, white: 4 };
    const qualityResult = (qualityRank[pluginQualityKey(a)] ?? 99) - (qualityRank[pluginQualityKey(b)] ?? 99);
    if (qualityResult) return qualityResult;
    const costResult = Number(b.slotCost || 0) - Number(a.slotCost || 0);
    return costResult || String(a.id).localeCompare(String(b.id));
  }

  function pluginTile(plugin, installedId) {
    const isInstalled = installedId === plugin.id;
    const button = el('button', {
      className: `plugin-tile-button${isInstalled ? ' is-installed' : ''}`,
      attrs: { type: 'button', 'aria-pressed': String(isInstalled), title: plugin.name },
      onclick(event) { hidePluginHovercard(); installPlugin(plugin, event.currentTarget); }
    });
    // Border image as CSS background on the button itself (avoids div-in-button)
    const borderImg = el('img', {
      src: plugin.quality || seed.qualityBorders.gold,
      className: 'plugin-tile-border',
      alt: ''
    });
    button.append(borderImg);
    // Part image inside
    const partImg = el('img', { src: plugin.image || '', className: 'plugin-tile-part-img', alt: plugin.name });
    if (!plugin.image) {
      partImg.style.display = 'none';
      button.append(el('span', { className: 'plugin-tile-glyph', text: plugin.name.charAt(0) || '零' }));
    }
    button.append(partImg);
    // Cost badge
    button.append(el('span', { className: 'plugin-tile-cost', text: String(plugin.slotCost) }));
    if (isInstalled) {
      button.append(el('span', { className: 'plugin-selected-mark', text: '已选', attrs: { 'aria-hidden': 'true' } }));
    }
    // Events
    button.addEventListener('mouseenter', () => showPluginHovercard(button, plugin));
    button.addEventListener('mouseleave', hidePluginHovercard);
    button.addEventListener('focus', () => showPluginHovercard(button, plugin));
    button.addEventListener('blur', hidePluginHovercard);
    return button;
  }

  function renderPlugins() {
    renderPluginTabs();
    const skill = rules.skillById(catalog, activeSkillId);
    if (!skill) {
      document.body.removeAttribute('data-active-pack');
      refs.pluginCatalog.replaceChildren(el('p', { className: 'empty-state', text: '请先选择至少一个配件。' }));
      refs.installedPane.replaceChildren(el('p', { className: 'empty-state', text: '等待选择配件。' }));
      return;
    }
    document.body.dataset.activePack = skill.packId;
    const installed = build.pluginsBySkillId[skill.id] || [];

    // Group plugins by name, show name label on left, up to 8 per row
    const pluginList = activeItems(catalog.plugins)
      .filter((p) => p.skillId === skill.id)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-CN') || sortPlugins(a, b));

    const grouped = new Map();
    pluginList.forEach((p) => {
      if (!grouped.has(p.name)) grouped.set(p.name, []);
      grouped.get(p.name).push(p);
    });

    const groups = [];
    grouped.forEach((items, name) => {
      groups.push(el('div', { className: 'plugin-name-group' }, [
        el('span', { className: 'plugin-group-label', text: name }),
        el('div', { className: 'plugin-group-row' }, items.sort(sortPlugins).map((plugin) => pluginTile(plugin, installed.find((id) => id === plugin.id))))
      ]));
    });

    refs.pluginCatalog.replaceChildren(
      ...(groups.length
        ? groups
        : [el('p', { className: 'empty-state', text: '该配件暂无可用零件，请前往零件库添加。' })])
    );

    const plugins = installed.map((id) => rules.pluginById(catalog, id)).filter(Boolean);
    // Sort by quality (rainbow > gold > purple > green > white), then by numeric cost desc.
    plugins.sort(sortPlugins);
    const total = rules.pluginTotal(build, catalog, skill.id);
    const slots = el('div', { className: 'slot-shapes' });
    for (let index = 0; index < 9; index += 1) slots.append(el('i', { className: index < plugins.length ? 'is-filled' : '' }));
    const list = el('div', { className: 'installed-list' });
    if (!plugins.length) list.append(el('p', { className: 'empty-state', text: '尚未安装零件。' }));
    plugins.forEach((plugin) => {
      list.append(el('button', {
        className: 'installed-plugin',
        attrs: { type: 'button', title: '点击取消安装' },
        onclick() {
          build.pluginsBySkillId[skill.id] = installed.filter((id) => id !== plugin.id);
          save();
          renderSkillSlots();
          renderPlugins();
        }
      }, [
        // Composite thumbnail: border + part image + cost badge
        el('span', { className: 'installed-thumb' }, [
          el('img', { src: plugin.quality || seed.qualityBorders.gold, className: 'installed-border', alt: '' }),
          plugin.image ? el('img', { src: plugin.image, className: 'installed-part-img', alt: '' }) : null,
          el('span', { className: 'installed-cost-badge', text: String(plugin.slotCost) })
        ]),
        el('span', {}, [el('strong', { text: plugin.name }), el('small', { text: plugin.effectText || '' })]),
        el('b', { text: plugin.bonusText || '' })
      ]));
    });
    refs.installedPane.replaceChildren(
      el('div', { className: 'pane-heading' }, [el('strong', { text: '已安装的零件' })]),
      el('div', { className: 'point-readout' }, [el('span', { text: '成本' }), el('strong', { text: String(total) }), el('small', { text: '/ 40' })]),
      slots,
      list
    );
  }

  function treasureCard(treasure) {
    const installed = build.treasureIds.includes(treasure.id);
    const decision = rules.canInstallTreasure(build, catalog, treasure.id);
    const pack = treasure.packId ? rules.packById(treasure.packId) : null;
    return el('button', {
      className: `treasure-card${installed ? ' is-installed' : ''}${!decision.allowed ? ' is-unavailable' : ''}`,
      dataset: { scope: treasure.scope, pack: treasure.packId || '' },
      attrs: { type: 'button', 'aria-pressed': String(installed), 'aria-disabled': String(!decision.allowed) },
      onclick(event) {
        const current = rules.canInstallTreasure(build, catalog, treasure.id);
        if (!current.allowed) return notify(current.reason, event.currentTarget);
        build.treasureIds = current.remove
          ? build.treasureIds.filter((id) => id !== treasure.id)
          : [...build.treasureIds, treasure.id];
        save();
        renderTreasures();
      }
    }, [
      imageOrGlyph(treasure, 'asset-treasure'),
      el('span', {}, [el('strong', { text: treasure.name })]),
      el('span', { className: 'selection-mark', attrs: { 'aria-hidden': 'true' } })
    ]);
  }

  function renderTreasures() {
    const treasures = activeItems(catalog.treasures);
    const groups = [
      { title: '普通秘宝', items: treasures.filter((item) => item.scope === 'common') },
      ...seed.packs.map((pack) => ({ title: `${pack.name}秘宝`, items: treasures.filter((item) => item.packId === pack.id) }))
    ];
    refs.treasureCatalog.replaceChildren(...groups.map((group) => el('section', { className: 'treasure-group' }, [
      el('header', {}, [el('strong', { text: group.title })]),
      el('div', { className: 'treasure-grid' }, group.items.map(treasureCard))
    ])));
    const installed = build.treasureIds.map((id) => rules.treasureById(catalog, id)).filter(Boolean);
    refs.treasureInstalled.replaceChildren(
      el('div', { className: 'compact-head' }, [el('strong', { text: '已安装秘宝' }), el('b', { text: `${installed.length}/5` })]),
      ...(installed.length ? installed.map((treasure) => el('button', {
        className: 'compact-item', attrs: { type: 'button', title: '点击取消安装' },
        onclick() {
          build.treasureIds = build.treasureIds.filter((id) => id !== treasure.id);
          save();
          renderTreasures();
        }
      }, [imageOrGlyph(treasure, 'asset-compact'), el('span', {}, [el('strong', { text: treasure.name }), el('small', { text: treasure.description })])])) : [
        el('p', { className: 'empty-state', text: '秘宝可以留空。' })
      ])
    );
  }

  function renderWeaponPicker() {
    const types = activeItems(catalog.weaponTypes);
    if (!types.length) return;
    if (weaponTypeIndex >= types.length) weaponTypeIndex = 0;
    const current = types[weaponTypeIndex];
    const selectedWeapon = catalog.weapons.find((w) => w.id === build.weaponId);

    refs.weaponPickerBody.replaceChildren(
      el('span', { className: 'asset-frame asset-weapon-type' }, current.image
        ? [el('img', { src: current.image, alt: '' }), el('span', { className: 'weapon-type-label', text: current.name })]
        : [el('span', { className: 'asset-glyph', text: current.short }), el('span', { className: 'weapon-type-label', text: current.name })]
      ),
      el('div', { className: 'weapon-picker-info' }, [
        el('h3', { text: current.name }),
        el('p', { text: `共 ${current.weaponCount} 把武器，当前已录入 ${activeItems(catalog.weapons).filter((w) => w.typeId === current.id).length} 把。` })
      ])
    );

    const typeWeapons = activeItems(catalog.weapons).filter((w) => w.typeId === current.id);
    refs.weaponListGrid.replaceChildren(
      typeWeapons.length
        ? typeWeapons.map((w) => el('button', {
          className: `weapon-item${build.weaponId === w.id ? ' is-selected' : ''}`,
          attrs: { type: 'button' },
          onclick() {
            build.weaponId = w.id;
            if (!build.weaponId) build.weaponEffectIds = [];
            save();
            closeDialog(refs.weaponDialog);
            renderWeapons();
          }
        }, [imageOrGlyph(w, '', current.short || '武'), el('strong', { text: w.name })]))
        : [el('span', { className: 'weapon-item-placeholder', text: '该类型暂无武器，请前往武器库录入。' })]
    );
  }

  function renderWeapons() {
    const weapon = catalog.weapons.find((item) => item.id === build.weaponId);
    const weaponType = weapon ? rules.weaponTypeById(catalog, weapon.typeId) : null;
    refs.weaponSelectButton.textContent = weapon ? `${weapon.name}（${weaponType?.name || '未知类型'}）` : '点击选择武器';

    refs.weaponEffects.replaceChildren(...activeItems(catalog.weaponEffects).map((effect) => {
      const selected = build.weaponEffectIds.includes(effect.id);
      return el('button', {
        className: `effect-chip${selected ? ' is-selected' : ''}`,
        attrs: { type: 'button', 'aria-pressed': String(selected), disabled: build.weaponId ? null : '' },
        onclick(event) {
          if (selected) build.weaponEffectIds = build.weaponEffectIds.filter((id) => id !== effect.id);
          else if (build.weaponEffectIds.length >= 3) return notify('武器效果最多选择 3 个。', event.currentTarget);
          else build.weaponEffectIds.push(effect.id);
          save();
          renderWeapons();
        }
      }, [imageOrGlyph(effect, 'asset-effect'), el('span', { text: effect.name })]);
    }));
    const effects = build.weaponEffectIds.map((id) => catalog.weaponEffects.find((item) => item.id === id)).filter(Boolean);
    refs.weaponPreview.replaceChildren(
      imageOrGlyph(weapon || { glyph: '-' }, 'asset-weapon'),
      el('div', {}, [el('small', { text: '当前武器' }), el('h3', { text: weapon?.name || '未选择武器' }), el('p', { text: weapon?.description || weaponType ? `${weaponType.name}类型` : '点击上方按钮选择武器类型和具体武器。' })]),
      el('div', { className: 'preview-effects' }, effects.map((effect) => el('span', { text: effect.name })))
    );
  }

  function renderAll() {
    renderPacks();
    renderNotice();
    renderSkillSlots();
    renderPlugins();
    renderTreasures();
    renderWeapons();
  }

  // Weapon dialog
  refs.weaponSelectButton?.addEventListener('click', () => {
    weaponTypeIndex = 0;
    renderWeaponPicker();
    showDialog(refs.weaponDialog, refs.weaponSelectButton);
  });
  refs.weaponPrev?.addEventListener('click', () => {
    const types = activeItems(catalog.weaponTypes);
    weaponTypeIndex = (weaponTypeIndex - 1 + types.length) % types.length;
    renderWeaponPicker();
  });
  refs.weaponNext?.addEventListener('click', () => {
    const types = activeItems(catalog.weaponTypes);
    weaponTypeIndex = (weaponTypeIndex + 1) % types.length;
    renderWeaponPicker();
  });
  window.addEventListener('resize', hidePluginHovercard);
  document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => closeDialog(button.closest('dialog'))));
  document.querySelector('#exportBuild')?.addEventListener('click', (event) => {
    refs.shareCode.value = share.encodeShare(share.makeSnapshot(build, catalog));
    showDialog(refs.shareDialog, event.currentTarget);
  });
  document.querySelector('#copyShare')?.addEventListener('click', async (event) => {
    try { await navigator.clipboard.writeText(refs.shareCode.value); } catch (_) { refs.shareCode.select(); document.execCommand('copy'); }
    notify('分享码已复制。', event.currentTarget);
  });
  document.querySelector('#downloadJson')?.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(share.makeSnapshot(build, catalog), null, 2)], { type: 'application/json' }));
    const link = el('a', { href: url, download: 'splatoon-raider-build-v4.json' });
    link.click();
    URL.revokeObjectURL(url);
  });
  document.querySelector('#openImport')?.addEventListener('click', (event) => showDialog(refs.importDialog, event.currentTarget));
  document.querySelector('#dockImport')?.addEventListener('click', (event) => showDialog(refs.importDialog, event.currentTarget));
  document.querySelector('#dockExport')?.addEventListener('click', (event) => {
    refs.shareCode.value = share.encodeShare(share.makeSnapshot(build, catalog));
    showDialog(refs.shareDialog, event.currentTarget);
  });
  document.querySelector('#importFile')?.addEventListener('change', async (event) => {
    if (event.target.files[0]) refs.importCode.value = await event.target.files[0].text();
  });
  document.querySelector('#applyImport')?.addEventListener('click', (event) => {
    try {
      const input = refs.importCode.value.trim();
      const snapshot = input.startsWith('{') ? JSON.parse(input) : share.decodeShare(input);
      const imported = share.importSnapshot(snapshot);
      catalog = imported.catalog;
      build = imported.build;
      activeSkillId = build.skillIds.find(Boolean) || null;
      closeDialog(refs.importDialog);
      renderAll();
      notify('配置已导入。', event.currentTarget);
    } catch (error) {
      notify(error.message || '导入失败。', event.currentTarget);
    }
  });
  document.querySelector('#resetBuild')?.addEventListener('click', async () => {
    if (!await ui.confirm('确定清空所有背包配置吗？此操作不可撤销。')) return;
    build = storage.resetBuild();
    activeSkillId = null;
    renderAll();
  });

  function prepareTitleMotion() {
    const titles = [...document.querySelectorAll('.stage-heading h2')];
    titles.forEach((title) => {
      const text = title.textContent.trim();
      title.classList.add('scroll-float');
      title.replaceChildren(...[...text].map((character, index) => el('span', {
        className: 'scroll-float-char',
        text: character,
        attrs: { style: `--float-index:${index}` }
      })));
    });

    if (!('IntersectionObserver' in window)) {
      titles.forEach((title) => title.classList.add('is-floated'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-floated');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.35 });
    titles.forEach((title) => observer.observe(title));
  }

  prepareTitleMotion();
  renderAll();

  // --- MagicBento effects: spotlight, stars, click ripple, border glow ---
  (function initBentoFx() {
    const grid = document.querySelector('#bentoGrid');
    if (!grid) return;
    const cards = grid.querySelectorAll('.bento-card--glow');
    const glowColor = '58,160,80';
    const spotlightRadius = 340;
    const particleCount = 6;

    // Global spotlight
    const spotlight = document.createElement('div');
    spotlight.className = 'global-spotlight';
    document.body.appendChild(spotlight);
    let lastGlowFrame = 0;
    let pendingPointer = null;
    let sectionRect = null;
    let cardRects = [];
    const refreshGeometry = () => {
      const section = grid.closest('.bento-section') || grid;
      sectionRect = section.getBoundingClientRect();
      cardRects = Array.from(cards, card => card.getBoundingClientRect());
    };
    refreshGeometry();
    let geometryFrame = 0;
    const scheduleGeometry = () => {
      if (geometryFrame) return;
      geometryFrame = requestAnimationFrame(() => { geometryFrame = 0; refreshGeometry(); });
    };
    window.addEventListener('resize', scheduleGeometry, { passive: true });
    window.addEventListener('scroll', scheduleGeometry, { passive: true });
    document.addEventListener('mousemove', (e) => {
      pendingPointer = { x: e.clientX, y: e.clientY };
      if (lastGlowFrame) return;
      lastGlowFrame = requestAnimationFrame(() => {
        const point = pendingPointer;
        pendingPointer = null;
        lastGlowFrame = 0;
      if (!point || !sectionRect) return;
      if (grid.offsetParent === null) { spotlight.style.opacity = '0'; return; }
      const inside = point.x >= sectionRect.left && point.x <= sectionRect.right && point.y >= sectionRect.top && point.y <= sectionRect.bottom;
      if (!inside) { spotlight.style.opacity = '0'; return; }
      spotlight.style.transform = `translate3d(${point.x}px,${point.y}px,0) translate(-50%,-50%)`;
      // Update card glow
      cards.forEach((card, index) => {
        const cr = cardRects[index];
        if (!cr || !cr.width || !cr.height) return;
        const cx = cr.left + cr.width / 2;
        const cy = cr.top + cr.height / 2;
        const dist = Math.hypot(point.x - cx, point.y - cy) - Math.max(cr.width, cr.height) / 2;
        const proximity = spotlightRadius * 0.5;
        const fade = spotlightRadius * 0.75;
        let intensity = 0;
        if (dist <= proximity) intensity = 1;
        else if (dist <= fade) intensity = (fade - dist) / (fade - proximity);
        const rx = ((point.x - cr.left) / cr.width) * 100;
        const ry = ((point.y - cr.top) / cr.height) * 100;
        card.style.setProperty('--glow-x', rx + '%');
        card.style.setProperty('--glow-y', ry + '%');
        card.style.setProperty('--glow-intensity', intensity);
      });
      spotlight.style.opacity = '0.7';
      });
    });
    document.addEventListener('mouseleave', () => { spotlight.style.opacity = '0'; });

    // Star particles + click ripple on each card
    cards.forEach(card => {
      let hovering = false;
      let timers = [];
      card.addEventListener('mouseenter', () => {
        hovering = true;
        const rect = card.getBoundingClientRect();
        for (let i = 0; i < particleCount; i++) {
          const t = setTimeout(() => {
            if (!hovering) return;
            const p = document.createElement('div');
            p.className = 'bento-particle';
            const sx = Math.random() * rect.width;
            const sy = Math.random() * rect.height;
            p.style.left = sx + 'px';
            p.style.top = sy + 'px';
            card.appendChild(p);
            // Animate with requestAnimationFrame
            const duration = 1500 + Math.random() * 2000;
            const start = performance.now();
            const dx = (Math.random() - 0.5) * 60;
            const dy = (Math.random() - 0.5) * 60;
            function drift(ts) {
              const t = (ts - start) / duration;
              if (t >= 1) { p.style.opacity = '0'; setTimeout(() => p.remove(), 300); return; }
              const ease = Math.sin(t * Math.PI);
              p.style.transform = `translate(${dx * ease}px,${dy * ease}px) rotate(${t * 360}deg) scale(${1 - t * 0.4})`;
              p.style.opacity = t > 0.6 ? (1 - (t - 0.6) / 0.4) : '1';
              requestAnimationFrame(drift);
            }
            requestAnimationFrame(drift);
          }, i * 80);
          timers.push(t);
        }
      });
      card.addEventListener('mouseleave', () => { hovering = false; timers.forEach(clearTimeout); timers = []; });
      // Click ripple
      card.addEventListener('click', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const maxDist = Math.max(
          Math.hypot(x, y), Math.hypot(x - rect.width, y),
          Math.hypot(x, y - rect.height), Math.hypot(x - rect.width, y - rect.height)
        );
        const ripple = document.createElement('div');
        ripple.className = 'bento-ripple';
        ripple.style.cssText = `width:${maxDist*2}px;height:${maxDist*2}px;left:${x-maxDist}px;top:${y-maxDist}px;animation:ripple-out 0.7s ease-out forwards;`;
        card.appendChild(ripple);
        setTimeout(() => ripple.remove(), 750);
      });
    });

    // Inject ripple keyframe
    if (!document.querySelector('#bento-keyframes')) {
      const sheet = document.createElement('style');
      sheet.id = 'bento-keyframes';
      sheet.textContent = '@keyframes ripple-out{0%{transform:scale(0);opacity:1}100%{transform:scale(1);opacity:0}}';
      document.head.appendChild(sheet);
    }
  })();

  // Homepage & curved wheel
  var bentoGrid = document.querySelector('#bentoGrid');
  var builderWrap = document.querySelector('#builderWrap');
  var homeHero = document.querySelector('.home-hero');
  var stepWheel = document.querySelector('#stepWheel');
  var lanyardWidget = document.querySelector('#lanyardWidget');
  var lanyardCard = document.querySelector('#lanyardCard');

  if (lanyardWidget && lanyardCard) {
    var lanyardDrag = null;
    var lanyardRotation = 0;
    var lanyardSuppressClick = false;
    lanyardCard.addEventListener('click', function() {
      if (lanyardSuppressClick) { lanyardSuppressClick = false; return; }
      lanyardCard.classList.toggle('is-flipped');
    });
    lanyardCard.addEventListener('pointerdown', function(event) {
      lanyardDrag = { x: event.clientX, startRotation: lanyardRotation, moved: false, pointerId: event.pointerId };
      lanyardCard.setPointerCapture?.(event.pointerId);
    });
    var moveLanyard = function(event) {
      if (!lanyardDrag) return;
      var delta = event.clientX - lanyardDrag.x;
      if (Math.abs(delta) > 4) lanyardDrag.moved = true;
      lanyardRotation = Math.max(-18, Math.min(18, lanyardDrag.startRotation + delta * .12));
      lanyardWidget.style.setProperty('--lanyard-sway', lanyardRotation + 'deg');
    };
    document.addEventListener('pointermove', moveLanyard);
    var releaseLanyard = function() {
      if (!lanyardDrag) return;
      lanyardSuppressClick = lanyardDrag.moved;
      lanyardDrag = null;
      lanyardWidget.style.setProperty('--lanyard-sway', '0deg');
    };
    document.addEventListener('pointerup', releaseLanyard);
    document.addEventListener('pointercancel', releaseLanyard);
    document.addEventListener('pointerleave', releaseLanyard);
  }

  // --- Homepage intro sequence v2: full orchestrated ~12s sequence ---
  (function initHomeIntro() {
    var body = document.body;
    var heroTitle = document.querySelector('.hero-title');
    var heroSub = document.querySelector('.hero-sub');
    var introCta = document.querySelector('#introCta');
    var bentoGridEl = document.querySelector('#bentoGrid');
    var wheel = document.querySelector('#stepWheel');
    var dockOuter = document.querySelector('.dock-outer');
    var dockItems = dockOuter ? Array.from(dockOuter.querySelectorAll('.dock-item')) : [];
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var played = false;
    var lanyardPhys = null;
    var tiltRaf = 0;
    var tiltPending = null;
    var timers = [];

    function after(ms, fn) { var t = setTimeout(fn, ms); timers.push(t); return t; }

    // 把副标题拆成逐字符 span（用于从右滚动进场）
    function splitSub() {
      if (!heroSub || heroSub.querySelector('.sub-char')) return;
      var text = heroSub.textContent.trim();
      heroSub.textContent = '';
      Array.prototype.forEach.call(text, function (ch, i) {
        var s = document.createElement('span');
        s.className = 'sub-char';
        s.textContent = ch === ' ' ? ' ' : ch;
        s.style.animationDelay = (i * 0.09) + 's';
        heroSub.appendChild(s);
      });
    }

    // 标题视差（仅 intro 阶段）
    function onTiltMove(e) {
      if (body.dataset.homeStage !== 'intro' || !heroTitle) return;
      tiltPending = { x: e.clientX, y: e.clientY };
      if (tiltRaf) return;
      tiltRaf = requestAnimationFrame(function () {
        tiltRaf = 0;
        var p = tiltPending; if (!p) return;
        var rect = heroTitle.getBoundingClientRect();
        var dx = (p.x - (rect.left + rect.width / 2)) / (rect.width / 2);
        var dy = (p.y - (rect.top + rect.height / 2)) / (rect.height / 2);
        var amp = 8;
        heroTitle.style.setProperty('--tilt-x', (dx * amp).toFixed(2) + 'deg');
        heroTitle.style.setProperty('--tilt-y', (-dy * amp).toFixed(2) + 'deg');
      });
    }
    document.addEventListener('mousemove', onTiltMove, { passive: true });

    // 挂坠物理初始化（reduced-motion 或失败时返回 null）
    function initLanyardPhysics() {
      if (!lanyardWidget || !window.LanyardPhysics) return null;
      lanyardPhys = window.LanyardPhysics.init(lanyardWidget, { segments: 6, gravity: 1400 });
      return lanyardPhys;
    }

    // 名称从卡片飞入轮盘对应项
    // 时序：卡片名淡出的同时，飞行元素从卡片原位直接起飞，无缝衔接，避免"消失→重现→再消失"
    function flyNameToWheel(cardIndex, wheelIndex, done) {
      var cards = bentoGridEl ? bentoGridEl.querySelectorAll('.bento-card') : [];
      var card = cards[cardIndex];
      var wheelItems = wheel ? wheel.querySelectorAll('.step-wheel-item') : [];
      var wheelItem = wheelItems[wheelIndex];
      if (!card || !wheelItem) { done && done(); return; }
      var name = card.querySelector('.bento-card-name');
      var nameText = name ? name.textContent : '';

      // 让目标轮盘项可见以获取位置
      wheelItem.classList.add('is-flown-in');

      var cardRect = card.getBoundingClientRect();
      var wheelRect = wheelItem.getBoundingClientRect();
      var startX = cardRect.left + cardRect.width / 2;
      var startY = cardRect.top + cardRect.height / 2;
      var endX = wheelRect.left + wheelRect.width / 2;
      var endY = wheelRect.top + wheelRect.height / 2;

      // 飞行元素从卡片原位开始，与卡片名淡出同时进行
      var fly = document.createElement('div');
      fly.className = 'flying-name';
      fly.textContent = nameText;
      fly.style.left = startX + 'px';
      fly.style.top = startY + 'px';
      fly.style.transform = 'translate(-50%,-50%)';
      document.body.appendChild(fly);

      // 卡片名淡出 + 飞行元素同步起飞
      card.classList.add('is-name-flown');
      requestAnimationFrame(function () {
        fly.style.setProperty('--fly-x', (endX - startX) + 'px');
        fly.style.setProperty('--fly-y', (endY - startY) + 'px');
        fly.style.setProperty('--fly-rot', '-18deg');
        // 放大效果：从卡片名尺寸放大到略超轮盘项尺寸，形成"飞入即放大"
        fly.style.setProperty('--fly-scale', 1.35);
        fly.classList.add('is-flying');
      });

      after(700, function () {
        fly.remove();
        done && done();
      });
    }

    // Dock 出现（统一高度，无高低效果；逐项淡入冒出）
    function riseDock() {
      if (!dockOuter) return;
      dockItems.forEach(function (item, i) {
        item.style.animationDelay = (i * 0.1) + 's';
      });
      dockOuter.classList.add('is-rising');
      dockOuter.classList.add('is-settled');  // 直接正常高度 + 显示字母
    }

    // 挂坠砸下：卡片文字模糊重现，文字全部出现后 Dock 才出现
    function onLanyardLanded() {
      // 挂坠砸下：卡片背面模糊重现描述文字（选择背包等）
      var cards = bentoGridEl ? bentoGridEl.querySelectorAll('.bento-card') : [];
      cards.forEach(function (c, i) {
        after(i * 80, function () { c.classList.add('is-revealed-text'); });
      });
      // 等卡片文字全部出现后，Dock 才出现
      after(900, function () {
        riseDock();
        after(500, function () {
          body.dataset.homeReady = '1';
          played = true;
          try { localStorage.setItem('raiderIntroPlayed', '1'); } catch (_) {}
          // 片头全部结束，解除滚动锁定
          body.classList.remove('is-sequence-locked');
        });
      });
    }

    // 完整时序编排
    function runSequence() {
      body.dataset.homeStage = 'home';
      // 锁定滚动：飞入动画期间滚动会导致文字坐标错位，动画结束前禁止滚动
      body.classList.add('is-sequence-locked');
      window.scrollTo(0, 0);
      // 兜底：片头序列总时长约 6s，若动画异常中断也强制解锁，避免滚动卡死
      after(7000, function () { body.classList.remove('is-sequence-locked'); });
      if (heroTitle) { heroTitle.style.removeProperty('--tilt-x'); heroTitle.style.removeProperty('--tilt-y'); }
      splitSub();

      // t=1200: 标题归位，副标题滚动 + 卡片依次进场（逐张，和副标题字母同步）
      after(1200, function () {
        if (heroSub) { heroSub.classList.remove('is-scrolling-in'); void heroSub.offsetWidth; heroSub.classList.add('is-scrolling-in'); }
        if (bentoGridEl) {
          bentoGridEl.classList.remove('is-revealed');
          void bentoGridEl.offsetWidth;
          bentoGridEl.classList.add('is-revealed');
          // 6 张卡逐张进场，每张间隔 0.32s，总 ~2s，和副标题字母就绪同步
          var cards = bentoGridEl.querySelectorAll('.bento-card');
          // 逐张加 is-card-in 触发进场（JS 控制间隔，CSS 不再设 delay 避免双重延迟）
          cards.forEach(function (c, i) {
            after(i * 320, function () { c.classList.add('is-card-in'); });
          });
          // 等最后一张进场动画完全结束（slide-up 完成）再翻转，避免还没完全出现就翻面
          var lastCard = cards[cards.length - 1];
          if (lastCard) {
            var flipped = false;
            var onLastIn = function () {
              if (flipped) return;  // 防止 animationend + 兜底 timer 重复触发
              flipped = true;
              lastCard.removeEventListener('animationend', onLastIn);
              flipCardsAndWheel();
            };
            lastCard.addEventListener('animationend', onLastIn);
            // 兜底：若 animationend 未触发（如 reduced-motion 已跳过），固定时间后也翻
            timers.push(setTimeout(onLastIn, 5200));
          } else {
            after(4200, flipCardsAndWheel);
          }
        }
      });

      // 卡片全部到位后翻转 + 轮盘主页项跳出
      function flipCardsAndWheel() {
        var cards = bentoGridEl ? bentoGridEl.querySelectorAll('.bento-card') : [];
        cards.forEach(function (c) { c.classList.add('is-flipped'); });
        // 轮盘进入序列态，主页项先跳出
        if (wheel) {
          wheel.classList.add('is-intro-sequence');
          wheel.classList.add('hover');  // 临时显示以便主页项可见
          wheel.style.left = '-4px';
          var items = wheel.querySelectorAll('.step-wheel-item');
          if (items[0]) items[0].classList.add('is-flown-in');
          // 主页项作为当前激活，轮盘滚到主页位置
          if (typeof syncWheelIndex === 'function') syncWheelIndex('home');
        }
        startFlySequence();
      }

      // 翻转完成(0.6s)后，名称依次飞入轮盘；飞完→滚主页缩进→Dock→挂坠坠落→文字重现
      function startFlySequence() {
        var flyOrder = [
          { card: 0, wheel: 1, step: 'step-pack' },     // 背包
          { card: 1, wheel: 2, step: 'step-weapon' },   // 武器
          { card: 2, wheel: 3, step: 'step-skills' },   // 配件
          { card: 3, wheel: 4, step: 'step-plugins' },  // 零件
          { card: 4, wheel: 5, step: 'step-treasures' } // 秘宝
        ];
        var finalPair = { card: 5, wheel: 6, step: 'step-final' };
        var flyStart = 800;  // 翻转完成后 0.8s 开始飞入
        var flyStep = 700;
        flyOrder.forEach(function (pair, i) {
          after(flyStart + i * flyStep, function () {
            // 前一个轮盘项变模糊（最后一个保持清晰）
            if (i > 0) {
              var prevItem = wheel.querySelectorAll('.step-wheel-item')[flyOrder[i - 1].wheel];
              if (prevItem) prevItem.classList.add('is-blurred');
            }
            flyNameToWheel(pair.card, pair.wheel, null);
            // 轮盘跟随该项滚动：激活到当前飞入项，让它向上滚到位
            if (wheel && typeof syncWheelIndex === 'function') syncWheelIndex(pair.step);
          });
        });
        // 第6个（最终展示）飞入，保持清晰不模糊
        after(flyStart + flyOrder.length * flyStep, function () {
          var prevItem = wheel.querySelectorAll('.step-wheel-item')[flyOrder[flyOrder.length - 1].wheel];
          if (prevItem) prevItem.classList.add('is-blurred');
          flyNameToWheel(finalPair.card, finalPair.wheel, null);
          if (wheel && typeof syncWheelIndex === 'function') syncWheelIndex(finalPair.step);
        });

        // 飞完后：轮盘滚到主页 + 缩进
        var flyEnd = flyStart + (flyOrder.length + 1) * flyStep;  // 6 个飞完
        after(flyEnd, function () {
          if (wheel) {
            if (typeof syncWheelIndex === 'function') syncWheelIndex('home');
            after(500, function () {
              wheel.classList.remove('hover');
              wheel.style.left = '';  // 回到默认 -118px（缩进）
              wheel.classList.remove('is-intro-sequence');
              wheel.querySelectorAll('.step-wheel-item').forEach(function (it) {
                it.classList.remove('is-flown-in', 'is-blurred');
              });
            });
          }
        });

        // 轮盘缩进后：挂坠坠落（Dock 改为等卡片文字全部出现后才出现，见 onLanyardLanded）
        after(flyEnd + 700, function () {
          if (!lanyardWidget) return;
          lanyardWidget.classList.remove('is-falling');
          void lanyardWidget.offsetWidth;
          lanyardWidget.classList.add('is-falling');
          if (lanyardPhys) lanyardPhys.startDrop();
          after(900, onLanyardLanded);  // 落底
          after(950, function () { lanyardWidget.classList.remove('is-falling'); });
        });
      }
    }

    // 点击 click 按钮
    if (introCta) {
      introCta.addEventListener('click', function () {
        if (body.dataset.homeStage !== 'intro') return;
        runSequence();
      });
    }

    // 启动判定
    function boot() {
      // localStorage 持久记录"片头已播放"（file:// 下 sessionStorage 刷新可能丢失，localStorage 更可靠）
      var alreadyPlayed = false;
      try { alreadyPlayed = localStorage.getItem('raiderIntroPlayed') === '1'; } catch (_) {}
      if (!alreadyPlayed) {
        try { alreadyPlayed = sessionStorage.getItem('raiderIntroPlayed') === '1'; } catch (_) {}
      }
      if (reduceMotion || alreadyPlayed) {
        // 跳过片头，直接最终态
        body.dataset.homeStage = 'home';
        if (bentoGridEl) bentoGridEl.classList.add('is-revealed');
        if (heroSub) splitSub();
        // 卡片直接显示描述文字（最终态）
        var cards = bentoGridEl ? bentoGridEl.querySelectorAll('.bento-card') : [];
        cards.forEach(function (c) { c.classList.add('is-flipped', 'is-revealed-text'); });
        // Dock 直接显示（逐项已完成，正常高度）
        if (dockOuter) { dockOuter.classList.add('is-rising', 'is-settled'); }
        // 挂坠直接物理态可见（初始化物理引擎，否则 canvas 空白、绳子消失）
        if (lanyardWidget) lanyardWidget.classList.add('is-physics-ready');
        if (!lanyardPhys) initLanyardPhysics();
        if (lanyardPhys) lanyardPhys.start();
        body.dataset.homeReady = '1';
        played = true;
        try { localStorage.setItem('raiderIntroPlayed', '1'); } catch (_) {}
        return;
      }
      // 首次：停留 intro 阶段，预初始化物理
      initLanyardPhysics();
    }
    boot();

    // 暴露给 goHome() 使用
    window.__raiderIntro = {
      ensureHome: function () {
        if (body.dataset.homeStage === 'intro' && played) return;
        if (body.dataset.homeStage === 'intro') runSequence();
      },
      isPlayed: function () { return played; },
      stopPhysics: function () { if (lanyardPhys) lanyardPhys.stop(); },
      startPhysics: function () { if (lanyardPhys) lanyardPhys.start(); }
    };
  })();

  function getWheelItems() { return stepWheel ? stepWheel.querySelectorAll('.step-wheel-item') : []; }

  function updateWheel(activeIndex) {
    var items = getWheelItems();
    var fontSize = 3;
    var spacing = 1.4;
    var curve = 1;
    var tilt = 6;
    var rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    var rowHeight = fontSize * spacing * rootFontSize;
    var tiltRad = tilt * Math.PI / 180;
    var radius = tiltRad > 0.0005 ? rowHeight / tiltRad : 0;
    items.forEach(function(item, i) {
      item.classList.remove('is-active','is-near','is-far','is-hidden');
      var dist = i - activeIndex;
      var angle = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, dist * tiltRad));
      var y = radius ? radius * Math.sin(angle) : dist * rowHeight;
      var x = radius ? -radius * (1 - Math.cos(angle)) * curve : 0;
      item.style.setProperty('--wheel-y', y.toFixed(2) + 'px');
      item.style.setProperty('--wheel-x', x.toFixed(2) + 'px');
      item.style.setProperty('--wheel-rot', (angle * 180 / Math.PI).toFixed(2) + 'deg');
      if (dist === 0) item.classList.add('is-active');
      else if (Math.abs(dist) === 1) item.classList.add('is-near');
      else item.classList.add('is-far');
    });
  }

  function showPanelOnly(stepId) {
    if (!builderWrap) return;
    builderWrap.querySelectorAll('.step-panel').forEach(function(p) { p.style.display = 'none'; });
    var target = document.getElementById(stepId);
    if (target) {
      target.style.display = '';
      target.classList.remove('is-entering');
      void target.offsetWidth;
      target.classList.add('is-entering');
      var sequenceItems = target.querySelectorAll('.treasure-group, .plugin-group, .skill-slot, .weapon-item, .pack-card-3d, .effect-chip');
      sequenceItems.forEach(function(item, index) {
        item.classList.remove('sequence-enter-item');
        item.style.setProperty('--sequence-delay', Math.min(index * 72, 720) + 'ms');
        void item.offsetWidth;
        item.classList.add('sequence-enter-item');
      });
      window.setTimeout(function() {
        target.classList.remove('is-entering');
        sequenceItems.forEach(function(item) { item.classList.remove('sequence-enter-item'); item.style.removeProperty('--sequence-delay'); });
      }, 1500);
    }
  }

  function openBuilder(stepId) {
    if (!builderWrap) return;
    if (lanyardWidget) lanyardWidget.hidden = true;
    if (window.__raiderIntro) window.__raiderIntro.stopPhysics();
    showPanelOnly(stepId);
    if (homeHero) homeHero.style.display = 'none';
    if (bentoGrid) bentoGrid.style.display = 'none';
    builderWrap.style.display = '';
    window.scrollTo(0, 0);
    syncWheelIndex(stepId);
  }

  function goHome() {
    if (builderWrap) { builderWrap.style.display = 'none'; }
    if (homeHero) { homeHero.style.display = ''; }
    if (bentoGrid) { bentoGrid.style.display = ''; }
    // 与片头系统协调
    var intro = window.__raiderIntro;
    if (intro) {
      if (document.body.dataset.homeStage === 'home' && intro.isPlayed()) {
        // 已是 home 态：直接恢复挂坠（物理或 CSS 摆动）
        if (lanyardWidget) lanyardWidget.hidden = false;
        intro.startPhysics();
      } else {
        intro.ensureHome();  // intro 态则补完片头
      }
    } else if (lanyardWidget) {
      lanyardWidget.hidden = false;
    }
    syncWheelIndex('home');
    window.scrollTo(0, 0);
  }

  // Card clicks on homepage
  if (bentoGrid) {
    bentoGrid.querySelectorAll('[href^="#step-"]').forEach(function(link) {
      link.addEventListener('click', function(e) {
        e.preventDefault();
        openBuilder(link.getAttribute('href').slice(1));
      });
    });
  }

  // Wheel: click + scroll to navigate
  var wheelItems = stepWheel ? stepWheel.querySelectorAll('.step-wheel-item') : [];
  var wheelIdx = 0;
  function syncWheelIndex(stepId) {
    wheelItems.forEach(function(item, i) { if (item.dataset.step === stepId) wheelIdx = i; });
    if (stepWheel) stepWheel.dataset.currentIndex = String(wheelIdx);
    updateWheel(wheelIdx);
  }
  if (stepWheel) {
    wheelItems.forEach(function(item, i) {
      item.addEventListener('click', function() {
        wheelIdx = i;
        var step = item.dataset.step;
        if (step === 'home') goHome();
        else if (step === 'step-final') { window.location.href = 'showcase.html'; }
        else openBuilder(step);
      });
    });
    stepWheel.addEventListener('wheel', function(e) {
      e.preventDefault();
      var storedIndex = Number.parseInt(stepWheel.dataset.currentIndex, 10);
      if (Number.isFinite(storedIndex)) wheelIdx = storedIndex;
      if (e.deltaY > 0) wheelIdx = Math.min(wheelItems.length - 1, wheelIdx + 1);
      else wheelIdx = Math.max(0, wheelIdx - 1);
      stepWheel.dataset.currentIndex = String(wheelIdx);
      updateWheel(wheelIdx);
      var step = wheelItems[wheelIdx].dataset.step;
      if (step === 'home') goHome();
      else if (step === 'step-final') { return; }  // 滚到最终展示不自动跳转，需点击
      else openBuilder(step);
    }, { passive: false });
    updateWheel(0);
  }
    // Next-step buttons with magnet effect
    if (builderWrap) builderWrap.querySelectorAll('.specular-btn').forEach(btn => {
      btn.addEventListener('pointermove', event => {
        if (event.pointerType === 'touch') return;
        const rect = btn.getBoundingClientRect();
        const dx = (event.clientX - (rect.left + rect.width / 2)) / 8;
        const dy = (event.clientY - (rect.top + rect.height / 2)) / 8;
        btn.style.setProperty('--magnet-x', `${dx.toFixed(1)}px`);
        btn.style.setProperty('--magnet-y', `${dy.toFixed(1)}px`);
      });
      btn.addEventListener('pointerleave', () => {
        btn.style.setProperty('--magnet-x', '0px');
        btn.style.setProperty('--magnet-y', '0px');
      });
      btn.addEventListener('click', () => {
        const nextId = btn.dataset.next;
        if (nextId === 'home') {
          builderWrap.style.display = 'none';
          if (homeHero) homeHero.style.display = '';
          bentoGrid.style.display = '';
        } else {
          showPanelOnly(nextId);
          // Sync wheel
        syncWheelIndex(nextId);
        }
        window.scrollTo(0, 0);
      });
    });
})();
