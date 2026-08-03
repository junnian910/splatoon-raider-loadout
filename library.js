(function () {
  'use strict';

  const { seed, storage, rules, el, ui } = window.Raider;
  const $ = (selector) => document.querySelector(selector);
  let catalog = storage.loadCatalog();
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
    export: $('#exportCatalog'), import: $('#importCatalog'), importFile: $('#catalogFileInput'),
    fields: { skill: $('#pluginSkill'), name: $('#pluginName'), cost: $('#pluginCost'), quality: $('#pluginQuality'), effect: $('#pluginEffect'), bonus: $('#pluginBonus'), image: $('#pluginImage') }
  };
  const qualityLabels = { white: '白色', green: '绿色', purple: '紫色', gold: '金色', rainbow: '彩色' };
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
  const skillName = (id) => rules.skillById(catalog, id)?.name || '未知配件';
  const qualityKey = (value) => Object.keys(seed.qualityBorders).find((key) => seed.qualityBorders[key] === value) || 'white';
  const qualityOptions = (selected = 'white') => Object.keys(seed.qualityBorders).map((key) => el('option', { value: key, text: qualityLabels[key], selected: key === selected }));
  function notify(message) { refs.toast.textContent = message; refs.toast.hidden = false; clearTimeout(notify.timer); notify.timer = setTimeout(() => { refs.toast.hidden = true; }, 2600); }
  function setPerformanceMode(enabled) { document.body.classList.toggle('plugin-editor-open', enabled); window.Raider.particles?.setPaused?.(enabled); }

  function syncFilters() {
    const previousSkill = refs.skillFilter.value || 'all';
    const previousName = refs.nameFilter.value || 'all';
    const skills = catalog.skills.filter((skill) => !skill.deletedAt);
    refs.skillFilter.replaceChildren(el('option', { value: 'all', text: '全部配件' }), ...skills.map((skill) => el('option', { value: skill.id, text: skill.name })));
    refs.skillFilter.value = [...refs.skillFilter.options].some((option) => option.value === previousSkill) ? previousSkill : 'all';
    refs.fields.skill.replaceChildren(...skills.map((skill) => el('option', { value: skill.id, text: skill.name })));
    const names = [...new Set(catalog.plugins.filter((plugin) => !plugin.deletedAt && plugin.name && (refs.skillFilter.value === 'all' || plugin.skillId === refs.skillFilter.value)).map((plugin) => plugin.name))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
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
    const filtered = catalog.plugins.filter((plugin) => {
      const text = `${plugin.name || ''} ${plugin.effectText || ''} ${skillName(plugin.skillId)}`.toLowerCase();
      return (status === 'all' || (status === 'deleted' ? plugin.deletedAt : !plugin.deletedAt)) && (skill === 'all' || plugin.skillId === skill) && (name === 'all' || plugin.name === name) && (quality === 'all' || plugin.quality === seed.qualityBorders[quality]) && (!query || text.includes(query));
    });
    $('#activeCount').textContent = String(catalog.plugins.filter((plugin) => !plugin.deletedAt).length); $('#resultCount').textContent = `${filtered.length} 条记录`;
    refs.rows.replaceChildren(...filtered.map((plugin) => {
      const action = plugin.deletedAt ? el('button', { className: 'row-action', text: '恢复', onclick: () => { plugin.deletedAt = null; save(); renderRows(); } }) : el('div', { className: 'row-actions' }, [el('button', { className: 'row-action', text: '编辑', onclick: () => openEditor(plugin.id) }), el('button', { className: 'row-action', text: '删除', onclick: async () => { if (await ui.confirm(`确定要软删除“${plugin.name}”吗？`)) { plugin.deletedAt = new Date().toISOString(); save(); renderRows(); } } })]);
      const visual = plugin.image ? el('img', { className: 'asset-table', src: plugin.image, alt: plugin.name }) : el('span', { className: 'asset-glyph', text: '零' });
      return el('tr', { className: plugin.deletedAt ? 'is-deleted' : '' }, [el('td', {}, el('input', { className: 'plugin-select', type: 'checkbox', value: plugin.id, checked: selectedIds.has(plugin.id), disabled: Boolean(plugin.deletedAt), onchange: updateSelection })), el('td', {}, visual), el('td', { text: skillName(plugin.skillId) }), el('td', {}, el('strong', { text: String(plugin.slotCost ?? 0) })), el('td', { text: plugin.name || '' }), el('td', {}, el('img', { className: 'quality-thumb', src: plugin.quality || seed.qualityBorders.white, alt: qualityLabels[qualityKey(plugin.quality)] })), el('td', { className: 'plugin-bonus-cell', text: plugin.bonusText || '—' }), el('td', {}, action)]);
    }));
    updateSelection();
  }
  function updatePreview() {
    const existing = editingId ? catalog.plugins.find((plugin) => plugin.id === editingId)?.image : '';
    const image = pendingImage === undefined ? existing : pendingImage;
    refs.previewBorder.src = seed.qualityBorders[refs.fields.quality.value] || seed.qualityBorders.white;
    refs.previewCost.textContent = refs.fields.cost.value || '0'; refs.previewPart.src = image || ''; refs.previewPart.style.display = image ? '' : 'none'; refs.previewPlaceholder.style.display = image ? 'none' : '';
  }
  async function compressImage(file) {
    if (!file?.type.startsWith('image/') || file.size > 5 * 1024 * 1024) throw new Error('请选择 5MB 以内的 PNG、JPG 或 WebP 图片。');
    const bitmap = await createImageBitmap(file); const side = Math.min(512, Math.max(bitmap.width, bitmap.height)); const canvas = document.createElement('canvas'); canvas.width = side; canvas.height = side;
    const context = canvas.getContext('2d'); const scale = Math.min(side / bitmap.width, side / bitmap.height); context.drawImage(bitmap, (side - bitmap.width * scale) / 2, (side - bitmap.height * scale) / 2, bitmap.width * scale, bitmap.height * scale); bitmap.close(); return canvas.toDataURL('image/webp', .82);
  }
  function openEditor(id) {
    editingId = id || null; pendingImage = undefined; refs.form.reset(); const plugin = catalog.plugins.find((item) => item.id === id); const quality = qualityKey(plugin?.quality);
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
    const targets = catalog.plugins.filter((plugin) => selectedIds.has(plugin.id) && !plugin.deletedAt); if (!targets.length) return notify('请先勾选零件。'); refs.bulkForm.reset(); refs.bulkSkill.replaceChildren(...catalog.skills.filter((skill) => !skill.deletedAt).map((skill) => el('option', { value: skill.id, text: skill.name }))); refs.bulkSkill.value = targets[0].skillId;
    refs.bulkRows.replaceChildren(...targets.map((plugin) => el('div', { className: 'batch-row', dataset: { pluginId: plugin.id } }, [el('strong', { text: plugin.name }), el('label', {}, [el('span', { text: '成本' }), el('input', { className: 'control bulk-cost', type: 'number', min: '0', value: String(plugin.slotCost) })]), el('label', {}, [el('span', { text: '品质' }), el('select', { className: 'control bulk-quality' }, qualityOptions(qualityKey(plugin.quality)))]), el('label', {}, [el('span', { text: '加成' }), el('input', { className: 'control bulk-bonus', value: plugin.bonusText || '' })])]))); setPerformanceMode(true); refs.bulkDialog.showModal();
  }
  function exportCatalog() { const url = URL.createObjectURL(new Blob([JSON.stringify({ ...catalog, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'splatoon-raider-catalog-v5.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function importCatalog(file) { if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const data = JSON.parse(reader.result); if (!Array.isArray(data.plugins)) throw new Error('数据库文件格式不正确。'); data.plugins.forEach((plugin) => { if (typeof plugin.bonusText === 'string') plugin.bonusText = normalizeBonus(plugin.bonusText); if (typeof plugin.image !== 'string') plugin.image = ''; }); catalog = { ...catalog, ...data }; save(); syncFilters(); renderRows(); notify('数据库已导入。'); } catch (error) { notify(error.message || '导入失败。'); } }; reader.readAsText(file); }

  refs.qualityPicker.addEventListener('click', (event) => { const button = event.target.closest('.quality-option'); if (!button) return; refs.fields.quality.value = button.dataset.quality; refs.qualityPicker.querySelectorAll('.quality-option').forEach((item) => item.classList.toggle('is-selected', item === button)); updatePreview(); });
  refs.fields.cost.addEventListener('input', updatePreview); refs.fields.image.addEventListener('change', async () => { try { pendingImage = refs.fields.image.files[0] ? await compressImage(refs.fields.image.files[0]) : null; updatePreview(); } catch (error) { refs.fields.image.value = ''; notify(error.message); } });
  refs.batchImage.addEventListener('change', async () => { try { pendingBatchImage = refs.batchImage.files[0] ? await compressImage(refs.batchImage.files[0]) : null; } catch (error) { refs.batchImage.value = ''; notify(error.message); } });
  refs.form.addEventListener('submit', (event) => { event.preventDefault(); const cost = Number(refs.fields.cost.value); if (!Number.isInteger(cost) || cost < 0) return notify('成本必须是非负整数。'); const plugin = editingId ? catalog.plugins.find((item) => item.id === editingId) : { id: `plugin-${crypto.randomUUID()}`, deletedAt: null }; Object.assign(plugin, { skillId: refs.fields.skill.value, name: refs.fields.name.value.trim(), slotCost: cost, quality: seed.qualityBorders[refs.fields.quality.value], effectText: refs.fields.effect.value.trim(), bonusText: normalizeBonus(refs.fields.bonus.value) }); if (pendingImage !== undefined) plugin.image = pendingImage || ''; if (!editingId) catalog.plugins.push(plugin); save(); refs.dialog.close(); syncFilters(); renderRows(); });
  refs.batchForm.addEventListener('submit', (event) => { event.preventDefault(); const values = batchValues().map((row) => ({ cost: Number(row.cost), quality: row.quality, bonus: normalizeBonus(row.bonus) })); if (!refs.batchSkill.value || !refs.batchName.value.trim() || !refs.batchEffect.value.trim() || values.some((row) => !Number.isInteger(row.cost) || row.cost < 0 || !row.bonus)) return notify('请完整填写每一行。'); values.forEach((row) => catalog.plugins.push({ id: `plugin-${crypto.randomUUID()}`, deletedAt: null, skillId: refs.batchSkill.value, name: refs.batchName.value.trim(), effectText: refs.batchEffect.value.trim(), image: pendingBatchImage || '', slotCost: row.cost, quality: seed.qualityBorders[row.quality], bonusText: row.bonus })); save(); refs.batchDialog.close(); syncFilters(); renderRows(); });
  refs.bulkForm.addEventListener('submit', (event) => { event.preventDefault(); const targets = catalog.plugins.filter((plugin) => selectedIds.has(plugin.id) && !plugin.deletedAt); const rows = [...refs.bulkRows.querySelectorAll('.batch-row')]; if (targets.length !== rows.length) return; for (const row of rows) { const cost = Number(row.querySelector('.bulk-cost').value); if (!Number.isInteger(cost) || cost < 0 || !row.querySelector('.bulk-bonus').value.trim()) return notify('每一行都需要填写成本和加成。'); } targets.forEach((plugin) => { const row = rows.find((item) => item.dataset.pluginId === plugin.id); plugin.skillId = refs.bulkSkill.value || plugin.skillId; if (refs.bulkName.value.trim()) plugin.name = refs.bulkName.value.trim(); if (refs.bulkEffect.value.trim()) plugin.effectText = refs.bulkEffect.value.trim(); plugin.slotCost = Number(row.querySelector('.bulk-cost').value); plugin.quality = seed.qualityBorders[row.querySelector('.bulk-quality').value]; plugin.bonusText = normalizeBonus(row.querySelector('.bulk-bonus').value); }); selectedIds.clear(); save(); refs.bulkDialog.close(); syncFilters(); renderRows(); });

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
  const actions = document.querySelector('.library-actions'); const editButton = el('button', { className: 'button button-quiet', id: 'bulkEditPlugins', type: 'button', text: '批量编辑', disabled: true }); const deleteButton = el('button', { className: 'button button-quiet', id: 'bulkDeletePlugins', type: 'button', text: '批量删除', disabled: true }); actions.insertBefore(editButton, refs.export); actions.insertBefore(deleteButton, refs.export); editButton.addEventListener('click', openBulk); deleteButton.addEventListener('click', async () => { const targets = catalog.plugins.filter((plugin) => selectedIds.has(plugin.id) && !plugin.deletedAt); if (!targets.length || !(await ui.confirm(`确定要软删除选中的 ${targets.length} 个零件吗？`))) return; const now = new Date().toISOString(); targets.forEach((plugin) => { plugin.deletedAt = now; }); selectedIds.clear(); save(); renderRows(); });
  refs.export.addEventListener('click', exportCatalog); refs.import.addEventListener('click', () => refs.importFile.click()); refs.importFile.addEventListener('change', () => { importCatalog(refs.importFile.files[0]); refs.importFile.value = ''; }); document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => refs.dialog.close())); document.querySelectorAll('[data-close-batch]').forEach((button) => button.addEventListener('click', () => refs.batchDialog.close())); document.querySelectorAll('[data-close-bulk-edit]').forEach((button) => button.addEventListener('click', () => refs.bulkDialog.close())); [refs.dialog, refs.batchDialog, refs.bulkDialog].forEach((dialog) => dialog.addEventListener('close', () => setPerformanceMode(false)));
  syncFilters(); renderRows();
})();
