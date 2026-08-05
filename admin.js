(function () {
  'use strict';

  const { rules, el } = window.Raider;
  const $ = (selector) => document.querySelector(selector);
  const QUALITY_LABELS = { white: '白色', green: '绿色', purple: '紫色', gold: '金色', rainbow: '彩色' };

  const refs = {
    loginPanel: $('#loginPanel'),
    loginForm: $('#loginForm'),
    loginPassword: $('#loginPassword'),
    reviewPanel: $('#reviewPanel'),
    pendingRows: $('#pendingRows'),
    pendingCount: $('#pendingCount'),
    resultCount: $('#resultCount'),
    emptyHint: $('#emptyHint'),
    refreshBtn: $('#refreshBtn'),
    logoutBtn: $('#logoutBtn'),
    toast: $('#toast'),
  };

  // core.js 里 catalog 含 skills（来自 seed），用于查配件名
  const catalog = window.Raider.storage.loadCatalog();
  const skillName = (id) => rules.skillById(catalog, id)?.name || '未知配件';

  function notify(message) {
    refs.toast.textContent = message;
    refs.toast.hidden = false;
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => { refs.toast.hidden = true; }, 2600);
  }

  function formatTime(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch { return iso; }
  }

  const actionLabels = { create: '新提交', update: '修改', delete: '删除' };
  const qualityStarCount = { white: 1, green: 2, purple: 3, gold: 4, rainbow: 5 };
  function qualityStars(key) {
    const count = qualityStarCount[key] || 1;
    return el('span', { className: `quality-stars quality-stars--${key}`, attrs: { title: QUALITY_LABELS[key] || '' } }, [
      el('span', { className: 'quality-stars-full', text: '★'.repeat(count) }),
      el('span', { className: 'quality-stars-empty', text: '☆'.repeat(5 - count) }),
    ]);
  }

  function renderPending(plugins) {
    refs.pendingCount.textContent = String(plugins.length);
    refs.resultCount.textContent = `${plugins.length} 条待审核`;
    refs.emptyHint.hidden = plugins.length > 0;
    refs.pendingRows.replaceChildren(...plugins.map((p) => {
      const visual = p.image ? el('img', { className: 'asset-table', src: p.image, alt: p.name }) : el('span', { className: 'asset-glyph', text: '零' });
      const approveBtn = el('button', { className: 'button button-solid', type: 'button', text: '通过', onclick: () => review(p.id, 'approve') });
      const rejectBtn = el('button', { className: 'button button-quiet', type: 'button', text: '拒绝', onclick: () => review(p.id, 'reject') });
      const action = p.action || 'create';
      const nameCell = el('td', {}, [
        el('span', { text: p.name || '' }),
        el('span', { className: `action-badge action-badge--${action}`, text: actionLabels[action] || action }),
        action === 'delete' ? el('small', { className: 'action-note', text: `将删除该零件` }) : null,
      ]);
      return el('tr', {}, [
        el('td', {}, visual),
        el('td', { text: skillName(p.skillId) }),
        el('td', {}, el('strong', { text: String(p.slotCost ?? 0) })),
        nameCell,
        el('td', {}, qualityStars(p.qualityKey || 'white')),
        el('td', { className: 'plugin-bonus-cell', text: p.bonusText || '—' }),
        el('td', { text: p.effectText || '—' }),
        el('td', { text: p.submittedBy || '匿名' }),
        el('td', { text: formatTime(p.createdAt) }),
        el('td', {}, el('div', { className: 'row-actions' }, [approveBtn, rejectBtn])),
      ]);
    }));
  }

  async function loadPending() {
    try {
      const res = await fetch('/api/admin/pending');
      if (res.status === 401) { showLogin(); notify('登录已过期，请重新登录。'); return; }
      if (!res.ok) { notify('加载失败。'); return; }
      const data = await res.json();
      renderPending(data.plugins || []);
    } catch {
      notify('网络错误。');
    }
  }

  async function review(id, action) {
    const endpoint = action === 'approve' ? '/api/admin/approve' : '/api/admin/reject';
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { notify(data.error || '操作失败。'); return; }
      notify(action === 'approve' ? '已通过 ✓' : '已拒绝 ✗');
      loadPending();
    } catch {
      notify('网络错误。');
    }
  }

  function showLogin() {
    refs.loginPanel.hidden = false;
    refs.reviewPanel.hidden = true;
    refs.logoutBtn.hidden = true;
    refs.loginPassword.value = '';
  }

  function showReview() {
    refs.loginPanel.hidden = true;
    refs.reviewPanel.hidden = false;
    refs.logoutBtn.hidden = false;
    loadPending();
  }

  refs.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = refs.loginPassword.value;
    if (!password) return;
    try {
      const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { notify(data.error || '登录失败。'); return; }
      notify('登录成功');
      showReview();
    } catch {
      notify('网络错误。');
    }
  });

  refs.logoutBtn.addEventListener('click', async () => {
    try { await fetch('/api/admin/logout', { method: 'POST' }); } catch {}
    showLogin();
    notify('已登出。');
  });

  refs.refreshBtn.addEventListener('click', () => {
    if (refs.reviewPanel.hidden) return;
    loadPending();
  });

  // 启动：先尝试访问待审核接口，已登录则直接进审核视图，否则显示登录
  (async () => {
    try {
      const res = await fetch('/api/admin/pending');
      if (res.status === 401) { showLogin(); return; }
      if (res.ok) { showReview(); return; }
    } catch {}
    showLogin();
  })();
})();
