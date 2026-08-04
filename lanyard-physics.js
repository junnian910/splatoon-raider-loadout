/* lanyard-physics.js
 * 纯 JS 轻量绳索物理 — 挂坠从顶部坠落 + 拖拽摆动 + 点击翻面。
 * 不依赖 R3F/Rapier/WASM，仅 Verlet 积分 + 距离约束。
 *
 * 暴露：window.LanyardPhysics
 *   .init(widget, opts)   绑定到 .lanyard-widget，返回 controller
 *   controller.startDrop()  从顶部坠落入场
 *   controller.stop()       停止物理 rAF
 *   controller.start()      恢复物理 rAF
 *
 * 设计要点：
 * - 绳子用 N 段质点链，顶端固定，底端驱动 DOM 卡片的 translate+rotate。
 * - 卡片本身仍是 DOM（保留正反面 <img> + rotateY 翻面），canvas 只画绳子+顶环。
 * - widget.hidden 时自动停止 rAF（进入构建步骤即隐藏）。
 */
(function () {
  'use strict';

  function LanyardPhysics(widget, opts) {
    opts = opts || {};
    var segments = opts.segments || 6;          // 绳子段数
    var gravity = opts.gravity || 1400;         // px/s²
    var damping = opts.damping || 0.985;        // 速度阻尼
    var constraintIter = opts.constraintIter || 5;
    var segLen = opts.segLen || 0;              // 0 = 启动时按高度自适应
    var amplitudeDeg = opts.amplitudeDeg || 14; // 摆动最大旋转角

    var canvas = widget.querySelector('.lanyard-physics-canvas');
    var card = widget.querySelector('.lanyard-card');
    if (!canvas || !card) return null;
    var ctx = canvas.getContext('2d');

    var W = 0, H = 0, dpr = 1;
    var points = [];        // {x,y,px,py,pinned}
    var rafId = 0;
    var lastT = 0;
    var dropped = false;    // 是否已触发坠落（首帧释放）
    var dragging = false;
    var dragPoint = null;   // 拖拽时指针在 widget 内的坐标
    var lastCardX = 0, lastCardY = 0;  // 上一帧卡片底端位置，用于算旋转
    var cardRot = 0;
    var suppressClick = false;

    function resize() {
      var rect = widget.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = Math.max(1, rect.width);
      H = Math.max(1, rect.height);
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!segLen) segLen = H * 0.43 / segments;  // 绳子总长 ≈ 现有 .lanyard-rope 的 43%
      // 重新摆放质点（保持已坠落状态则不重置）
      if (!points.length) initPoints();
    }

    function initPoints() {
      points = [];
      var cx = W / 2;
      // 自然下垂位置：质点链从顶端 (cx,0) 垂直向下，间距 segLen
      var segL = segLen || (H * 0.43 / segments);
      for (var i = 0; i <= segments; i++) {
        var y = i * segL;
        points.push({ x: cx, y: y, px: cx, py: y, pinned: i === 0 });
      }
      lastCardX = cx;
      lastCardY = points[segments].y;
    }

    function satisfyConstraint(a, b, dist) {
      var dx = b.x - a.x;
      var dy = b.y - a.y;
      var d = Math.sqrt(dx * dx + dy * dy) || 0.0001;
      var diff = (d - dist) / d;
      var ox = dx * 0.5 * diff;
      var oy = dy * 0.5 * diff;
      if (!a.pinned) { a.x += ox; a.y += oy; }
      if (!b.pinned) { b.x -= ox; b.y -= oy; }
    }

    function step(dt) {
      // 拖拽：底端质点跟随指针
      var tail = points[segments];
      if (dragging && dragPoint) {
        tail.x = dragPoint.x;
        tail.y = dragPoint.y;
        tail.px = tail.x;
        tail.py = tail.y;
      }
      // Verlet 积分
      for (var i = 1; i < points.length; i++) {
        var p = points[i];
        if (p.pinned) continue;
        var vx = (p.x - p.px) * damping;
        var vy = (p.y - p.py) * damping;
        p.px = p.x;
        p.py = p.y;
        p.x += vx;
        p.y += vy + gravity * dt * dt;
      }
      // 距离约束（多次迭代）
      for (var k = 0; k < constraintIter; k++) {
        for (var j = 0; j < points.length - 1; j++) {
          satisfyConstraint(points[j], points[j + 1], segLen);
        }
        // 顶端钉死
        points[0].x = W / 2;
        points[0].y = 0;
      }
      // 卡片旋转：按底端水平速度倾斜
      var tx = tail.x, ty = tail.y;
      var dvx = tx - lastCardX;
      cardRot += (dvx * 0.06 - cardRot) * 0.2;  // 平滑跟随
      var maxRot = amplitudeDeg * Math.PI / 180;
      cardRot = Math.max(-maxRot, Math.min(maxRot, cardRot));
      lastCardX = tx;
      lastCardY = ty;
      // 驱动 DOM 卡片：定位到底端质点 + 旋转
      // 卡片 width:100% 已由 CSS 设置，这里用 translate 把卡片中心对到底端质点
      var cardW = card.offsetWidth;
      var cardH = card.offsetHeight;
      card.style.transform =
        'translate(-50%, 0) translate(' + (tx - W / 2) + 'px,' + ty + 'px) rotate(' + (cardRot * 180 / Math.PI) + 'deg)';
      card.style.transformOrigin = '50% 0';
    }

    function drawRope() {
      ctx.clearRect(0, 0, W, H);
      // 绳子：沿质点链画带金属渐变的粗线
      if (points.length < 2) return;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // 外层暗色描边
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (var i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.stroke();
      // 内层金属高光（调深：浅色背景上 #d8d8d8 高光会融入背景，绳子中间发白）
      var grad = ctx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, '#2a2a34');
      grad.addColorStop(0.38, '#8e8e98');
      grad.addColorStop(0.62, '#8e8e98');
      grad.addColorStop(1, '#2a2a34');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (var j = 1; j < points.length; j++) ctx.lineTo(points[j].x, points[j].y);
      ctx.stroke();
      // 顶端连接环
      var ring = points[0];
      ctx.fillStyle = '#242431';
      ctx.beginPath();
      ctx.arc(ring.x, ring.y + 2, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#8e8e98';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    function frame(ts) {
      if (widget.hidden) { rafId = 0; return; }
      if (!lastT) lastT = ts;
      var dt = Math.min((ts - lastT) / 1000, 0.032);
      lastT = ts;
      // 坠落首帧：把质点从压缩态释放（已由 initPoints 设好，这里只标记）
      if (!dropped) dropped = true;
      step(dt);
      drawRope();
      rafId = requestAnimationFrame(frame);
    }

    function start() { if (!rafId && !widget.hidden) { lastT = 0; rafId = requestAnimationFrame(frame); } }
    function stop() { if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } }

    // 坠落入场：质点链已在自然下垂位置（initPoints 设好）。给底端一个轻微
    // 水平扰动作为"落地冲量"，启动物理循环负责落地后的摆动 + 后续拖拽。
    // 整体坠落位移由 CSS .is-falling 动画处理（widget translateY -130% → 0）。
    function startDrop() {
      var cx = W / 2;
      var segL = segLen || (H * 0.43 / segments);
      // 确保质点在自然下垂位置（resize 可能已重置）
      for (var i = 0; i < points.length; i++) {
        points[i].x = cx;
        points[i].y = i * segL;
        points[i].px = cx;
        points[i].py = i * segL;
      }
      points[0].pinned = true;
      points[0].x = cx; points[0].y = 0;
      // 落地冲量：底端质点给一个水平初速度（通过 px 偏移实现）
      var tail = points[segments];
      tail.px = tail.x - 18;  // 向右 18px 的初速度
      dropped = false;
      cardRot = 0;
      lastCardX = tail.x; lastCardY = tail.y;
      // 物理就绪：隐藏 DOM 绳子，显示 canvas（落地后由物理接管摆动）
      widget.classList.add('is-physics-ready');
      start();
    }

    // —— 拖拽与翻面交互 ——
    function localPos(e) {
      var rect = widget.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    function onPointerDown(e) {
      // 只在卡片附近命中（底端质点周围）
      var p = localPos(e);
      var tail = points[segments];
      if (Math.hypot(p.x - tail.x, p.y - tail.y) > Math.max(card.offsetWidth, card.offsetHeight) * 0.7) return;
      dragging = true;
      dragPoint = p;
      suppressClick = false;
      canvas.classList.add('is-dragging');
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    }
    function onPointerMove(e) {
      if (!dragging) return;
      var p = localPos(e);
      var last = dragPoint;
      if (last && Math.hypot(p.x - last.x, p.y - last.y) > 4) suppressClick = true;
      dragPoint = p;
    }
    function onPointerUp(e) {
      if (!dragging) return;
      dragging = false;
      dragPoint = null;
      canvas.classList.remove('is-dragging');
      // 短按翻面
      if (!suppressClick) {
        card.classList.toggle('is-flipped');
      }
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerUp);

    // —— 初始化 ——
    resize();
    window.addEventListener('resize', function () { resize(); }, { passive: true });

    return {
      start: start,
      stop: stop,
      startDrop: startDrop,
      isRunning: function () { return !!rafId; }
    };
  }

  window.LanyardPhysics = {
    init: function (widget, opts) {
      if (!widget) return null;
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) return null;  // 降级：不跑物理，沿用 CSS 摆动
      try {
        return LanyardPhysics(widget, opts);
      } catch (e) {
        return null;
      }
    }
  };
})();
