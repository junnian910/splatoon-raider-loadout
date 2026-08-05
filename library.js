(function () {
  'use strict';

  const { seed, storage, rules, el, ui } = window.Raider;
  const $ = (selector) => document.querySelector(selector);
  let catalog = storage.loadCatalog();
  // 共享库模式：列表数据从后端 /api/plugins 拉取（所有访客看同一份审核通过的正式库）
  let sharedPlugins = null; // null=尚未加载，加载后为数组
  let editingId = null;
  let pendingImage;
  let pendingBatchImage;
  const selectedIds = new Set();
  const refs = {
    dialog: $('#pluginDialog'), form: $('#pluginForm'), rows: $('#pluginRows'),
    search: $('#pluginSearch'), skillFilter: $('#skillFilter'), nameFilter: $('#pluginNameFilter'), qualityFilter: $('#qualityFilter'), statusFilter: $('#statusFilter'), selectAll: $('#selectAllPlugins'),
    toast: $('#toast'), qualityPicker: $('#qualityPicker'), previewBorder: $('#previewBorder'), previewPart: $('#previewPartImage'), previewPlaceholder: $('#previewPlaceholder'), previewCost: $('#previewCostBadge'),
    batchDialog: $('#batchPluginDialog'), batchForm: $('#batchPluginForm'), batchSkill: $('#batchPluginSkill'), batchName: $('#batchPluginName'), batchEffect: $('#batchPluginEffect'), batchImage: $('#batchPluginImage'), batchRows: $('#batchRows'), batchRowCount: $('#batchRowCount'), applyBatchRowCount: $('#applyBatchRowCount'),
    presetOne60: $('#batchPresetOne60'), presetOne100: $('#batchPresetOne100'), presetTwo60: $('#batchPresetTwo60'), presetTwo100: $('#batchPresetTwo100'),
    bulkDialog: $('#bulkEditPluginDialog'), bulkForm: $('#bulkEditPluginForm'), bulkRows: $('#bulkEditRows'), bulkSkill: $('#bulkEditSkill'), bulkName: $('#bulkEditName'), bulkEffect: $('#bulkEditEffect'),
    detailsDialog: $('#pluginDetailsDialog'), detailsTitle: $('#pluginDetailsTitle'), detailsBody: $('#pluginDetailsBody'),
    cropDialog: $('#cropDialog'), cropViewport: $('#cropViewport'), cropImage: $('#cropImage'), cropConfirm: $('#cropConfirm'), cropClose: $('#cropClose'),
    fields: { skill: $('#pluginSkill'), name: $('#pluginName'), cost: $('#pluginCost'), quality: $('#pluginQuality'), effect: $('#pluginEffect'), bonus: $('#pluginBonus'), image: $('#pluginImage') }
  };
  const qualityLabels = { white: '白色', green: '绿色', purple: '紫色', gold: '金色', rainbow: '彩色' };
  const qualityStarCount = { white: 1, green: 2, purple: 3, gold: 4, rainbow: 5 };
  const historyActionLabels = { create: '创建', update: '修改', delete: '删除' };
  const historyFieldLabels = { skillId: '所属配件', name: '零件名称', slotCost: '成本', quality: '品质', effectText: '效果说明', bonusText: '加成数字', image: '零件图片', deleted: '删除' };
  const presetRows = {
    one60: [['rainbow',6],['rainbow',2],['gold',5],['gold',3],['gold',1],['purple',6],['purple',4],['purple',3],['green',8],['green',6],['green',4],['green',2],['white',7],['white',5],['white',3],['white',1]],
    two60: [['rainbow',6],['gold',4],['purple',6],['purple',3],['green',6],['green',3],['white',5],['white',2]],
    one100: [['rainbow',6],['rainbow',2],['gold',5],['gold',3],['gold',1],['purple',6],['purple',4],['purple',3],['green',8],['green',6],['green',4],['green',2],['white',7],['white',5],['white',3],['white',1]],
    two100: [['rainbow',6],['gold',4],['purple',6],['purple',3],['green',6],['green',3],['white',5],['white',2]]
  };
  const presetBonuses = {
    one60: ['+60%','+23%','+36%','+24%','+12%','+35%','+25%','+15%','+32%','+24%','+16%','+8%','+21%','+15%','+9%','+3%'],
    two60: ['+60%','+30%','+35%','+20%','+24%','+12%','+15%','+6%'],
    one100: ['+100%','+38%','+60%','+40%','+20%','+58%','+42%','+25%','+53%','+40%','+27%','+13%','+35%','+25%','+15%','+5%'],
    two100: ['+100%','+50%','+60%','+33%','+40%','+20%','+25%','+10%']
  };

  const normalizeBonus = (value) => {
    const text = String(value ?? '').trim();
    return /^\+?\d+(?:\.\d+)?%?$/.test(text) ? `+${text.replace(/^\+/, '').replace(/%$/, '')}%` : text;
  };
  const save = () => storage.saveCatalog(catalog);
  // 列表数据来源：共享库加载后用它，否则回退本地 catalog（用于批量编辑等本地操作）
  const listPlugins = () => (sharedPlugins ? sharedPlugins : catalog.plugins);
  const skillName = (id) => rules.skillById(catalog, id)?.name || '未知配件';
  const qualityKey = (value) => Object.keys(seed.qualityBorders).find((key) => seed.qualityBorders[key] === value) || 'white';
  const qualityOptions = (selected = 'white') => Object.keys(seed.qualityBorders).map((key) => el('option', { value: key, text: qualityLabels[key], selected: key === selected }));
  function notify(message) { refs.toast.textContent = message; refs.toast.hidden = false; clearTimeout(notify.timer); notify.timer = setTimeout(() => { refs.toast.hidden = true; }, 2600); }
  function setPerformanceMode(enabled) { document.body.classList.toggle('plugin-editor-open', enabled); window.Raider.particles?.setPaused?.(enabled); }

  // —— 在线模式工具：昵称、接口请求、共享列表刷新 ——
  function getNickname() {
    let nickname = localStorage.getItem('raider.nickname');
    if (!nickname) {
      nickname = (window.prompt('请输入你的昵称（用于记录提交与修改历史，可留空）：') || '').trim().slice(0, 30);
      if (nickname) localStorage.setItem('raider.nickname', nickname);
    }
    return nickname || '匿名';
  }
  async function apiCall(url, payload) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '操作失败，请重试。');
    return data;
  }
  async function reloadShared() {
    try {
      const res = await fetch('/api/plugins');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.plugins)) {
        sharedPlugins = data.plugins;
        syncFilters();
        renderRows();
      }
    } catch { /* 网络异常时保持当前列表 */ }
  }

  // —— 品质五角星（white=1★ … rainbow=5★）——
  function qualityStars(value) {
    const key = qualityKey(value);
    const count = qualityStarCount[key] || 1;
    return el('span', { className: `quality-stars quality-stars--${key}`, attrs: { title: qualityLabels[key] } }, [
      el('span', { className: 'quality-stars-full', text: '★'.repeat(count) }),
      el('span', { className: 'quality-stars-empty', text: '☆'.repeat(5 - count) }),
    ]);
  }

  function formatTime(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch { return iso; }
  }
  function historySummary(changesJson) {
    try {
      const changes = JSON.parse(changesJson || '{}');
      const entries = Object.entries(changes).filter(([, value]) => value && typeof value === 'object');
      if (!entries.length) return '内容更新';
      return entries.map(([key, value]) => {
        const label = historyFieldLabels[key] || key;
        if (key === 'image' || key === 'deleted') return label;
        const from = key === 'quality' ? (qualityLabels[value.from] || value.from || '—') : (value.from == null ? '—' : String(value.from));
        const to = key === 'quality' ? (qualityLabels[value.to] || value.to || '—') : (value.to == null ? '—' : String(value.to));
        return `${label}：${from} → ${to}`;
      }).join('；');
    } catch { return '内容更新'; }
  }

  function syncFilters() {
    const previousSkill = refs.skillFilter.value || 'all';
    const previousName = refs.nameFilter.value || 'all';
    const skills = catalog.skills.filter((skill) => !skill.deletedAt);
    refs.skillFilter.replaceChildren(el('option', { value: 'all', text: '全部配件' }), ...skills.map((skill) => el('option', { value: skill.id, text: skill.name })));
    refs.skillFilter.value = [...refs.skillFilter.options].some((option) => option.value === previousSkill) ? previousSkill : 'all';
    refs.fields.skill.replaceChildren(...skills.map((skill) => el('option', { value: skill.id, text: skill.name })));
    const names = [...new Set(listPlugins().filter((plugin) => !plugin.deletedAt && plugin.name && (refs.skillFilter.value === 'all' || plugin.skillId === refs.skillFilter.value)).map((plugin) => plugin.name))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
    refs.nameFilter.replaceChildren(el('option', { value: 'all', text: '全部名称' }), ...names.map((name) => el('option', { value: name, text: name })));
    refs.nameFilter.value = names.includes(previousName) ? previousName : 'all';
  }
  function updateSelection() {
    refs.rows.querySelectorAll('.plugin-select').forEach((input) => input.checked ? selectedIds.add(input.value) : selectedIds.delete(input.value));
    const visible = [...refs.rows.querySelectorAll('.plugin-select:not(:disabled)')];
    refs.selectAll.checked = visible.length > 0 && visible.every((input) => input.checked);
    const edit = $('#bulkEditPlugins'); const remove = $('#bulkDeletePlugins');
    if (edit) edit.disabled = selectedIds.size === 0;
    if (remove) remove.disabled = selectedIds.size === 0;
  }
  function renderRows() {
    const query = refs.search.value.trim().toLowerCase(); const skill = refs.skillFilter.value; const name = refs.nameFilter.value; const quality = refs.qualityFilter.value; const status = refs.statusFilter.value;
    const filtered = listPlugins().filter((plugin) => {
      const text = `${plugin.name || ''} ${plugin.effectText || ''} ${skillName(plugin.skillId)}`.toLowerCase();
      return (status === 'all' || (status === 'deleted' ? plugin.deletedAt : !plugin.deletedAt)) && (skill === 'all' || plugin.skillId === skill) && (name === 'all' || plugin.name === name) && (quality === 'all' || plugin.quality === seed.qualityBorders[quality]) && (!query || text.includes(query));
    });
    $('#activeCount').textContent = String(listPlugins().filter((plugin) => !plugin.deletedAt).length); $('#resultCount').textContent = `${filtered.length} 条记录`;
    refs.rows.replaceChildren(...filtered.map((plugin) => {
      const action = plugin.deletedAt ? el('button', { className: 'row-action', text: '恢复', onclick: () => { plugin.deletedAt = null; save(); renderRows(); } }) : el('div', { className: 'row-actions' }, [el('button', { className: 'row-action', text: '编辑', onclick: () => openEditor(plugin.id) }), el('button', { className: 'row-action', text: '删除', onclick: () => removePlugin(plugin) }), el('button', { className: 'row-action', text: '详情', onclick: () => openDetails(plugin.id) })]);
      const visual = plugin.image ? el('img', { className: 'asset-table', src: plugin.image, alt: plugin.name }) : el('span', { className: 'asset-glyph', text: '零' });
      return el('tr', { className: plugin.deletedAt ? 'is-deleted' : '' }, [el('td', {}, el('input', { className: 'plugin-select', type: 'checkbox', value: plugin.id, checked: selectedIds.has(plugin.id), disabled: Boolean(plugin.deletedAt), onchange: updateSelection })), el('td', {}, visual), el('td', { text: skillName(plugin.skillId) }), el('td', {}, el('strong', { text: String(plugin.slotCost ?? 0) })), el('td', { text: plugin.name || '' }), el('td', {}, el('div', { className: 'quality-cell' }, [el('img', { className: 'quality-thumb', src: plugin.quality || seed.qualityBorders.white, alt: qualityLabels[qualityKey(plugin.quality)] }), qualityStars(plugin.quality)])), el('td', { className: 'plugin-bonus-cell', text: plugin.bonusText || '—' }), el('td', {}, action)]);
    }));
    updateSelection();
  }
  async function removePlugin(plugin) {
    if (!(await ui.confirm(`确定要删除“${plugin.name}”吗？${sharedPlugins ? '提交后需管理员审核通过才会删除。' : ''}`))) return;
    if (sharedPlugins) {
      try {
        await apiCall('/api/plugins/delete', { id: plugin.id, deletedBy: getNickname() });
        notify('删除请求已提交，等待管理员审核。');
        reloadShared();
      } catch (error) { notify(error.message); }
    } else {
      plugin.deletedAt = new Date().toISOString();
      save();
      renderRows();
    }
  }
  function updatePreview() {
    const existing = editingId ? listPlugins().find((plugin) => plugin.id === editingId)?.image : '';
    const image = pendingImage === undefined ? existing : pendingImage;
    refs.previewBorder.src = seed.qualityBorders[refs.fields.quality.value] || seed.qualityBorders.white;
    refs.previewCost.textContent = refs.fields.cost.value || '0'; refs.previewPart.src = image || ''; refs.previewPart.style.display = image ? '' : 'none'; refs.previewPlaceholder.style.display = image ? 'none' : '';
  }

  // —— 图片裁剪工具（手机选头像同款：双指捏合缩放 + 拖动平移，辅助取景框）——
  const CROP_SIZE = 512;
  const crop = { img: null, scale: 1, centerX: 0, centerY: 0, onDone: null };
  const cropPointers = new Map();
  let cropDragStart = null;
  let cropPinchStart = null;
  function cropViewportSize() { return refs.cropViewport.clientWidth || 280; }
  function cropBaseScale() {
    const vp = cropViewportSize();
    return Math.max(vp / crop.img.naturalWidth, vp / crop.img.naturalHeight);
  }
  function cropDispScale() { return cropBaseScale() * crop.scale; }
  function cropApply() {
    if (!crop.img) return;
    const vp = cropViewportSize();
    const disp = cropDispScale();
    const nw = crop.img.naturalWidth;
    const nh = crop.img.naturalHeight;
    const half = vp / 2 / disp;
    crop.centerX = Math.min(nw - half, Math.max(half, crop.centerX));
    crop.centerY = Math.min(nh - half, Math.max(half, crop.centerY));
    refs.cropImage.style.width = `${nw * disp}px`;
    refs.cropImage.style.height = `${nh * disp}px`;
    refs.cropImage.style.left = `${vp / 2 - crop.centerX * disp}px`;
    refs.cropImage.style.top = `${vp / 2 - crop.centerY * disp}px`;
  }
  function cropSetZoom(scale) { crop.scale = Math.min(6, Math.max(1, scale)); cropApply(); }
  function cropOpen(dataUrl, onDone) {
    crop.onDone = onDone;
    crop.scale = 1;
    crop.centerX = 0;
    crop.centerY = 0;
    const loader = new Image();
    loader.onload = () => {
      crop.img = loader;
      crop.centerX = loader.naturalWidth / 2;
      crop.centerY = loader.naturalHeight / 2;
      refs.cropDialog.showModal();
      refs.cropImage.onload = cropApply;
      refs.cropImage.src = loader.src;
    };
    loader.src = dataUrl;
  }
  function cropPinchReset() {
    const points = [...cropPointers.values()];
    if (points.length >= 2) {
      cropPinchStart = {
        dist: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
        scale: crop.scale,
        midX: (points[0].x + points[1].x) / 2,
        midY: (points[0].y + points[1].y) / 2,
        centerX: crop.centerX,
        centerY: crop.centerY,
      };
      cropDragStart = null;
    } else {
      cropPinchStart = null;
      cropDragStart = points.length === 1 ? { x: points[0].x, y: points[0].y, centerX: crop.centerX, centerY: crop.centerY } : null;
    }
  }
  refs.cropViewport.addEventListener('pointerdown', (event) => {
    cropPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    refs.cropViewport.setPointerCapture(event.pointerId);
    event.preventDefault();
    cropPinchReset();
  });
  refs.cropViewport.addEventListener('pointermove', (event) => {
    if (!cropPointers.has(event.pointerId)) return;
    cropPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (cropPinchStart && cropPointers.size >= 2) {
      const points = [...cropPointers.values()];
      const dist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const midX = (points[0].x + points[1].x) / 2;
      const midY = (points[0].y + points[1].y) / 2;
      const vp = cropViewportSize();
      const base = cropBaseScale();
      const newScale = Math.min(6, Math.max(1, cropPinchStart.dist ? cropPinchStart.scale * (dist / cropPinchStart.dist) : 1));
      const oldDisp = base * cropPinchStart.scale;
      const newDisp = base * newScale;
      // 以两指中点为锚：缩放后该点下的图像像素保持不动
      const imgX = cropPinchStart.centerX + (midX - vp / 2) / oldDisp;
      const imgY = cropPinchStart.centerY + (midY - vp / 2) / oldDisp;
      crop.scale = newScale;
      crop.centerX = imgX - (midX - vp / 2) / newDisp;
      crop.centerY = imgY - (midY - vp / 2) / newDisp;
      cropApply();
    } else if (cropDragStart && cropPointers.size === 1) {
      const disp = cropDispScale();
      crop.centerX = cropDragStart.centerX - (event.clientX - cropDragStart.x) / disp;
      crop.centerY = cropDragStart.centerY - (event.clientY - cropDragStart.y) / disp;
      cropApply();
    }
  });
  function cropEndPointer(event) {
    cropPointers.delete(event.pointerId);
    cropPinchReset();
  }
  refs.cropViewport.addEventListener('pointerup', cropEndPointer);
  refs.cropViewport.addEventListener('pointercancel', cropEndPointer);
  refs.cropViewport.addEventListener('wheel', (event) => {
    event.preventDefault();
    cropSetZoom(crop.scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15));
  }, { passive: false });
  refs.cropConfirm.addEventListener('click', () => {
    if (!crop.img) return;
    const vp = cropViewportSize();
    const disp = cropDispScale();
    const sx = crop.centerX - vp / 2 / disp;
    const sy = crop.centerY - vp / 2 / disp;
    const side = vp / disp;
    const canvas = document.createElement('canvas');
    canvas.width = CROP_SIZE;
    canvas.height = CROP_SIZE;
    canvas.getContext('2d').drawImage(crop.img, sx, sy, side, side, 0, 0, CROP_SIZE, CROP_SIZE);
    const done = crop.onDone;
    crop.img = null;
    crop.onDone = null;
    refs.cropDialog.close();
    done?.(canvas.toDataURL('image/webp', .82));
  });
  refs.cropClose.addEventListener('click', () => refs.cropDialog.close());
  refs.cropDialog.addEventListener('close', () => {
    if (crop.onDone) {
      const done = crop.onDone;
      crop.img = null;
      crop.onDone = null;
      done(null);
    }
  });

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  async function onPickImage(file) {
    if (!file) return null;
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) throw new Error('请选择 5MB 以内的 PNG、JPG 或 WebP 图片。');
    const dataUrl = await readFileAsDataURL(file);
    return new Promise((resolve) => cropOpen(dataUrl, resolve));
  }

  function openEditor(id) {
    editingId = id || null; pendingImage = undefined; refs.form.reset(); const plugin = listPlugins().find((item) => item.id === id); const quality = qualityKey(plugin?.quality);
    $('#pluginDialogTitle').textContent = plugin ? '编辑零件' : '添加零件'; refs.fields.skill.value = plugin?.skillId || catalog.skills.find((skill) => !skill.deletedAt)?.id || ''; refs.fields.name.value = plugin?.name || ''; refs.fields.cost.value = plugin?.slotCost ?? 0; refs.fields.quality.value = quality; refs.fields.effect.value = plugin?.effectText || ''; refs.fields.bonus.value = plugin?.bonusText || '';
    refs.qualityPicker.querySelectorAll('.quality-option').forEach((button) => button.classList.toggle('is-selected', button.dataset.quality === quality)); updatePreview(); setPerformanceMode(true); refs.dialog.showModal();
  }
  function createBatchRow(value = {}) {
    const row = el('div', { className: 'batch-row', dataset: { quality: value.quality || 'white' } }, [el('label', {}, [el('span', { text: '成本' }), el('input', { className: 'control batch-cost', type: 'number', min: '0', step: '1', required: true, value: String(value.cost ?? 0) })]), el('label', {}, [el('span', { text: '品质' }), el('select', { className: 'control batch-quality' }, qualityOptions(value.quality || 'white'))]), el('label', {}, [el('span', { text: '加成数字' }), el('input', { className: 'control batch-bonus', required: true, value: value.bonus || '', placeholder: '+60%' })]), el('button', { className: 'button button-quiet batch-remove', type: 'button', text: '移除' })]);
    const quality = row.querySelector('.batch-quality'); quality.addEventListener('change', () => { row.dataset.quality = quality.value; }); row.querySelector('.batch-remove').addEventListener('click', () => { if (refs.batchRows.children.length === 1) return notify('至少保留一行。'); row.remove(); refs.batchRowCount.value = String(refs.batchRows.children.length); }); return row;
  }
  function batchValues() { return [...refs.batchRows.querySelectorAll('.batch-row')].map((row) => ({ cost: row.querySelector('.batch-cost').value, quality: row.querySelector('.batch-quality').value, bonus: row.querySelector('.batch-bonus').value })); }
  function renderBatchRows(values) { refs.batchRows.replaceChildren(...values.slice(0, 16).map(createBatchRow)); refs.batchRowCount.value = String(Math.max(1, values.length)); }
  function openBatch() { refs.batchForm.reset(); pendingBatchImage = undefined; refs.batchSkill.replaceChildren(...catalog.skills.filter((skill) => !skill.deletedAt).map((skill) => el('option', { value: skill.id, text: skill.name }))); renderBatchRows([{ cost: 0, quality: 'white', bonus: '' }, { cost: 0, quality: 'white', bonus: '' }]); setPerformanceMode(true); refs.batchDialog.showModal(); }
  function openBulk() {
    const targets = listPlugins().filter((plugin) => selectedIds.has(plugin.id) && !plugin.deletedAt); if (!targets.length) return notify('请先勾选零件。'); refs.bulkForm.reset(); refs.bulkSkill.replaceChildren(...catalog.skills.filter((skill) => !skill.deletedAt).map((skill) => el('option', { value: skill.id, text: skill.name }))); refs.bulkSkill.value = targets[0].skillId;
    refs.bulkRows.replaceChildren(...targets.map((plugin) => el('div', { className: 'batch-row', dataset: { pluginId: plugin.id } }, [el('strong', { text: plugin.name }), el('label', {}, [el('span', { text: '成本' }), el('input', { className: 'control bulk-cost', type: 'number', min: '0', value: String(plugin.slotCost) })]), el('label', {}, [el('span', { text: '品质' }), el('select', { className: 'control bulk-quality' }, qualityOptions(qualityKey(plugin.quality)))]), el('label', {}, [el('span', { text: '加成' }), el('input', { className: 'control bulk-bonus', value: plugin.bonusText || '' })])]))); setPerformanceMode(true); refs.bulkDialog.showModal();
  }
  // —— 详情：当前信息 + 修改历史 ——
  async function openDetails(id) {
    const plugin = listPlugins().find((item) => item.id === id);
    refs.detailsTitle.textContent = plugin ? `详情 · ${plugin.name}` : '零件详情';
    refs.detailsBody.replaceChildren(el('p', { className: 'details-loading', text: '加载中…' }));
    refs.detailsDialog.showModal();
    try {
      const res = await fetch(`/api/plugins/history?pluginId=${encodeURIComponent(id)}`);
      const data = await res.json().catch(() => ({}));
      const history = Array.isArray(data.history) ? data.history : [];
      const head = plugin ? el('div', { className: 'details-head' }, [
        el('img', { className: 'details-thumb', src: plugin.image || '', alt: '', attrs: plugin.image ? {} : { hidden: '' } }),
        el('div', {}, [
          el('strong', { text: plugin.name }),
          el('small', { text: `${skillName(plugin.skillId)} · 成本 ${plugin.slotCost ?? 0} · ${qualityLabels[qualityKey(plugin.quality)] || ''} · ${plugin.bonusText || '—'}` }),
          el('p', { text: plugin.effectText || '' }),
        ]),
      ]) : null;
      if (!history.length) {
        refs.detailsBody.replaceChildren(head, el('p', { className: 'details-loading', text: '暂无历史记录。' }));
        return;
      }
      const list = el('ul', { className: 'details-list' }, history.map((item) => el('li', {}, [
        el('div', { className: 'details-item-head' }, [
          el('span', { className: `action-badge action-badge--${item.action}`, text: historyActionLabels[item.action] || item.action }),
          el('strong', { text: item.changedBy || '匿名' }),
          el('time', { text: formatTime(item.createdAt) }),
        ]),
        el('p', { text: historySummary(item.changes) }),
      ])));
      refs.detailsBody.replaceChildren(head, list);
    } catch {
      refs.detailsBody.replaceChildren(el('p', { className: 'details-loading', text: '网络错误，历史加载失败。' }));
    }
  }

  refs.qualityPicker.addEventListener('click', (event) => { const button = event.target.closest('.quality-option'); if (!button) return; refs.fields.quality.value = button.dataset.quality; refs.qualityPicker.querySelectorAll('.quality-option').forEach((item) => item.classList.toggle('is-selected', item === button)); updatePreview(); });
  refs.fields.cost.addEventListener('input', updatePreview);   refs.fields.image.addEventListener('change', async () => {
    try {
      const cropped = await onPickImage(refs.fields.image.files[0]);
      if (cropped) { pendingImage = cropped; updatePreview(); notify('图片已裁剪。'); }
    } catch (error) { refs.fields.image.value = ''; notify(error.message); }
  });
  refs.batchImage.addEventListener('change', async () => {
    try {
      const cropped = await onPickImage(refs.batchImage.files[0]);
      if (cropped) { pendingBatchImage = cropped; notify('图片已裁剪。'); }
    } catch (error) { refs.batchImage.value = ''; notify(error.message); }
  });
  refs.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const cost = Number(refs.fields.cost.value);
    if (!Number.isInteger(cost) || cost < 0) return notify('成本必须是非负整数。');
    const existingImage = editingId ? listPlugins().find((item) => item.id === editingId)?.image || '' : '';
    // 构造待提交的零件对象（与后端 validatePlugin 字段对齐）
    const payload = {
      skillId: refs.fields.skill.value,
      name: refs.fields.name.value.trim(),
      slotCost: cost,
      quality: refs.fields.quality.value, // 枚举 key: white/green/purple/gold/rainbow
      effectText: refs.fields.effect.value.trim(),
      bonusText: normalizeBonus(refs.fields.bonus.value),
      image: pendingImage === undefined ? existingImage : (pendingImage || ''),
    };
    const editingShared = Boolean(editingId) && Boolean(sharedPlugins);
    refs.dialog.close();
    notify('正在提交…');
    try {
      if (editingShared) {
        await apiCall('/api/plugins/update', { ...payload, id: editingId, editedBy: getNickname() });
        notify('修改已提交，等待管理员审核通过后生效。');
      } else if (editingId) {
        const plugin = catalog.plugins.find((item) => item.id === editingId);
        if (plugin) Object.assign(plugin, payload);
        save();
        renderRows();
        notify('零件已保存。');
      } else {
        const res = await fetch('/api/plugins/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, submittedBy: getNickname() }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { notify(data.error || '提交失败，请稍后重试。'); return; }
        notify('已提交！等待管理员审核通过后会显示在零件库。');
      }
      setPerformanceMode(false);
    } catch (err) {
      notify(err.message || '网络错误，提交失败。');
      setPerformanceMode(false);
    }
  });
  refs.batchForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = batchValues().map((row) => ({ cost: Number(row.cost), quality: row.quality, bonus: normalizeBonus(row.bonus) }));
    if (!refs.batchSkill.value || !refs.batchName.value.trim() || !refs.batchEffect.value.trim() || values.some((row) => !Number.isInteger(row.cost) || row.cost < 0 || !row.bonus)) return notify('请完整填写每一行。');
    const common = { skillId: refs.batchSkill.value, name: refs.batchName.value.trim(), effectText: refs.batchEffect.value.trim(), image: pendingBatchImage || '' };
    if (sharedPlugins) {
      try {
        const nickname = getNickname();
        for (const row of values) await apiCall('/api/plugins/submit', { ...common, slotCost: row.cost, quality: row.quality, bonusText: row.bonus, submittedBy: nickname });
        refs.batchDialog.close();
        notify(`已提交 ${values.length} 条，等待管理员审核。`);
      } catch (error) { notify(error.message); }
    } else {
      values.forEach((row) => catalog.plugins.push({ id: `plugin-${crypto.randomUUID()}`, deletedAt: null, skillId: common.skillId, name: common.name, effectText: common.effectText, image: common.image, slotCost: row.cost, quality: seed.qualityBorders[row.quality], bonusText: row.bonus }));
      save(); refs.batchDialog.close(); syncFilters(); renderRows();
    }
  });
  refs.bulkForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const targets = listPlugins().filter((plugin) => selectedIds.has(plugin.id) && !plugin.deletedAt);
    const rows = [...refs.bulkRows.querySelectorAll('.batch-row')];
    if (targets.length !== rows.length) return;
    for (const row of rows) {
      const cost = Number(row.querySelector('.bulk-cost').value);
      if (!Number.isInteger(cost) || cost < 0 || !row.querySelector('.bulk-bonus').value.trim()) return notify('每一行都需要填写成本和加成。');
    }
    const apply = (plugin, row) => {
      plugin.skillId = refs.bulkSkill.value || plugin.skillId;
      if (refs.bulkName.value.trim()) plugin.name = refs.bulkName.value.trim();
      if (refs.bulkEffect.value.trim()) plugin.effectText = refs.bulkEffect.value.trim();
      plugin.slotCost = Number(row.querySelector('.bulk-cost').value);
      plugin.quality = seed.qualityBorders[row.querySelector('.bulk-quality').value];
      plugin.bonusText = normalizeBonus(row.querySelector('.bulk-bonus').value);
    };
    if (sharedPlugins) {
      try {
        const nickname = getNickname();
        for (const plugin of targets) {
          const row = rows.find((item) => item.dataset.pluginId === plugin.id);
          await apiCall('/api/plugins/update', {
            id: plugin.id,
            skillId: refs.bulkSkill.value || plugin.skillId,
            name: refs.bulkName.value.trim() || plugin.name,
            effectText: refs.bulkEffect.value.trim() || plugin.effectText,
            slotCost: Number(row.querySelector('.bulk-cost').value),
            quality: row.querySelector('.bulk-quality').value,
            bonusText: normalizeBonus(row.querySelector('.bulk-bonus').value),
            image: plugin.image,
            editedBy: nickname,
          });
        }
        selectedIds.clear();
        refs.bulkDialog.close();
        notify(`已提交 ${targets.length} 条修改，等待管理员审核。`);
        reloadShared();
      } catch (error) { notify(error.message); }
    } else {
      targets.forEach((plugin) => { const row = rows.find((item) => item.dataset.pluginId === plugin.id); apply(plugin, row); });
      selectedIds.clear(); save(); refs.bulkDialog.close(); syncFilters(); renderRows();
    }
  });

  $('#addPlugin').addEventListener('click', () => openEditor()); $('#addPluginsBatch').addEventListener('click', openBatch); refs.skillFilter.addEventListener('change', () => { syncFilters(); renderRows(); }); refs.nameFilter.addEventListener('change', renderRows); refs.qualityFilter.addEventListener('change', renderRows); refs.statusFilter.addEventListener('change', renderRows); refs.search.addEventListener('input', renderRows); refs.selectAll.addEventListener('change', () => { refs.rows.querySelectorAll('.plugin-select:not(:disabled)').forEach((input) => { input.checked = refs.selectAll.checked; if (input.checked) selectedIds.add(input.value); else selectedIds.delete(input.value); }); });
  refs.applyBatchRowCount.addEventListener('click', () => { const count = Math.max(1, Math.min(16, Number(refs.batchRowCount.value) || 1)); const values = batchValues(); renderBatchRows(Array.from({ length: count }, (_, index) => values[index] || { cost: 0, quality: 'white', bonus: '' })); });
  [['one60', refs.presetOne60], ['one100', refs.presetOne100], ['two60', refs.presetTwo60], ['two100', refs.presetTwo100]].forEach(([key, button]) => {
    button.addEventListener('click', () => {
      renderBatchRows(presetRows[key].map(([quality, cost], index) => ({
        quality,
        cost,
        bonus: presetBonuses[key][index]
      })));
    });
  });
  const actions = document.querySelector('.library-actions'); const editButton = el('button', { className: 'button button-quiet', id: 'bulkEditPlugins', type: 'button', text: '批量编辑', disabled: true }); const deleteButton = el('button', { className: 'button button-quiet', id: 'bulkDeletePlugins', type: 'button', text: '批量删除', disabled: true }); actions.append(editButton, deleteButton); editButton.addEventListener('click', openBulk); deleteButton.addEventListener('click', async () => {
    const targets = listPlugins().filter((plugin) => selectedIds.has(plugin.id) && !plugin.deletedAt);
    if (!targets.length) return;
    if (!(await ui.confirm(`确定要删除选中的 ${targets.length} 个零件吗？${sharedPlugins ? '提交后需管理员审核通过才会删除。' : ''}`))) return;
    if (sharedPlugins) {
      try {
        const nickname = getNickname();
        for (const plugin of targets) await apiCall('/api/plugins/delete', { id: plugin.id, deletedBy: nickname });
        selectedIds.clear();
        notify(`已提交 ${targets.length} 条删除，等待管理员审核。`);
        reloadShared();
      } catch (error) { notify(error.message); }
    } else {
      const now = new Date().toISOString();
      targets.forEach((plugin) => { plugin.deletedAt = now; });
      selectedIds.clear(); save(); renderRows();
    }
  });
  document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => refs.dialog.close())); document.querySelectorAll('[data-close-batch]').forEach((button) => button.addEventListener('click', () => refs.batchDialog.close())); document.querySelectorAll('[data-close-bulk-edit]').forEach((button) => button.addEventListener('click', () => refs.bulkDialog.close())); document.querySelectorAll('[data-close-details]').forEach((button) => button.addEventListener('click', () => refs.detailsDialog.close())); [refs.dialog, refs.batchDialog, refs.bulkDialog, refs.detailsDialog, refs.cropDialog].forEach((dialog) => dialog.addEventListener('close', () => setPerformanceMode(false)));
  syncFilters(); renderRows();

  // 加载共享正式库（所有访客看到的同一份审核通过零件），刷新列表
  (async () => {
    try {
      const res = await fetch('/api/plugins');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.plugins)) {
        sharedPlugins = data.plugins;
        syncFilters();
        renderRows();
      }
    } catch {
      /* 网络异常时保持本地 catalog 列表，不影响浏览 */
    }
  })();
})();
