(function () {
  'use strict';
  const { seed, storage, rules, el, ui } = window.Raider;
  let catalog = storage.loadCatalog();
  let editingId = null;
  let pendingImage = null;
  let pendingBatchImage = undefined;
  const $ = (s) => document.querySelector(s);

  const refs = {
    dialog: $('#pluginDialog'), form: $('#pluginForm'), rows: $('#pluginRows'),
    search: $('#pluginSearch'), skillFilter: $('#skillFilter'), qualityFilter: $('#qualityFilter'), statusFilter: $('#statusFilter'),
    toast: $('#toast'),
    previewBorder: $('#previewBorder'), previewPart: $('#previewPartImage'), previewPlace: $('#previewPlaceholder'), previewCost: $('#previewCostBadge'),
    qualityPicker: $('#qualityPicker'),
    batchDialog: $('#batchPluginDialog'), batchForm: $('#batchPluginForm'), batchSkill: $('#batchPluginSkill'), batchName: $('#batchPluginName'), batchEffect: $('#batchPluginEffect'), batchImage: $('#batchPluginImage'), batchRows: $('#batchRows'), addBatchRow: $('#addBatchRow'), exportCatalog: $('#exportCatalog'), importCatalog: $('#importCatalog'), catalogFileInput: $('#catalogFileInput'),
    fields: { skill: $('#pluginSkill'), name: $('#pluginName'), cost: $('#pluginCost'), quality: $('#pluginQuality'), effect: $('#pluginEffect'), bonus: $('#pluginBonus'), image: $('#pluginImage') }
  };

  function skillName(id) { return rules.skillById(catalog, id)?.name || '未知配件'; }
  function notify(m) {
    refs.toast.textContent = m; refs.toast.hidden = false; clearTimeout(notify.timer);
    notify.timer = setTimeout(() => { refs.toast.hidden = true; }, 2800);
  }
  function save() { storage.saveCatalog(catalog); }

  function qualityOptions(selected = 'white') {
    const labels = { white: '白色', green: '绿色', purple: '紫色', gold: '金色', rainbow: '彩色' };
    return Object.keys(seed.qualityBorders).map((key) => el('option', { value: key, text: labels[key], selected: key === selected }));
  }

  function addBatchRow(values = {}) {
    const row = el('div', { className: 'batch-row' }, [
      el('label', {}, [el('span', { text: '成本' }), el('input', { className: 'control batch-cost', type: 'number', min: '0', step: '1', required: true, value: String(values.cost ?? 0) })]),
      el('label', {}, [el('span', { text: '品质' }), el('select', { className: 'control batch-quality' }, qualityOptions(values.quality || 'white'))]),
      el('label', {}, [el('span', { text: '加成数字' }), el('input', { className: 'control batch-bonus', maxlength: '30', required: true, value: values.bonus || '', placeholder: '+60%' })]),
      el('button', { className: 'icon-button batch-remove', type: 'button', text: '移除', onclick: () => { if (refs.batchRows.children.length > 1) row.remove(); } })
    ]);
    refs.batchRows.append(row);
  }

  function openBatchEditor() {
    refs.batchForm.reset(); pendingBatchImage = undefined;
    refs.batchSkill.replaceChildren(...catalog.skills.filter((s) => !s.deletedAt).map((s) => el('option', { value: s.id, text: s.name })));
    refs.batchRows.replaceChildren(); addBatchRow(); addBatchRow(); refs.batchDialog.showModal();
  }

  function catalogPayload() { return { ...catalog, exportedAt: new Date().toISOString() }; }
  async function exportCatalogFile() {
    const json = JSON.stringify(catalogPayload(), null, 2);
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: 'splatoon-raider-catalog-v5.json', types: [{ description: 'JSON 数据库', accept: { 'application/json': ['.json'] } }] });
        const writable = await handle.createWritable(); await writable.write(json); await writable.close(); notify('数据库已保存到你选择的文件夹。'); return;
      } catch (error) { if (error?.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'splatoon-raider-catalog-v5.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify('数据库文件已下载，请移动到项目文件夹。');
  }

  function importCatalogFile(file) {
    if (!file) return;
    const reader = new FileReader(); reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result); const required = ['skills', 'categories', 'plugins', 'treasures', 'weaponTypes', 'weapons', 'weaponEffects'];
        if (parsed.version !== seed.version || required.some((key) => !Array.isArray(parsed[key]))) throw new Error('数据库版本或字段不匹配（需要 v5 JSON）。');
        catalog = { ...parsed, version: seed.version }; storage.saveCatalog(catalog); renderFilters(); renderRows(); notify('数据库已导入并写入浏览器缓存。');
      } catch (error) { notify(error.message || '数据库文件读取失败。'); }
    }; reader.readAsText(file);
  }

  function visual(plugin) {
    const f = el('span', { className: 'asset-frame asset-table' });
    if (plugin.image) f.append(el('img', { src: plugin.image, alt: '' }));
    else f.append(el('span', { className: 'asset-glyph', text: '零' }));
    return f;
  }

  function renderFilters() {
    const opts = [el('option', { value: 'all', text: '全部配件' }), ...catalog.skills.filter(s => !s.deletedAt).map(s => el('option', { value: s.id, text: s.name }))];
    refs.skillFilter.replaceChildren(...opts.map(o => o.cloneNode(true)));
    refs.fields.skill.replaceChildren(...opts.slice(1));
  }

  function renderRows() {
    const q = refs.search.value.trim().toLowerCase();
    const status = refs.statusFilter.value;
    const skill = refs.skillFilter.value;
    const quality = refs.qualityFilter.value;
    const rows = catalog.plugins.filter(p => {
      const txt = (p.name + ' ' + (p.effectText || '') + ' ' + skillName(p.skillId)).toLowerCase();
      const sm = status === 'all' || (status === 'deleted' ? p.deletedAt : !p.deletedAt);
      const qm = quality === 'all' || (p.quality || seed.qualityBorders.gold) === seed.qualityBorders[quality];
      return sm && qm && (skill === 'all' || p.skillId === skill) && (!q || txt.includes(q));
    });
    $('#activeCount').textContent = String(catalog.plugins.filter(p => !p.deletedAt).length);
    $('#resultCount').textContent = rows.length + ' 条记录';
    refs.rows.replaceChildren(...rows.map(p => {
      const act = p.deletedAt
        ? el('button', { className: 'row-action', text: '恢复', onclick: () => { p.deletedAt = null; save(); renderRows(); } })
        : el('div', { className: 'row-actions' }, [
          el('button', { className: 'row-action', text: '编辑', onclick: () => openEditor(p.id) }),
          el('button', { className: 'row-action', text: '删除', onclick: async () => { if (await ui.confirm('确定要软删除"' + p.name + '"吗？')) { p.deletedAt = new Date().toISOString(); save(); renderRows(); } } })
        ]);
      return el('tr', { className: p.deletedAt ? 'is-deleted' : '' }, [
        el('td', {}, visual(p)),
        el('td', { text: skillName(p.skillId) }),
        el('td', {}, el('strong', { text: String(p.slotCost) })),
        el('td', {}, el('img', { src: p.quality || seed.qualityBorders.gold, alt: '品质', className: 'quality-thumb' })),
        el('td', { text: p.effectText || '待补全' }),
        el('td', { text: p.bonusText || '待补全' }),
        el('td', {}, act)
      ]);
    }));
  }

  function updatePreview() {
    const qk = refs.fields.quality.value || 'gold';
    refs.previewBorder.src = seed.qualityBorders[qk];
    if (pendingImage !== undefined) {
      if (pendingImage) { refs.previewPart.src = pendingImage; refs.previewPart.style.display = ''; refs.previewPlace.style.display = 'none'; }
      else { refs.previewPart.src = ''; refs.previewPart.style.display = 'none'; refs.previewPlace.style.display = ''; }
    } else {
      const ex = editingId ? catalog.plugins.find(p => p.id === editingId)?.image : null;
      if (ex) { refs.previewPart.src = ex; refs.previewPart.style.display = ''; refs.previewPlace.style.display = 'none'; }
      else { refs.previewPart.src = ''; refs.previewPart.style.display = 'none'; refs.previewPlace.style.display = ''; }
    }
    refs.previewCost.textContent = refs.fields.cost.value || '0';
  }

  function openEditor(id) {
    editingId = id || null; pendingImage = undefined; refs.form.reset();
    const p = catalog.plugins.find(x => x.id === id);
    $('#pluginDialogTitle').textContent = p ? '编辑零件' : '添加零件';
    refs.fields.skill.value = p?.skillId || catalog.skills.find(s => !s.deletedAt)?.id || '';
    refs.fields.name.value = p?.name || '';
    refs.fields.cost.value = p?.slotCost ?? 0;
    const qv = p?.quality || 'white';
    const qk = typeof qv === 'string' && qv.includes('/') ? (Object.entries(seed.qualityBorders).find(([, v]) => v === qv) || ['white'])[0] : (seed.qualityBorders[qv] ? qv : 'white');
    refs.fields.quality.value = qk;
    refs.qualityPicker.querySelectorAll('.quality-option').forEach(b => b.classList.toggle('is-selected', b.dataset.quality === qk));
    refs.fields.effect.value = p?.effectText || '';
    refs.fields.bonus.value = p?.bonusText || '';
    updatePreview(); refs.dialog.showModal();
  }

  async function compressImage(file) {
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) throw new Error('请选择 5MB 以内的 PNG、JPG 或 WebP 图片。');
    const bmp = await createImageBitmap(file);
    const s = Math.min(512, Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = s; c.height = s;
    const ctx = c.getContext('2d'); ctx.clearRect(0, 0, s, s);
    const sc = Math.min(s / bmp.width, s / bmp.height);
    ctx.drawImage(bmp, (s - bmp.width * sc) / 2, (s - bmp.height * sc) / 2, bmp.width * sc, bmp.height * sc);
    bmp.close(); return c.toDataURL('image/webp', 0.82);
  }

  refs.fields.image.addEventListener('change', async () => {
    try { pendingImage = refs.fields.image.files[0] ? await compressImage(refs.fields.image.files[0]) : null; updatePreview(); }
    catch (e) { refs.fields.image.value = ''; notify(e.message); }
  });
  refs.qualityPicker.addEventListener('click', e => {
    const btn = e.target.closest('.quality-option'); if (!btn) return;
    refs.fields.quality.value = btn.dataset.quality;
    refs.qualityPicker.querySelectorAll('.quality-option').forEach(b => b.classList.remove('is-selected'));
    btn.classList.add('is-selected'); updatePreview();
  });
  refs.fields.cost.addEventListener('input', updatePreview);
  refs.fields.skill.addEventListener('change', updatePreview);
  refs.form.addEventListener('submit', e => {
    e.preventDefault();
    const c = Number(refs.fields.cost.value);
    if (!Number.isInteger(c) || c < 0) { notify('成本必须是非负整数。'); return; }
    const qk = refs.fields.quality.value;
    const rec = editingId ? catalog.plugins.find(p => p.id === editingId) : { id: 'plugin-' + crypto.randomUUID(), deletedAt: null };
    Object.assign(rec, { skillId: refs.fields.skill.value, name: refs.fields.name.value.trim(), slotCost: c, quality: seed.qualityBorders[qk], effectText: refs.fields.effect.value.trim(), bonusText: refs.fields.bonus.value.trim() });
    if (!editingId) catalog.plugins.push(rec);
    if (pendingImage !== undefined) rec.image = pendingImage || '';
    save(); refs.dialog.close(); renderRows(); notify('零件已保存。');
  });

  refs.batchImage.addEventListener('change', async () => {
    try { pendingBatchImage = refs.batchImage.files[0] ? await compressImage(refs.batchImage.files[0]) : null; }
    catch (e) { refs.batchImage.value = ''; notify(e.message); }
  });
  refs.batchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const rows = [...refs.batchRows.querySelectorAll('.batch-row')];
    if (!refs.batchSkill.value || !refs.batchName.value.trim() || !refs.batchEffect.value.trim()) { notify('请先填写批量共享字段。'); return; }
    const values = rows.map((row) => ({ cost: Number(row.querySelector('.batch-cost').value), quality: row.querySelector('.batch-quality').value, bonus: row.querySelector('.batch-bonus').value.trim() }));
    if (!values.length || values.some((item) => !Number.isInteger(item.cost) || item.cost < 0 || !item.bonus)) { notify('每一行都需要填写非负整数成本和加成数字。'); return; }
    const shared = { skillId: refs.batchSkill.value, name: refs.batchName.value.trim(), effectText: refs.batchEffect.value.trim(), image: pendingBatchImage || '' };
    values.forEach((item) => catalog.plugins.push({ id: 'plugin-' + crypto.randomUUID(), deletedAt: null, ...shared, slotCost: item.cost, quality: seed.qualityBorders[item.quality], bonusText: item.bonus }));
    save(); refs.batchDialog.close(); renderRows(); notify(`已批量添加 ${values.length} 个零件。`);
  });

  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => refs.dialog.close()));
  $('#addPlugin').addEventListener('click', () => openEditor());
  $('#addPluginsBatch').addEventListener('click', openBatchEditor);
  refs.addBatchRow.addEventListener('click', () => addBatchRow());
  document.querySelectorAll('[data-close-batch]').forEach((b) => b.addEventListener('click', () => refs.batchDialog.close()));
  refs.exportCatalog.addEventListener('click', exportCatalogFile);
  refs.importCatalog.addEventListener('click', () => refs.catalogFileInput.click());
  refs.catalogFileInput.addEventListener('change', () => { importCatalogFile(refs.catalogFileInput.files[0]); refs.catalogFileInput.value = ''; });
  [refs.search, refs.skillFilter, refs.qualityFilter, refs.statusFilter].forEach(c => c.addEventListener(c === refs.search ? 'input' : 'change', renderRows));
  renderFilters(); renderRows();
})();
