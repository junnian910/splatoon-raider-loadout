(function () {
  'use strict';

  const seed = window.RAIDER_SEED;
  const KEYS = {
    catalog: 'splatoon-raider-v5-catalog',
    build: 'splatoon-raider-v5-build'
  };
  let particlePaused = false;
  const particleController = {
    setPaused(value) {
      particlePaused = Boolean(value);
    }
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function safeParse(value, fallback) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function normalizeCatalog(raw) {
    const base = {
      version: seed.version,
      skills: clone(seed.skills),
      categories: clone(seed.categories),
      plugins: clone(seed.plugins),
      treasures: clone(seed.treasures),
      weaponTypes: clone(seed.weaponTypes),
      weapons: clone(seed.weapons),
      weaponEffects: clone(seed.weaponEffects)
    };
    if (!raw || raw.version !== seed.version) return base;
    Object.keys(base).forEach((key) => {
      if (Array.isArray(base[key]) && !Array.isArray(raw[key])) raw[key] = base[key];
    });
    // Migrate catalogs created before the screenshot import. Existing user
    // edits are preserved; only seed records with a new id are appended.
    if (Array.isArray(raw.plugins) && Array.isArray(seed.plugins)) {
      const knownIds = new Set(raw.plugins.map((plugin) => plugin?.id).filter(Boolean));
      seed.plugins.forEach((plugin) => {
        if (plugin?.id && !knownIds.has(plugin.id)) raw.plugins.push(clone(plugin));
      });
    }
    // Keep percentage bonuses consistent even when an older local catalog
    // stored shorthand values such as `23` or `+23`.
    if (Array.isArray(raw.plugins)) {
      raw.plugins.forEach((plugin) => {
        if (typeof plugin.image !== 'string') plugin.image = '';
        delete plugin.imageIncludesFrame;
        if (!plugin || typeof plugin.bonusText !== 'string') return;
        const value = plugin.bonusText.trim();
        if (/^\+?\d+(?:\.\d+)?%?$/.test(value)) {
          plugin.bonusText = `+${value.replace(/^\+/, '').replace(/%$/, '')}%`;
        }
      });
    }
    return raw;
  }

  function normalizeBuild(raw) {
    const build = clone(seed.defaultBuild);
    if (!raw || raw.version !== seed.version) return build;
    const normalizePackState = (value, packId) => {
      const state = {
        mainPackId: packId,
        skillIds: Array.isArray(value?.skillIds) ? value.skillIds.slice(0, 3) : [null, null, null],
        pluginsBySkillId: value?.pluginsBySkillId && typeof value.pluginsBySkillId === 'object'
          ? clone(value.pluginsBySkillId)
          : {},
        treasureIds: Array.isArray(value?.treasureIds) ? [...new Set(value.treasureIds)].slice(0, 5) : [],
        weaponId: typeof value?.weaponId === 'string' ? value.weaponId : null,
        weaponEffectIds: Array.isArray(value?.weaponEffectIds)
          ? [...new Set(value.weaponEffectIds)].slice(0, 3)
          : []
      };
      while (state.skillIds.length < 3) state.skillIds.push(null);
      return state;
    };
    build.mainPackId = seed.packs.some((pack) => pack.id === raw.mainPackId) ? raw.mainPackId : null;
    build.packStates = {};
    seed.packs.forEach((pack) => {
      const legacyState = raw.mainPackId === pack.id ? raw : null;
      build.packStates[pack.id] = normalizePackState(raw.packStates?.[pack.id] || legacyState, pack.id);
    });
    if (build.mainPackId) Object.assign(build, build.packStates[build.mainPackId]);
    return build;
  }

  function flattenBuild(build) {
    const normalized = normalizeBuild(build);
    if (!normalized.mainPackId) return normalized;
    normalized.packStates[normalized.mainPackId] = {
      mainPackId: normalized.mainPackId,
      skillIds: normalized.skillIds.slice(),
      pluginsBySkillId: clone(normalized.pluginsBySkillId),
      treasureIds: normalized.treasureIds.slice(),
      weaponId: normalized.weaponId,
      weaponEffectIds: normalized.weaponEffectIds.slice()
    };
    return normalized;
  }

  const storage = {
    loadCatalog() {
      const catalog = normalizeCatalog(safeParse(localStorage.getItem(KEYS.catalog), null));
      if (catalog.version === seed.version) localStorage.setItem(KEYS.catalog, JSON.stringify(catalog));
      return catalog;
    },
    saveCatalog(catalog) {
      localStorage.setItem(KEYS.catalog, JSON.stringify(catalog));
    },
    loadBuild() {
      return normalizeBuild(safeParse(localStorage.getItem(KEYS.build), null));
    },
    saveBuild(build) {
      localStorage.setItem(KEYS.build, JSON.stringify(flattenBuild(build)));
    },
    resetBuild() {
      localStorage.removeItem(KEYS.build);
      return clone(seed.defaultBuild);
    }
  };

  function packById(id) {
    return seed.packs.find((pack) => pack.id === id) || null;
  }

  function skillById(catalog, id) {
    return catalog.skills.find((skill) => skill.id === id) || null;
  }

  function pluginById(catalog, id) {
    return catalog.plugins.find((plugin) => plugin.id === id) || null;
  }

  function treasureById(catalog, id) {
    return catalog.treasures.find((treasure) => treasure.id === id) || null;
  }

  function weaponTypeById(catalog, id) {
    return catalog.weaponTypes.find((wt) => wt.id === id) || null;
  }

  function validateSkills(build, catalog) {
    if (!build.mainPackId) return { valid: false, message: '请先选择一个主背包。' };
    const ids = build.skillIds.filter(Boolean);
    if (new Set(ids).size !== ids.length) return { valid: false, message: '同一个配件不能重复选择。' };
    if (ids.length !== 3) return { valid: false, message: `还需选择 ${3 - ids.length} 个配件。` };
    const skills = ids.map((id) => skillById(catalog, id)).filter(Boolean);
    if (skills.length !== 3) return { valid: false, message: '配置中包含已失效的配件。' };
    const mainCount = skills.filter((skill) => skill.packId === build.mainPackId).length;
    const crossPackId = packById(build.mainPackId).cross;
    const invalid = skills.find((skill) => skill.packId !== build.mainPackId && skill.packId !== crossPackId);
    if (invalid) return { valid: false, message: `${packById(build.mainPackId).name}背包不能携带${packById(invalid.packId).name}配件。` };
    if (mainCount < 2) return { valid: false, message: `至少选择 2 个${packById(build.mainPackId).name}配件。` };
    return { valid: true, message: '' };
  }

  function canSelectSkill(build, catalog, skillId, slotIndex) {
    const skill = skillById(catalog, skillId);
    if (!build.mainPackId) return { allowed: false, reason: '先选择主背包' };
    if (!skill || skill.deletedAt) return { allowed: false, reason: '配件不可用' };
    if (build.skillIds.some((id, index) => id === skillId && index !== slotIndex)) {
      return { allowed: false, reason: '已选择' };
    }
    const mainPack = packById(build.mainPackId);
    if (skill.packId !== mainPack.id && skill.packId !== mainPack.cross) {
      return { allowed: false, reason: '背包规则不允许' };
    }
    const projected = build.skillIds.slice();
    projected[slotIndex] = skillId;
    const projectedSkills = projected.filter(Boolean).map((id) => skillById(catalog, id)).filter(Boolean);
    const crossCount = projectedSkills.filter((item) => item.packId === mainPack.cross).length;
    return crossCount > 1
      ? { allowed: false, reason: '跨背包配件最多 1 个' }
      : { allowed: true, reason: '' };
  }

  function pluginTotal(build, catalog, skillId) {
    const ids = (build.pluginsBySkillId[skillId] || []).slice();
    return ids.reduce((sum, id) => sum + Number(pluginById(catalog, id)?.slotCost || 0), 0);
  }

  function canInstallPlugin(build, catalog, skillId, pluginId) {
    const plugin = pluginById(catalog, pluginId);
    if (!plugin || plugin.deletedAt || plugin.skillId !== skillId) {
      return { allowed: false, reason: '这个零件不可用于当前配件。' };
    }
    const installed = build.pluginsBySkillId[skillId] || [];
    if (installed.includes(pluginId)) return { allowed: true, remove: true, total: pluginTotal(build, catalog, skillId) };
    if (installed.length >= 9) return { allowed: false, reason: '插槽已满：每个配件最多安装 9 个零件。' };
    const total = pluginTotal(build, catalog, skillId) + Number(plugin.slotCost || 0);
    if (total > 40) return { allowed: false, reason: `无法安装：零件成本将达到 ${total}/40。` };
    return { allowed: true, total };
  }

  function canInstallTreasure(build, catalog, treasureId) {
    const treasure = treasureById(catalog, treasureId);
    if (!treasure || treasure.deletedAt) return { allowed: false, reason: '这个秘宝当前不可用。' };
    if (build.treasureIds.includes(treasureId)) return { allowed: true, remove: true };
    if (!build.mainPackId) return { allowed: false, reason: '请先选择主背包。' };
    if (build.treasureIds.length >= 5) return { allowed: false, reason: '秘宝槽已满：最多安装 5 个秘宝。' };
    if (treasure.scope === 'common' || treasure.packId === build.mainPackId) return { allowed: true };
    const crossPackId = packById(build.mainPackId).cross;
    if (treasure.packId !== crossPackId) return { allowed: false, reason: '当前背包不能携带这个秘宝。' };
    const hasCross = build.treasureIds
      .map((id) => treasureById(catalog, id))
      .some((item) => item?.scope === 'pack' && item.packId !== build.mainPackId);
    return hasCross
      ? { allowed: false, reason: '跨背包秘宝最多安装 1 个。' }
      : { allowed: true };
  }

  function validateBuild(build, catalog) {
    const problems = [];
    const skillsResult = validateSkills(build, catalog);
    if (!skillsResult.valid) problems.push(skillsResult.message);
    build.skillIds.filter(Boolean).forEach((skillId) => {
      const ids = build.pluginsBySkillId[skillId] || [];
      if (ids.length > 9) problems.push(`${skillById(catalog, skillId)?.name || '配件'}的零件超过 9 个。`);
      if (pluginTotal(build, catalog, skillId) > 40) problems.push(`${skillById(catalog, skillId)?.name || '配件'}的零件超过 40 成本。`);
      const pluginRecords = ids.map((id) => pluginById(catalog, id));
      if (pluginRecords.some((plugin) => !plugin || plugin.skillId !== skillId)) problems.push('配置中包含不属于当前配件的零件。');
    });
    if (build.treasureIds.length > 5 || new Set(build.treasureIds).size !== build.treasureIds.length) {
      problems.push('秘宝必须不重复且最多 5 个。');
    }
    const treasures = build.treasureIds.map((id) => treasureById(catalog, id));
    if (treasures.some((item) => !item)) problems.push('配置中包含未知秘宝。');
    if (treasures.length && !build.mainPackId) problems.push('安装秘宝前必须选择主背包。');
    if (build.mainPackId) {
      const crossPackId = packById(build.mainPackId).cross;
      const invalidTreasure = treasures.find((item) => item && item.scope === 'pack' && item.packId !== build.mainPackId && item.packId !== crossPackId);
      const crossCount = treasures.filter((item) => item && item.scope === 'pack' && item.packId === crossPackId).length;
      if (invalidTreasure) problems.push('配置中包含当前背包不能携带的秘宝。');
      if (crossCount > 1) problems.push('跨背包秘宝最多安装 1 个。');
    }
    if (build.weaponEffectIds.length > 3 || new Set(build.weaponEffectIds).size !== build.weaponEffectIds.length) {
      problems.push('武器效果必须不重复且最多 3 个。');
    }
    if (build.weaponEffectIds.length && !build.weaponId) problems.push('选择武器效果前必须选择武器。');
    if (build.weaponId && !catalog.weapons.some((item) => item.id === build.weaponId)) problems.push('配置中包含未知武器。');
    if (build.weaponEffectIds.some((id) => !catalog.weaponEffects.some((item) => item.id === id))) problems.push('配置中包含未知武器效果。');
    return { valid: problems.length === 0, problems };
  }

  function makeSnapshot(build, catalog) {
    const skillIds = build.skillIds.filter(Boolean);
    const pluginIds = skillIds.flatMap((id) => build.pluginsBySkillId[id] || []);
    return {
      app: 'Splatoon Raider',
      version: seed.version,
      exportedAt: new Date().toISOString(),
      build: clone(build),
      definitions: {
        packs: clone(seed.packs),
        skills: clone(catalog.skills.filter((item) => skillIds.includes(item.id))),
        plugins: clone(catalog.plugins.filter((item) => pluginIds.includes(item.id))),
        treasures: clone(catalog.treasures.filter((item) => build.treasureIds.includes(item.id))),
        weaponTypes: clone((catalog.weaponTypes || []).filter((item) => item.id === (catalog.weapons.find((w) => w.id === build.weaponId)?.typeId))),
        weapons: clone(catalog.weapons.filter((item) => item.id === build.weaponId)),
        weaponEffects: clone(catalog.weaponEffects.filter((item) => build.weaponEffectIds.includes(item.id)))
      }
    };
  }

  function importSnapshot(value) {
    const serialized = JSON.stringify(value);
    if (serialized.length > 8 * 1024 * 1024) throw new Error('配置文件过大，最大支持 8MB。');
    if (!value || value.app !== 'Splatoon Raider' || value.version !== seed.version || !value.build || !value.definitions) {
      throw new Error('这不是有效的 Splatoon Raider v5 配置。');
    }
    const catalog = storage.loadCatalog();
    ['skills', 'plugins', 'treasures', 'weaponTypes', 'weapons', 'weaponEffects'].forEach((key) => {
      const incoming = Array.isArray(value.definitions[key]) ? value.definitions[key] : [];
      incoming.forEach((item) => {
        const index = catalog[key].findIndex((entry) => entry.id === item.id);
        if (index >= 0) catalog[key][index] = item;
        else catalog[key].push(item);
      });
    });
    const build = normalizeBuild(value.build);
    const validation = validateBuild(build, catalog);
    if (!validation.valid) throw new Error(validation.problems[0]);
    storage.saveCatalog(catalog);
    storage.saveBuild(build);
    return { catalog, build };
  }

  function encodeShare(snapshot) {
    const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }

  function decodeShare(code) {
    const binary = atob(code.trim());
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function el(tag, options = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(options).forEach(([key, value]) => {
      if (key === 'className') node.className = String(value);
      else if (key === 'text') node.textContent = String(value);
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key === 'attrs') Object.entries(value).forEach(([name, entry]) => {
        if (entry !== null && entry !== undefined && entry !== false) node.setAttribute(name, entry === true ? '' : String(entry));
      });
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === 'style') node.setAttribute('style', String(value));
      else node[key] = value;
    });
    function flatten(arr) { return arr.reduce((a,b) => a.concat(Array.isArray(b) ? flatten(b) : b), []); }
    const list = flatten(Array.isArray(children) ? children : [children]);
    list.filter((child) => child !== null && child !== undefined).forEach((child) => {
      if (child.nodeType) node.append(child);
      else node.append(document.createTextNode(String(child)));
    });
    return node;
  }

  // Shared confirm dialog
  let confirmResolve = null;
  const ui = {
    confirm(message) {
      return new Promise((resolve) => {
        confirmResolve = resolve;
        const dialog = document.querySelector('#confirmDialog');
        const msg = dialog ? dialog.querySelector('#confirmMessage') : null;
        if (msg) msg.textContent = message;
        if (dialog) dialog.showModal();
        else resolve(window.confirm(message));
      });
    }
  };
  // Auto-wire confirm buttons and menu toggle on any page
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelector('#confirmYes')?.addEventListener('click', () => {
        document.querySelector('#confirmDialog')?.close();
        if (confirmResolve) { confirmResolve(true); confirmResolve = null; }
      });
      document.querySelector('#confirmNo')?.addEventListener('click', () => {
        document.querySelector('#confirmDialog')?.close();
        if (confirmResolve) { confirmResolve(false); confirmResolve = null; }
      });
      // Menu toggle
      const mt = document.querySelector('#menuToggle');
      const mp = document.querySelector('#menuPanel');
      const mo = document.querySelector('#menuOverlay');
      if (mt && mp && mo) {
        const open = () => { mt.classList.add('is-open'); mp.classList.add('is-open'); mo.classList.add('is-open'); };
        const close = () => { mt.classList.remove('is-open'); mp.classList.remove('is-open'); mo.classList.remove('is-open'); };
        mt.addEventListener('click', () => { mt.classList.contains('is-open') ? close() : open(); });
        mo.addEventListener('click', close);
      }
      // Canvas particle background
      const canvas = document.createElement('canvas');
      canvas.id = 'particleBg';
      Object.assign(canvas.style, { position:'fixed', inset:'0', zIndex:'-2', pointerEvents:'none' });
      document.body.prepend(canvas);
      const ctx = canvas.getContext('2d');
      const COLOR = '#d8a52a';
      const COUNT = window.matchMedia('(max-width: 720px)').matches ? 90 : 180;
      const SPEED = 0.2;
      let W, H, mouseX = 0, mouseY = 0, elapsed = 0, lastT = performance.now();
      const particles = [];
      function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = Math.floor(W * dpr);
        canvas.height = Math.floor(H * dpr);
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      resize();
      window.addEventListener('resize', resize);
      // Keep pointer sampling lightweight; the canvas reads these values once per frame.
      let pointerPending = null;
      document.addEventListener('mousemove', e => { pointerPending = e; }, { passive: true });
      for (let i = 0; i < COUNT; i++) {
        particles.push({
          x: (Math.random() - 0.5) * W * 3,
          y: (Math.random() - 0.5) * H * 3,
          z: Math.random() * 600 - 100,
          ox: (Math.random() - 0.5) * 0.8,
          oy: (Math.random() - 0.5) * 0.8,
          oz: (Math.random() - 0.5) * 0.8,
          phase: Math.random() * Math.PI * 2
        });
      }
      let rafId = 0;
      let lastPaint = 0;
      function draw(ts) {
        if (document.hidden || particlePaused) { ctx.clearRect(0, 0, W, H); rafId = 0; return; }
        if (ts - lastPaint < 16) { rafId = requestAnimationFrame(draw); return; }
        lastPaint = ts;
        const dt = Math.min((ts - lastT) / 1000, 0.1);
        lastT = ts;
        elapsed += dt * SPEED;
        if (pointerPending) {
          mouseX = (pointerPending.clientX / W) * 2 - 1;
          mouseY = -(pointerPending.clientY / H) * 2 + 1;
          pointerPending = null;
        }
        ctx.clearRect(0, 0, W, H);
        const cx = W / 2 + mouseX * 80;
        const cy = H / 2 + mouseY * 80;
        ctx.fillStyle = COLOR;
        for (const p of particles) {
          const t = elapsed + p.phase;
          const px = p.x + Math.sin(t * 0.7 + p.ox) * 60;
          const py = p.y + Math.cos(t * 0.6 + p.oy) * 60;
          const pz = p.z + Math.sin(t * 0.5 + p.oz) * 200;
          const scale = 400 / (400 + pz);
          const sx = cx + (px - cx) * scale;
          const sy = cy + (py - cy) * scale;
          if (sx < -50 || sx > W + 50 || sy < -50 || sy > H + 50) continue;
          const size = Math.max(1.5, 6 * scale);
          const alpha = 0.22 * scale;
          ctx.beginPath();
          ctx.arc(sx, sy, size, 0, Math.PI * 2);
          ctx.globalAlpha = alpha;
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        rafId = requestAnimationFrame(draw);
      }
      const startParticles = () => { if (!rafId && !document.hidden && !particlePaused) rafId = requestAnimationFrame(draw); };
      particleController.setPaused = (value) => {
        particlePaused = Boolean(value);
        if (particlePaused) {
          if (rafId) cancelAnimationFrame(rafId);
          rafId = 0;
          ctx.clearRect(0, 0, W, H);
        } else {
          startParticles();
        }
      };
      document.addEventListener('visibilitychange', startParticles, { passive: true });
      startParticles();
    });
  }

  window.Raider = {
    seed,
    storage,
    rules: {
      packById,
      skillById,
      pluginById,
      treasureById,
      weaponTypeById,
      validateSkills,
      validateBuild,
      canSelectSkill,
      canInstallPlugin,
      canInstallTreasure,
      pluginTotal
    },
    share: { makeSnapshot, importSnapshot, encodeShare, decodeShare },
    el,
    clone,
    ui,
    particles: particleController
  };
})();
