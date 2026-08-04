/* mobile-menu.js — 手机端汉堡菜单
 * 替换左侧轮盘(step-wheel)与底部 Dock：汉堡按钮展开 3 张导航卡片。
 * 卡片① = 左侧步骤菜单；卡片② = 底部导航(去掉导入/导出)；卡片③ = 导入/导出。
 * 内容从页面现有 DOM 生成（.step-wheel / .dock-panel），与桌面导航永远同步。
 */
(function () {
  'use strict';

  var nav = document.getElementById('mobileNav');
  if (!nav) return;

  var toggle = document.getElementById('mobileNavToggle');
  var overlay = document.getElementById('mobileNavOverlay');
  var cardsBox = document.getElementById('mobileNavCards');
  var isIndex = !!document.getElementById('stepWheel');
  var wheel = document.getElementById('stepWheel');

  function close() {
    nav.classList.remove('is-open');
    if (toggle) toggle.classList.remove('is-open');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }
  function open() {
    nav.classList.add('is-open');
    if (toggle) toggle.classList.add('is-open');
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
    renderCards();
  }
  function toggleMenu() {
    if (nav.classList.contains('is-open')) close();
    else open();
  }

  // —— 卡片①：左侧步骤菜单 ——
  function stepItems() {
    var items = [];
    var list = wheel ? wheel.querySelectorAll('.step-wheel-item') : [];
    list.forEach(function (it) {
      var step = it.getAttribute('data-step');
      if (!step) return;
      items.push({ step: step, label: it.textContent.trim() });
    });
    return items;
  }
  function stepClick(step) {
    if (isIndex) {
      // 复用轮盘点击逻辑：轮盘 DOM 仍在，只是 CSS 隐藏
      var item = wheel && wheel.querySelector('[data-step="' + step + '"]');
      if (item) { item.click(); close(); return; }
    }
    // 库页 / 兜底：深链直达配装器对应步骤
    window.location.href = 'index.html#' + step;
  }

  // —— 卡片②：底部导航（去掉导入/导出）——
  function dockItems() {
    var items = [];
    var dock = document.querySelector('.dock-panel');
    if (!dock) return items;
    dock.querySelectorAll('.dock-item').forEach(function (it) {
      var label = '';
      var l = it.querySelector('.dock-item-label');
      if (l) label = l.textContent.trim();
      if (label === '导入' || label === '导出') return;  // 去掉导入导出
      var href = it.getAttribute('href');
      if (href) items.push({ label: label || '?', href: href });
    });
    return items;
  }

  // —— 卡片③：导入/导出 ——
  function importExportItems() {
    if (isIndex) {
      return [
        { label: '导入配置', fn: function () {
          var b = document.getElementById('dockImport');
          if (b) { b.click(); close(); }
        } },
        { label: '导出配置', fn: function () {
          var b = document.getElementById('dockExport');
          if (b) { b.click(); close(); }
        } }
      ];
    }
    // 库页：导入/导出对话框只在配装器有，跳回主页（与 showcase 现有 Dock 行为一致）
    return [
      { label: '导入配置', href: 'index.html' },
      { label: '导出配置', href: 'index.html' }
    ];
  }

  // —— 渲染 ——
  function el(tag, cls, children) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    (children || []).forEach(function (c) {
      if (typeof c === 'string') e.appendChild(document.createTextNode(c));
      else e.appendChild(c);
    });
    return e;
  }

  function currentStep() {
    // index 页：当前显示的面板 id
    if (!isIndex) return null;
    var wrap = document.getElementById('builderWrap');
    if (!wrap || wrap.style.display === 'none') return null;
    var panels = wrap.querySelectorAll('.step-panel');
    for (var i = 0; i < panels.length; i++) {
      if (panels[i].style.display !== 'none') return panels[i].id;
    }
    return null;
  }

  function renderCards() {
    if (!cardsBox) return;
    cardsBox.replaceChildren();
    var current = currentStep();

    // 卡片①
    var card1 = el('div', 'nav-card', [
      el('div', 'nav-card-label', ['配装步骤'])
    ]);
    var links1 = el('div', 'nav-card-links');
    stepItems().forEach(function (it) {
      var a = el('button', 'nav-card-link' + (it.step === current ? ' is-current' : ''), [it.label]);
      a.type = 'button';
      a.addEventListener('click', function () { stepClick(it.step); });
      links1.appendChild(a);
    });
    card1.appendChild(links1);
    cardsBox.appendChild(card1);

    // 卡片②
    var card2 = el('div', 'nav-card', [
      el('div', 'nav-card-label', ['导航'])
    ]);
    var links2 = el('div', 'nav-card-links');
    dockItems().forEach(function (it) {
      var a = el('a', 'nav-card-link', [it.label]);
      a.href = it.href;
      links2.appendChild(a);
    });
    card2.appendChild(links2);
    cardsBox.appendChild(card2);

    // 卡片③
    var card3 = el('div', 'nav-card', [
      el('div', 'nav-card-label', ['数据'])
    ]);
    var links3 = el('div', 'nav-card-links');
    importExportItems().forEach(function (it) {
      if (it.fn) {
        var b = el('button', 'nav-card-action', [it.label]);
        b.type = 'button';
        b.addEventListener('click', it.fn);
        links3.appendChild(b);
      } else {
        var a = el('a', 'nav-card-action', [it.label]);
        a.href = it.href;
        links3.appendChild(a);
      }
    });
    card3.appendChild(links3);
    cardsBox.appendChild(card3);
  }

  // —— 事件 ——
  if (toggle) toggle.addEventListener('click', toggleMenu);
  if (overlay) overlay.addEventListener('click', close);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });
  // 点面板内链接后关闭
  if (cardsBox) cardsBox.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('a')) close();
  });
})();
