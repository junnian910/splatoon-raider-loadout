(function () {
  'use strict';

  const { seed, storage, rules, el, ui } = window.Raider;
  let catalog = storage.loadCatalog();
  let editingId = null;
  let pendingImage = '';
  let pendingBatchImage = '';
  const $ = (selector) => document.querySelector(selector);
  const refs = {
    dialog: $('#pluginDialog'), form: $('#pluginForm'), rows: $('#pluginRows'),
    search: $('#pluginSearch'), skillFilter: $('#skillFilter'), qualityFilter: $('#qualityFilter'), statusFilter: $('#statusFilter'), toast: $('#toast'), qualityPicker: $('#qualityPicker'),
    batchDialog: $('#batchPluginDialog'), batchForm: $('#batchPluginForm'), batchSkill: $('#batchPluginSkill'), batchName: $('#batchPluginName'), batchEffect: $('#batchPluginEffect'), batchImage: $('#batchPluginImage'), batchImagePreview: $('#batchPluginImagePreview'), batchRows: $('#batchRows'), batchRowCount: $('#batchRowCount'), applyBatchRowCount: $('#applyBatchRowCount'),
    batchPresetOne60: $('#batchPresetOne60'), batchPresetOne100: $('#batchPresetOne100'), batchPresetTwo60: $('#batchPresetTwo60'), batchPresetTwo100: $('#batchPresetTwo100'),
    exportCatalog: $('#exportCatalog'), importCatalog: $('#importCatalog'), catalogFileInput: $('#catalogFileInput'),
    fields: { skill: $('#pluginSkill'), name: $('#pluginName'), cost: $('#pluginCost'), quality: $('#pluginQuality'), effect: $('#pluginEffect'), bonus: $('#pluginBonus'), image: $('#pluginImage'), imagePreview: $('#pluginImagePreview') }
  };

  const qualityLabels = { white: '白色', green: '绿色', purple: '紫色', gold: '金色', rainbow: '彩色' };
  const presets = {
    one60: [['rainbow', 6], ['rainbow', 2], ['gold', 5], ['gold', 3], ['gold', 1], ['purple', 6], ['purple', 4], ['purple', 3], ['green', 8], ['green', 6], ['green', 4], ['green', 2], ['white', 7], ['white', 5], ['white', 3], ['white', 1]],
    two60: [['rainbow', 6], ['gold', 4], ['purple', 6], ['purple', 3], ['green', 6], ['green', 3], ['white', 5], ['white', 2]],
    one100: [['rainbow', 6], ['rainbow', 2], ['gold', 5], ['gold', 3], ['gold', 1], ['purple', 6], ['purple', 4], ['purple', 3], ['green', 8], ['green', 6], ['green', 4], ['green', 2], ['white', 7], ['white', 5], ['white', 3], ['white', 1]],
    two100: [['rainbow', 6], ['gold', 4], ['purple', 6], ['purple', 3], ['green', 6], ['green', 3], ['white', 5], ['white', 2]]
  };
  const bonuses = {
    one60: ['+60%', '+23%', '+36%', '+24%', '+12%', '+35%', '+25%', '+15%', '+32%', '+24%', '+16%', '+8%', '+21%', '+15%', '+9%', '+3%'],
    two60: ['+60%', '+30%', '+35%', '+20%', '+24%', '+12%', '+15%', '+6%'],
    one100: ['+100%', '+38%', '+60%', '+40%', '+20%', '+58%', '+42%', '+25%', '+53%', '+40%', '+27%', '+13%', '+35%', '+25%', '+15%', '+5%'],
    two100: ['+100%', '+50%', '+60%', '+33%', '+40%', '+20%', '+25%', '+10%']
  };

  function normalizeBonusText(value) {
    const text = String(value ?? '').trim();
    if (!text) return '';
    return /^\+?\d+(?:\.\d+)?%?$/.test(text) ? `+${text.replace(/^\+/, '').replace(/%$/, '')}%` : text;
  }
  function notify(message) { refs.toast.textContent = message; refs.toast.hidden = false; clearTimeout(notify.timer); notify.timer = setTimeout(() => { refs.toast.hidden = true; }, 2600); }
  function save() { storage.saveCatalog(catalog); }
  function skillName(id) { return rules.skillById(catalog, id)?.name || '未知配件'; }
  function qualityKey(value) { return Object.keys(seed.qualityBorders).find((key) => seed.qualityBorders[key] === value) || 'white'; }
  function qualityOptions(selected = 'white') { return Object.keys(seed.qualityBorders).map((key) => el('option', { value: key, text: qualityLabels[key], selected: key === selected })); }
  function preview(target, src) { target.replaceChildren(); if (src) target.append(el('img', { src, alt: '图片预览' })); else target.append(el('span', { text: '未选择图片' })); }
  function fileToDataUrl(file, callback) { if (!file) return; if (file.size > 5 * 1024 * 1024) return notify('图片不能超过 5MB。'); const reader = new FileReader(); reader.onload = () => callback(String(reader.result || '')); reader.readAsDataURL(file); }

  function renderFilters() {
    const current = refs.skillFilter.value || 'all';
    const options = [el('option', { value: 'all', text: '全部配件' }), ...catalog.skills.filter((skill) => !skill.deletedAt).map((skill) => el('option', { value: skill.id, text: skill.name }))];
    refs.skillFilter.replaceChildren(...options);
    refs.skillFilter.value = [...refs.skillFilter.options].some((option) => option.value === current) ? current : 'all';
    refs.fields.skill.replaceChildren(...catalog.skills.filter((skill) => !skill.deletedAt).map((skill) => el('option', { value: skill.id, text: skill.name })));
  }
  function renderRows() {
    const query = refs.search.value.trim().toLowerCase();
    const skill = refs.skillFilter.value, quality = refs.qualityFilter.value, status = refs.statusFilter.value;
    const rows = catalog.plugins.filter((plugin) => {
      const text = `${plugin.name || ''} ${plugin.effectText || ''} ${skillName(plugin.skillId)}`.toLowerCase();
      return (status === 'all' || (status === 'deleted' ? plugin.deletedAt : !plugin.deletedAt)) && (skill === 'all' || plugin.skillId === skill) && (quality === 'all' || plugin.quality === seed.qualityBorders[quality]) && (!query || text.includes(query));
    });
    $('#activeCount').textContent = String(catalog.plugins.filter((plugin) => !plugin.deletedAt).length);
    $('#resultCount').textContent = `${rows.length} 条记录`;
    refs.rows.replaceChildren(...rows.map((plugin) => {
      const actions = plugin.deletedAt ? el('button', { className: 'row-action', text: '恢复', onclick: () => { plugin.deletedAt = null; save(); renderRows(); } }) : el('div', { className: 'row-actions' }, [
        el('button', { className: 'row-action', text: '编辑', onclick: () => openEditor(plugin.id) }),
        el('button', { className: 'row-action', text: '删除', onclick: async () => { if (await ui.confirm(`确定要软删除“${plugin.name}”吗？`)) { plugin.deletedAt = new Date().toISOString(); save(); renderRows(); } } })
      ]);
      return el('tr', { className: plugin.deletedAt ? 'is-deleted' : '' }, [
        el('td', {}, plugin.image ? el('img', { className: 'asset-table', src: plugin.image, alt: plugin.name }) : el('span', { text: '—' })),
        el('td', { text: skillName(plugin.skillId) }), el('td', { text: plugin.name || '' }), el('td', {}, el('strong', { text: String(plugin.slotCost ?? 0) })),
        el('td', { text: qualityLabels[qualityKey(plugin.quality)] }), el('td', { text: plugin.effectText || '待补全' }), el('td', { text: plugin.bonusText || '待补全' }), el('td', {}, actions)
      ]);
    }));
  }
  function makeBatchRow(value = {}) {
    const row = el('div', { className: 'batch-row', dataset: { quality: value.quality || 'white' } }, [
      el('label', {}, [el('span', { text: '成本' }), el('input', { className: 'control batch-cost', type: 'number', min: '0', step: '1', required: true, value: String(value.cost ?? 0) })]),
      el('label', {}, [el('span', { text: '品质' }), el('select', { className: 'control batch-quality' }, qualityOptions(value.quality || 'white'))]),
      el('label', {}, [el('span', { text: '加成数字' }), el('input', { className: 'control batch-bonus', required: true, maxlength: '30', value: value.bonus || '', placeholder: '+60%' })]),
      el('button', { className: 'icon-button batch-remove', type: 'button', text: '删除行' })
    ]);
    const quality = row.querySelector('.batch-quality');
    quality.addEventListener('change', () => { row.dataset.quality = quality.value; });
    row.querySelector('.batch-remove').addEventListener('click', () => { if (refs.batchRows.children.length <= 1) return notify('至少保留一行。'); row.remove(); refs.batchRowCount.value = String(refs.batchRows.children.length); });
    return row;
  }
  function renderBatchRows(values) { const list = values.slice(0, 16); refs.batchRows.replaceChildren(...list.map(makeBatchRow)); refs.batchRowCount.value = String(Math.max(1, list.length)); }
  function openBatchEditor() { refs.batchForm.reset(); pendingBatchImage = ''; refs.batchSkill.replaceChildren(...catalog.skills.filter((skill) => !skill.deletedAt).map((skill) => el('option', { value: skill.id, text: skill.name }))); preview(refs.batchImagePreview, ''); renderBatchRows([{ cost: 0, quality: 'white', bonus: '' }, { cost: 0, quality: 'white', bonus: '' }]); refs.batchDialog.showModal(); }
  function openEditor(id) {
    editingId = id || null; refs.form.reset(); const plugin = catalog.plugins.find((item) => item.id === id); pendingImage = plugin?.image || '';
    refs.fields.skill.value = plugin?.skillId || catalog.skills.find((skill) => !skill.deletedAt)?.id || '';
    refs.fields.name.value = plugin?.name || ''; refs.fields.cost.value = plugin?.slotCost ?? 0; const quality = qualityKey(plugin?.quality); refs.fields.quality.value = quality;
    refs.qualityPicker.querySelectorAll('.quality-option').forEach((button) => button.classList.toggle('is-selected', button.dataset.quality === quality));
    refs.fields.effect.value = plugin?.effectText || ''; refs.fields.bonus.value = plugin?.bonusText || ''; preview(refs.fields.imagePreview, pendingImage); $('#pluginDialogTitle').textContent = plugin ? '编辑零件' : '添加零件'; refs.dialog.showModal();
  }
  function applyPreset(key) { renderBatchRows((presets[key] || []).map(([quality, cost], index) => ({ quality, cost, bonus: bonuses[key]?.[index] || '' }))); }

  refs.qualityPicker.addEventListener('click', (event) => { const button = event.target.closest('.quality-option'); if (!button) return; refs.fields.quality.value = button.dataset.quality; refs.qualityPicker.querySelectorAll('.quality-option').forEach((item) => item.classList.toggle('is-selected', item === button)); });
  refs.fields.image.addEventListener('change', () => fileToDataUrl(refs.fields.image.files?.[0], (src) => { pendingImage = src; preview(refs.fields.imagePreview, src); }));
  refs.batchImage.addEventListener('change', () => fileToDataUrl(refs.batchImage.files?.[0], (src) => { pendingBatchImage = src; preview(refs.batchImagePreview, src); }));
  refs.form.addEventListener('submit', (event) => { event.preventDefault(); const cost = Number(refs.fields.cost.value); if (!Number.isInteger(cost) || cost < 0) return notify('成本必须是非负整数。'); const plugin = editingId ? catalog.plugins.find((item) => item.id === editingId) : { id: `plugin-${crypto.randomUUID()}`, deletedAt: null }; Object.assign(plugin, { skillId: refs.fields.skill.value, name: refs.fields.name.value.trim(), slotCost: cost, quality: seed.qualityBorders[refs.fields.quality.value], effectText: refs.fields.effect.value.trim(), bonusText: normalizeBonusText(refs.fields.bonus.value), image: pendingImage }); if (!editingId) catalog.plugins.push(plugin); save(); refs.dialog.close(); renderFilters(); renderRows(); notify('零件已保存。'); });
  refs.batchForm.addEventListener('submit', (event) => { event.preventDefault(); const values = [...refs.batchRows.querySelectorAll('.batch-row')].map((row) => ({ cost: Number(row.querySelector('.batch-cost').value), quality: row.querySelector('.batch-quality').value, bonus: normalizeBonusText(row.querySelector('.batch-bonus').value) })); if (!refs.batchSkill.value || !refs.batchName.value.trim() || !refs.batchEffect.value.trim() || values.some((item) => !Number.isInteger(item.cost) || item.cost < 0 || !item.bonus)) return notify('请完整填写每一行。'); values.forEach((item) => catalog.plugins.push({ id: `plugin-${crypto.randomUUID()}`, deletedAt: null, skillId: refs.batchSkill.value, name: refs.batchName.value.trim(), effectText: refs.batchEffect.value.trim(), slotCost: item.cost, quality: seed.qualityBorders[item.quality], bonusText: item.bonus, image: pendingBatchImage })); save(); refs.batchDialog.close(); renderFilters(); renderRows(); notify(`已批量添加 ${values.length} 个零件。`); });
  refs.search.addEventListener('input', renderRows); [refs.skillFilter, refs.qualityFilter, refs.statusFilter].forEach((control) => control.addEventListener('change', renderRows));
  $('#addPlugin').addEventListener('click', () => openEditor()); $('#addPluginsBatch').addEventListener('click', openBatchEditor); refs.batchPresetOne60.addEventListener('click', () => applyPreset('one60')); refs.batchPresetOne100.addEventListener('click', () => applyPreset('one100')); refs.batchPresetTwo60.addEventListener('click', () => applyPreset('two60')); refs.batchPresetTwo100.addEventListener('click', () => applyPreset('two100'));
  refs.applyBatchRowCount.addEventListener('click', () => { const count = Math.max(1, Math.min(16, Number(refs.batchRowCount.value) || 1)); const old = [...refs.batchRows.querySelectorAll('.batch-row')].map((row) => ({ cost: row.querySelector('.batch-cost').value, quality: row.querySelector('.batch-quality').value, bonus: row.querySelector('.batch-bonus').value })); renderBatchRows(Array.from({ length: count }, (_, index) => old[index] || { cost: 0, quality: 'white', bonus: '' })); });
  refs.exportCatalog.addEventListener('click', () => { const url = URL.createObjectURL(new Blob([JSON.stringify(catalog, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'splatoon-raider-catalog-v5.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
  refs.importCatalog.addEventListener('click', () => refs.catalogFileInput.click()); refs.catalogFileInput.addEventListener('change', () => { const file = refs.catalogFileInput.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const imported = JSON.parse(reader.result); if (!Array.isArray(imported.plugins)) throw new Error('数据库文件格式不正确。'); imported.plugins.forEach((plugin) => { if (typeof plugin.bonusText === 'string') plugin.bonusText = normalizeBonusText(plugin.bonusText); }); catalog = { ...catalog, ...imported }; save(); renderFilters(); renderRows(); notify('数据库已导入。'); } catch (error) { notify(error.message || '导入失败。'); } }; reader.readAsText(file); refs.catalogFileInput.value = ''; });
  document.querySelectorAll('[data-close],[data-close-batch]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
  renderFilters(); renderRows();
})();
