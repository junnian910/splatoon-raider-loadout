(function () {
  'use strict';
  const { seed, storage, rules, el, ui } = window.Raider;
  let catalog = storage.loadCatalog();
  let editingId = null;
  let pendingImage = null;
  const $ = (selector) => document.querySelector(selector);
  const refs = {
    dialog: $('#weaponDialog'), form: $('#weaponForm'), rows: $('#weaponRows'), search: $('#weaponSearch'),
    typeFilter: $('#typeFilter'), statusFilter: $('#statusFilter'), toast: $('#toast'), preview: $('#weaponImagePreview'),
    fields: { type: $('#weaponType'), name: $('#weaponName'), desc: $('#weaponDesc'), image: $('#weaponImage') }
  };

  function typeName(id) { return rules.weaponTypeById(catalog, id)?.name || '未知类型'; }
  function notify(message) {
    refs.toast.textContent = message; refs.toast.hidden = false; clearTimeout(notify.timer);
    notify.timer = setTimeout(() => { refs.toast.hidden = true; }, 2800);
  }
  function save() { storage.saveCatalog(catalog); }

  function visual(weapon) {
    const frame = el('span', { className: 'asset-frame asset-table' });
    if (weapon.image) frame.append(el('img', { src: weapon.image, alt: '' }));
    else frame.append(el('span', { className: 'asset-glyph', text: '武' }));
    return frame;
  }

  function renderFilters() {
    const options = [el('option', { value: 'all', text: '全部类型' }), ...catalog.weaponTypes.filter((t) => !t.deletedAt).map((t) => el('option', { value: t.id, text: t.name }))];
    refs.typeFilter.replaceChildren(...options.map((o) => o.cloneNode(true)));
    refs.fields.type.replaceChildren(...options.slice(1));
  }

  function renderRows() {
    const query = refs.search.value.trim().toLowerCase();
    const status = refs.statusFilter.value;
    const type = refs.typeFilter.value;
    const rows = catalog.weapons.filter((w) => {
      const text = `${w.name} ${w.description || ''} ${typeName(w.typeId)}`.toLowerCase();
      const stateMatch = status === 'all' || (status === 'deleted' ? w.deletedAt : !w.deletedAt);
      return stateMatch && (type === 'all' || w.typeId === type) && (!query || text.includes(query));
    });
    $('#activeCount').textContent = String(catalog.weapons.filter((w) => !w.deletedAt).length);
    $('#resultCount').textContent = `${rows.length} 条记录`;
    refs.rows.replaceChildren(...rows.map((w) => {
      const action = w.deletedAt
        ? el('button', { className: 'row-action', text: '恢复', onclick: () => { w.deletedAt = null; save(); renderRows(); } })
        : el('div', { className: 'row-actions' }, [
          el('button', { className: 'row-action', text: '编辑', onclick: () => openEditor(w.id) }),
          el('button', { className: 'row-action', text: '删除', onclick: async () => { if (await ui.confirm(`确定要软删除"${w.name}"吗？`)) { w.deletedAt = new Date().toISOString(); save(); renderRows(); } } })
        ]);
      return el('tr', { className: w.deletedAt ? 'is-deleted' : '' }, [
        el('td', {}, visual(w)),
        el('td', { text: typeName(w.typeId) }),
        el('td', {}, el('strong', { text: w.name })),
        el('td', { text: w.description || '暂无描述' }),
        el('td', {}, action)
      ]);
    }));
  }

  function openEditor(id) {
    editingId = id || null; pendingImage = null; refs.form.reset();
    const weapon = catalog.weapons.find((w) => w.id === id);
    $('#weaponDialogTitle').textContent = weapon ? '编辑武器' : '添加武器';
    refs.fields.type.value = weapon?.typeId || catalog.weaponTypes.find((t) => !t.deletedAt)?.id || '';
    refs.fields.name.value = weapon?.name || '';
    refs.fields.desc.value = weapon?.description || '';
    updatePreview(weapon);
    refs.dialog.showModal();
  }

  function updatePreview(weapon) {
    const img = pendingImage !== null ? pendingImage : weapon?.image;
    refs.preview.replaceChildren(
      img ? el('img', { src: img, alt: '武器图片预览' }) : el('span', { className: 'asset-frame asset-preview' }, el('span', { className: 'asset-glyph', text: '武' })),
      el('span', { text: img ? '当前武器图片预览' : '暂未上传图片' })
    );
  }

  async function compressImage(file) {
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) throw new Error('请选择 5MB 以内的 PNG、JPG 或 WebP 图片。');
    const bitmap = await createImageBitmap(file);
    const side = Math.min(512, Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = side; canvas.height = side;
    const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, side, side);
    const scale = Math.min(side / bitmap.width, side / bitmap.height);
    ctx.drawImage(bitmap, (side - bitmap.width * scale) / 2, (side - bitmap.height * scale) / 2, bitmap.width * scale, bitmap.height * scale);
    bitmap.close(); return canvas.toDataURL('image/webp', 0.82);
  }

  refs.fields.image.addEventListener('change', async () => {
    try { pendingImage = refs.fields.image.files[0] ? await compressImage(refs.fields.image.files[0]) : null; updatePreview(); }
    catch (error) { refs.fields.image.value = ''; notify(error.message); }
  });

  refs.form.addEventListener('submit', (event) => {
    event.preventDefault();
    const record = editingId ? catalog.weapons.find((w) => w.id === editingId) : { id: `weapon-${crypto.randomUUID()}`, deletedAt: null };
    Object.assign(record, { typeId: refs.fields.type.value, name: refs.fields.name.value.trim(), description: refs.fields.desc.value.trim() });
    if (!editingId) catalog.weapons.push(record);
    if (pendingImage !== null) record.image = pendingImage || '';
    save(); refs.dialog.close(); renderRows(); notify('武器已保存。');
  });

  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => refs.dialog.close()));
  $('#addWeapon').addEventListener('click', () => openEditor());
  [refs.search, refs.typeFilter, refs.statusFilter].forEach((c) => c.addEventListener(c === refs.search ? 'input' : 'change', renderRows));
  renderFilters(); renderRows();
})();
