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
  // 配装步骤固定列表（库页无轮盘，也用同一列表，点击深链直达配装器）
  var STEP_LIST = [
    { step: 'home', label: '主页' },
    { step: 'step-pack', label: '背包' },
    { step: 'step-weapon', label: '武器' },
    { step: 'step-skills', label: '配件' },
    { step: 'step-plugins', label: '零件' },
    { step: 'step-treasures', label: '秘宝' },
    { step: 'step-final', label: '展示' }
  ];
  function stepItems() {
    var items = [];
    var list = wheel ? wheel.querySelectorAll('.step-wheel-item') : [];
    if (list.length) {
      list.forEach(function (it) {
        var step = it.getAttribute('data-step');
        if (!step) return;
        items.push({ step: step, label: it.textContent.trim() });
      });
      return items;
    }
    // 库页无轮盘：用固定列表
    return STEP_LIST.slice();
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

  // —— 卡片②：底部导航（去掉导入导出、去掉主页）——
  function dockItems() {
    var items = [];
    var dock = document.querySelector('.dock-panel');
    if (!dock) return items;
    dock.querySelectorAll('.dock-item').forEach(function (it) {
      var label = '';
      var l = it.querySelector('.dock-item-label');
      if (l) label = l.textContent.trim();
      if (label === '导入' || label === '导出' || label === '主页') return;  // 去掉导入导出、主页
      var href = it.getAttribute('href');
      if (!href) return;
      // 返回 → 封面（回片头）
      if (label === '返回') label = '封面';
      items.push({ label: label, href: href });
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

    // 卡片②（导航：封面/零件库/武器库/秘宝库，一行排开）
    var card2 = el('div', 'nav-card', [
      el('div', 'nav-card-label', ['导航'])
    ]);
    var links2 = el('div', 'nav-card-links nav-card-links--row');  // 单行排开
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

  // —— 手机端侧滑返回：回上一步而不是退出网站（仅 ≤720px）——
  if (window.matchMedia('(max-width: 720px)').matches && window.history && window.history.pushState) {
    var stepHistory = [];  // 步骤历史栈
    var lastStep = null;
    var isBacking = false;  // 回退中标记，避免循环

    // 记录当前步骤（openBuilder/goHome 切换后由轮盘/菜单触发）
    function trackStep() {
      if (!isIndex) return;
      var wrap = document.getElementById('builderWrap');
      var step = null;
      if (wrap && wrap.style.display !== 'none') {
        var panels = wrap.querySelectorAll('.step-panel');
        for (var i = 0; i < panels.length; i++) {
          if (panels[i].style.display !== 'none') { step = panels[i].id; break; }
        }
      }
      if (step && step !== lastStep && !isBacking) {
        stepHistory.push(step);
        history.pushState({ raiderStep: step }, '');
        lastStep = step;
      }
    }

    // 监听步骤切换（轮盘/菜单点击后、下一步按钮后）
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (t && t.closest && (t.closest('.step-wheel-item') || t.closest('.nav-card-link') || t.closest('.specular-btn'))) {
        // 延迟到 DOM 切换完成后记录
        setTimeout(trackStep, 50);
      }
    }, true);

    // 侧滑返回（popstate）→ 回上一步；没有历史则回主页
    window.addEventListener('popstate', function () {
      if (!isIndex) { window.location.href = 'index.html'; return; }
      isBacking = true;
      stepHistory.pop();  // 当前步骤出栈
      var prev = stepHistory[stepHistory.length - 1];
      if (prev && document.getElementById(prev)) {
        var wheelItem = wheel && wheel.querySelector('[data-step="' + prev + '"]');
        if (wheelItem) {
          wheelItem.click();  // 复用轮盘逻辑回上一步（isBacking 阻止再次记录）
          lastStep = prev;
        } else {
          openBuilderDirect(prev);
        }
      } else {
        // 无历史 → 回主页
        var homeItem = wheel && wheel.querySelector('[data-step="home"]');
        if (homeItem) homeItem.click();
        lastStep = null;
      }
      setTimeout(function () { isBacking = false; }, 300);
    });

    // 直接打开面板（无轮盘项时兜底）
    function openBuilderDirect(stepId) {
      var wrap = document.getElementById('builderWrap');
      var panels = wrap ? wrap.querySelectorAll('.step-panel') : [];
      for (var i = 0; i < panels.length; i++) panels[i].style.display = 'none';
      var target = document.getElementById(stepId);
      if (target) target.style.display = '';
      if (wrap) wrap.style.display = '';
      var hero = document.querySelector('.home-hero');
      var bento = document.getElementById('bentoGrid');
      if (hero) hero.style.display = 'none';
      if (bento) bento.style.display = 'none';
      window.scrollTo(0, 0);
      lastStep = stepId;
    }
  }
})();
