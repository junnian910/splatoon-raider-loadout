(function () {
  'use strict';
  const { seed, storage, el, ui } = window.Raider;
  let catalog = storage.loadCatalog(); let editingId = null; let pendingImage = null;
  const $ = (selector) => document.querySelector(selector);
  const refs = { rows: $('#treasureRows'), dialog: $('#treasureDialog'), form: $('#treasureForm'), search: $('#search'), scope: $('#scopeFilter'), status: $('#statusFilter'), name: $('#name'), recordScope: $('#scope'), description: $('#description'), image: $('#image'), preview: $('#preview'), toast: $('#toast') };
  function packName(id) { return seed.packs.find((pack) => pack.id === id)?.name; }
  function notify(message) { refs.toast.textContent = message; refs.toast.hidden = false; clearTimeout(notify.timer); notify.timer = setTimeout(() => { refs.toast.hidden = true; }, 2800); }
  function visual(item) { const frame = el('span', { className: 'asset-frame asset-treasure-large' }); if (item.image) frame.append(el('img', { src: item.image, alt: '' })); else frame.append(el('span', { className: 'asset-glyph', text: item.glyph || '秘' })); return frame; }
  function render() {
    const query = refs.search.value.trim().toLowerCase(); const scope = refs.scope.value; const status = refs.status.value;
    const rows = catalog.treasures.filter((item) => {
      const stateMatch = status === 'all' || (status === 'deleted' ? item.deletedAt : !item.deletedAt);
      const scopeMatch = scope === 'all' || (scope === 'common' ? item.scope === 'common' : item.packId === scope);
      return stateMatch && scopeMatch && (!query || `${item.name} ${item.description}`.toLowerCase().includes(query));
    });
    $('#activeCount').textContent = String(catalog.treasures.filter((item) => !item.deletedAt).length);
    refs.rows.replaceChildren(...rows.map((item) => el('article', { className: `treasure-record${item.deletedAt ? ' is-deleted' : ''}` }, [
      visual(item), el('div', {}, [el('small', { text: item.scope === 'common' ? '普通秘宝' : `${packName(item.packId)}背包` }), el('h2', { text: item.name }), el('p', { text: item.description })]),
      item.deletedAt ? el('button', { className: 'row-action', text: '恢复', onclick: () => { item.deletedAt = null; storage.saveCatalog(catalog); render(); } }) : el('div', { className: 'row-actions' }, [el('button', { className: 'row-action', text: '编辑', onclick: () => openEditor(item.id) }), el('button', { className: 'row-action', text: '删除', onclick: async () => { if (await ui.confirm(`确定要软删除”${item.name}”吗？`)) { item.deletedAt = new Date().toISOString(); storage.saveCatalog(catalog); render(); } } })])
    ])));
  }
  function preview() { const current = catalog.treasures.find((item) => item.id === editingId); const image = pendingImage || current?.image; refs.preview.replaceChildren(image ? el('img', { src: image, alt: '秘宝预览' }) : el('span', { className: 'asset-frame asset-preview' }, el('span', { className: 'asset-glyph', text: '秘' })), el('span', { text: image ? '本地图片预览' : '当前使用内置占位图' })); }
  function openEditor(id) { editingId = id || null; pendingImage = null; refs.form.reset(); const item = catalog.treasures.find((entry) => entry.id === id); $('#dialogTitle').textContent = item ? '编辑秘宝' : '添加秘宝'; refs.name.value = item?.name || ''; refs.recordScope.value = item?.scope === 'common' ? 'common' : item?.packId || 'common'; refs.description.value = item?.description || ''; preview(); refs.dialog.showModal(); }
  async function compress(file) { if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) throw new Error('请选择 5MB 以内的图片。'); const bitmap = await createImageBitmap(file); const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512; const ctx = canvas.getContext('2d'); const scale = Math.min(512 / bitmap.width, 512 / bitmap.height); const width = bitmap.width * scale; const height = bitmap.height * scale; ctx.drawImage(bitmap, (512 - width) / 2, (512 - height) / 2, width, height); bitmap.close(); return canvas.toDataURL('image/webp', .82); }
  refs.image.addEventListener('change', async () => { try { pendingImage = refs.image.files[0] ? await compress(refs.image.files[0]) : null; preview(); } catch (error) { refs.image.value = ''; notify(error.message); } });
  refs.form.addEventListener('submit', (event) => { event.preventDefault(); const duplicate = catalog.treasures.find((item) => item.id !== editingId && !item.deletedAt && item.name.trim() === refs.name.value.trim()); if (duplicate) { notify('同名秘宝已经存在。'); return; } const item = editingId ? catalog.treasures.find((entry) => entry.id === editingId) : { id: `treasure-${crypto.randomUUID()}`, glyph: '秘', deletedAt: null }; Object.assign(item, { name: refs.name.value.trim(), description: refs.description.value.trim(), scope: refs.recordScope.value === 'common' ? 'common' : 'pack', packId: refs.recordScope.value === 'common' ? null : refs.recordScope.value, image: pendingImage || item.image || '' }); if (!editingId) catalog.treasures.push(item); storage.saveCatalog(catalog); refs.dialog.close(); render(); notify('秘宝已保存。'); });
  document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => refs.dialog.close())); $('#addTreasure').addEventListener('click', () => openEditor()); [refs.search, refs.scope, refs.status].forEach((control) => control.addEventListener(control === refs.search ? 'input' : 'change', render)); render();
})();
