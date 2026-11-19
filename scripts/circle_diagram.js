// ============================================
// circle_diagram.js - Circle Diagram Renderer with Interactions
// Main diagram drawing, zoom, pan, and draggable point M
// FIXED: Shows all projection points M0 → M3 on diagram
// ============================================

var CircleDiagramRenderer = (function () {

  function CircleDiagramRenderer(canvasId) {
    this.canvas = typeof canvasId === 'string' ? document.getElementById(canvasId) : canvasId;
    if (!this.canvas) {
      console.error('Canvas not found:', canvasId);
      return;
    }

    this.ctx = this.canvas.getContext('2d');
    this.calculations = null;
    this.characteristics = null;

    // View transformation
    this.offsetX = 0;
    this.offsetY = 0;
    this.scale = 1;
    this.baseScale = 15; // pixels per ampere (reduced for better fit)
    this.circleStrokeWidth = 3;

    // Interaction state
    this.isDragging = false;
    this.isPanning = false;
    this.dragStart = { x: 0, y: 0 };
    this.currentSlip = 0.04; // Default 4% slip

    // Display dimensions
    this.displayWidth = 800;
    this.displayHeight = 600;

    // Visual settings
    this.colors = {
      background: '#ffffff',
      grid: '#e5e5e5',
      axis: '#333333',
      circle: '#0066cc',
      M0: '#00cc66',
      Mc: '#cc0000',
      MInf: '#999999',
      A: '#ff6600',
      C: '#000000',
      F: '#9900cc',
      Omega: '#cc0066',
      currentPoint: '#0066ff',
      torqueLine: '#996633',
      APerpRay: '#ff8c00',
      APerpSegment: '#000000',
      APerpHandle: '#ff5722',
      APerpGPoint: '#ff7043',
      McLine: '#c97a33',
      M0MLine: '#444444',
      M0MIntersection: '#ff1493',
      // Colors for projection points
      projectionPoints: {
        M0: '#E91E63',
        M1: '#9C27B0',
        M2: '#3F51B5',
        M3: '#00BCD4'
      },
      powerSegments: {
        Pa: '#3498db',
        Pu: '#2ecc71',
        Pe: '#e67e22',
        Pjr: '#e74c3c',
        Pjs: '#9b59b6',
        Pm: '#795548'
      }
    };

    // Perpendicular ray interaction state
    this.aPerpHandleS = 0;
    this.aPerpConstraints = null;
    this.isDraggingAPerpHandle = false;
    this.noCircleMargin = 0.02; // relative safety margin to keep segment off the circle
    this.showSlipSegment = true;
    this.showLegend = true;
    this.showLegend = true;

    this.setupCanvas();
    this.setupEventListeners();
  }

  CircleDiagramRenderer.prototype.setupCanvas = function () {
    var container = this.canvas.parentElement;
    if (!container) return;

    var rect = container.getBoundingClientRect();

    var dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';

    this.ctx.scale(dpr, dpr);

    this.displayWidth = rect.width;
    this.displayHeight = rect.height;

    this.resetView();
  };

  CircleDiagramRenderer.prototype.resetView = function (fitCircle) {
    if (fitCircle && this.calculations && this.calculations.results) {
      var r = this.calculations.results;
      var radius = r.radius || 1;
      var padding = 60;
      var availableWidth = this.displayWidth - padding * 2;
      var availableHeight = this.displayHeight - padding * 2;
      var scaleX = availableWidth / (2 * radius);
      var scaleY = availableHeight / (2 * radius);
      this.scale = Math.min(scaleX, scaleY);
      this.scale = Math.min(Math.max(this.scale / this.baseScale, 0.4), 3);
      this.offsetX = this.displayWidth / 2 - r.Omega.x * this.baseScale * this.scale;
      this.offsetY = this.displayHeight / 2 + r.Omega.y * this.baseScale * this.scale;
    } else {
      this.offsetX = this.displayWidth / 2 - 100;
      this.offsetY = this.displayHeight / 2 + 100;
      this.scale = 1;
    }
  };

  CircleDiagramRenderer.prototype.setupEventListeners = function () {
    var self = this;

    this.canvas.addEventListener('mousedown', function (e) { self.handleMouseDown(e); });
    this.canvas.addEventListener('mousemove', function (e) { self.handleMouseMove(e); });
    this.canvas.addEventListener('mouseup', function (e) { self.handleMouseUp(e); });
    this.canvas.addEventListener('mouseleave', function (e) { self.handleMouseUp(e); });
    this.canvas.addEventListener('wheel', function (e) { self.handleWheel(e); }, { passive: false });
    this.canvas.addEventListener('touchstart', function (e) { self.handleTouchStart(e); });
    this.canvas.addEventListener('touchmove', function (e) { self.handleTouchMove(e); });
    this.canvas.addEventListener('touchend', function (e) { self.handleTouchEnd(e); });
  };

  CircleDiagramRenderer.prototype.handleMouseDown = function (e) {
    var rect = this.canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;

    if (this.calculations && this.isNearAPerpHandle(x, y)) {
      this.isDraggingAPerpHandle = true;
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    if (this.calculations && (this.isNearPointM(x, y) || this.isNearCircle(x, y))) {
      this.isDragging = true;
      this.canvas.style.cursor = 'grabbing';
    } else {
      this.isPanning = true;
      this.dragStart = { x: e.clientX, y: e.clientY };
      this.canvas.style.cursor = 'move';
    }
  };

  CircleDiagramRenderer.prototype.handleMouseMove = function (e) {
    var rect = this.canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;

    if (this.isDraggingAPerpHandle) {
      this.updateAPerpHandleFromMouse(x, y);
      this.draw();
    } else if (this.isDragging && this.calculations) {
      this.updatePointMFromMouse(x, y);
      this.draw();
      this.updateDisplayValues();
      if (this.characteristics) {
        this.characteristics.setCurrentSlip(this.currentSlip);
        this.characteristics.drawAll();
      }
    } else if (this.isPanning) {
      var dx = e.clientX - this.dragStart.x;
      var dy = e.clientY - this.dragStart.y;
      this.offsetX += dx;
      this.offsetY += dy;
      this.dragStart = { x: e.clientX, y: e.clientY };
      this.draw();
    } else {
      if (this.calculations && (this.isNearAPerpHandle(x, y) || this.isNearPointM(x, y) || this.isNearCircle(x, y))) {
        this.canvas.style.cursor = 'grab';
      } else {
        this.canvas.style.cursor = 'default';
      }
    }
  };

  CircleDiagramRenderer.prototype.handleMouseUp = function (e) {
    this.isDragging = false;
    this.isPanning = false;
    this.isDraggingAPerpHandle = false;
    this.canvas.style.cursor = 'default';
  };

  CircleDiagramRenderer.prototype.handleWheel = function (e) {
    e.preventDefault();

    var rect = this.canvas.getBoundingClientRect();
    var mouseX = e.clientX - rect.left;
    var mouseY = e.clientY - rect.top;

    var zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    var newScale = this.scale * zoomFactor;

    if (newScale >= 0.2 && newScale <= 5) {
      var worldX = (mouseX - this.offsetX) / (this.baseScale * this.scale);
      var worldY = (mouseY - this.offsetY) / (this.baseScale * this.scale);

      this.scale = newScale;

      this.offsetX = mouseX - worldX * this.baseScale * this.scale;
      this.offsetY = mouseY - worldY * this.baseScale * this.scale;

      this.draw();
    }
  };

  CircleDiagramRenderer.prototype.handleTouchStart = function (e) {
    if (e.touches.length === 1) {
      var touch = e.touches[0];
      var rect = this.canvas.getBoundingClientRect();
      var x = touch.clientX - rect.left;
      var y = touch.clientY - rect.top;

      if (this.calculations && this.isNearPointM(x, y)) {
        this.isDragging = true;
      }
    }
  };

  CircleDiagramRenderer.prototype.handleTouchMove = function (e) {
    if (this.isDragging && e.touches.length === 1) {
      e.preventDefault();
      var touch = e.touches[0];
      var rect = this.canvas.getBoundingClientRect();
      var x = touch.clientX - rect.left;
      var y = touch.clientY - rect.top;

      this.updatePointMFromMouse(x, y);
      this.draw();
      this.updateDisplayValues();
      if (this.characteristics) {
        this.characteristics.setCurrentSlip(this.currentSlip);
        this.characteristics.drawAll();
      }
    }
  };

  CircleDiagramRenderer.prototype.handleTouchEnd = function (e) {
    this.isDragging = false;
  };

  CircleDiagramRenderer.prototype.worldToScreen = function (wx, wy) {
    var sx = this.offsetX + wx * this.baseScale * this.scale;
    var sy = this.offsetY - wy * this.baseScale * this.scale;
    return { x: sx, y: sy };
  };

  CircleDiagramRenderer.prototype.screenToWorld = function (sx, sy) {
    var wx = (sx - this.offsetX) / (this.baseScale * this.scale);
    var wy = -(sy - this.offsetY) / (this.baseScale * this.scale);
    return { x: wx, y: wy };
  };

  CircleDiagramRenderer.prototype.normalizeVector = function (vec) {
    if (!vec) return null;
    var len = Math.sqrt(vec.x * vec.x + vec.y * vec.y);
    if (!isFinite(len) || len < 1e-9) return null;
    return { x: vec.x / len, y: vec.y / len, length: len };
  };

  CircleDiagramRenderer.prototype.drawInfiniteLine = function (point, direction, color, lineWidth, dash) {
    var dir = this.normalizeVector(direction);
    if (!point || !dir) return;
    var r = this.calculations?.results;
    var span = (r?.radius || 10) * 6;

    var start = {
      x: point.x - dir.x * span,
      y: point.y - dir.y * span
    };
    var end = {
      x: point.x + dir.x * span,
      y: point.y + dir.y * span
    };

    this.drawLine(start, end, color, lineWidth, dash || []);
  };

  CircleDiagramRenderer.prototype.drawHalfLine = function (point, direction, length, color, lineWidth, dash) {
    var dir = this.normalizeVector(direction);
    if (!point || !dir) return;
    var span = length;
    if (!isFinite(span) || span <= 0) {
      var r = this.calculations?.results;
      span = (r?.radius || 10) * 4;
    }
    var end = {
      x: point.x + dir.x * span,
      y: point.y + dir.y * span
    };
    this.drawLine(point, end, color, lineWidth, dash || []);
  };

  CircleDiagramRenderer.prototype.drawLabelledPoint = function (point, color, label, offset) {
    if (!point) return;
    var ctx = this.ctx;
    var screen = this.worldToScreen(point.x, point.y);

    ctx.save();
    ctx.fillStyle = color || '#000';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (label) {
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      var dx = offset?.x || 10;
      var dy = offset?.y || 0;
      ctx.fillStyle = '#222';
      ctx.fillText(label, screen.x + dx, screen.y + dy);
    }
    ctx.restore();
  };

  CircleDiagramRenderer.prototype.drawTextLabel = function (point, text, color, offset) {
    if (!point || !text) return;
    var ctx = this.ctx;
    var screen = this.worldToScreen(point.x, point.y);
    ctx.save();
    ctx.fillStyle = color || '#111';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var dx = offset?.x || 0;
    var dy = offset?.y || -12;
    ctx.fillText(text, screen.x + dx, screen.y + dy);
    ctx.restore();
  };

  CircleDiagramRenderer.prototype.drawSegmentTicks = function (segment, tickCount) {
    if (!segment) return;
    var ctx = this.ctx;
    var startScreen = this.worldToScreen(segment.start.x, segment.start.y);
    var endScreen = this.worldToScreen(segment.end.x, segment.end.y);

    var dirScreen = {
      x: endScreen.x - startScreen.x,
      y: endScreen.y - startScreen.y
    };
    var lengthScreen = Math.sqrt(dirScreen.x * dirScreen.x + dirScreen.y * dirScreen.y);
    if (lengthScreen < 1) return;

    var nx = dirScreen.x / lengthScreen;
    var ny = dirScreen.y / lengthScreen;
    var px = -ny;
    var py = nx;

    var totalTicks = tickCount || 10;
    ctx.save();
    ctx.strokeStyle = '#333333';
    ctx.fillStyle = '#111111';
    ctx.lineWidth = 1;
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (var i = 0; i <= totalTicks; i++) {
      var t = i / totalTicks;
      var x = startScreen.x + dirScreen.x * t;
      var y = startScreen.y + dirScreen.y * t;
      var tickLength = (i % 5 === 0) ? 10 : 6;

      ctx.beginPath();
      ctx.moveTo(x - px * tickLength * 0.5, y - py * tickLength * 0.5);
      ctx.lineTo(x + px * tickLength * 0.5, y + py * tickLength * 0.5);
      ctx.stroke();

      if (i % 5 === 0) {
        var labelOffset = 12;
        ctx.fillText((t).toFixed(1), x, y + labelOffset);
      }
    }

    ctx.restore();
  };

  CircleDiagramRenderer.prototype.getLineIntersection = function (p1, d1, p2, d2) {
    var cross = d1.x * d2.y - d1.y * d2.x;
    if (!isFinite(cross) || Math.abs(cross) < 1e-6) return null;
    var dx = p2.x - p1.x;
    var dy = p2.y - p1.y;
    var t = (dx * d2.y - dy * d2.x) / cross;
    var u = (dx * d1.y - dy * d1.x) / cross;
    if (!isFinite(t) || !isFinite(u)) return null;
    return {
      point: { x: p1.x + d1.x * t, y: p1.y + d1.y * t },
      t: t,
      u: u
    };
  };

  CircleDiagramRenderer.prototype.recomputeAPerpConstraints = function () {
    if (!this.calculations || !this.calculations.results) {
      this.aPerpConstraints = null;
      this.aPerpHandleS = 0;
      return;
    }

    var r = this.calculations.results;
    if (!r.APerpRay || !r.torqueDir || !r.McLine) {
      this.aPerpConstraints = null;
      this.aPerpHandleS = 0;
      return;
    }

    var ray = r.APerpRay;
    var dir = ray.direction;
    var dirLen = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
    var rayLength = ray.length || Math.sqrt(Math.pow(ray.end.x - ray.start.x, 2) + Math.pow(ray.end.y - ray.start.y, 2));

    if (!isFinite(dirLen) || dirLen < 1e-6 || !isFinite(rayLength) || rayLength < 1e-3) {
      this.aPerpConstraints = null;
      this.aPerpHandleS = 0;
      return;
    }

    var n = { x: dir.x / dirLen, y: dir.y / dirLen };
    var center = r.Omega || { x: 0, y: 0 };
    var delta = (center.x - ray.start.x) * n.x + (center.y - ray.start.y) * n.y;
    var clearance = r.radius * (1 + this.noCircleMargin);

    var sFar = delta + clearance;
    var sNear = delta - clearance;

    var preferredMin = Math.max(0, sFar);
    var preferredMax = rayLength;

    if (preferredMin >= preferredMax) {
      preferredMin = 0;
      preferredMax = Math.max(0, Math.min(rayLength, sNear));
    }

    if (preferredMin >= preferredMax) {
      this.aPerpConstraints = null;
      this.aPerpHandleS = 0;
      return;
    }

    this.aPerpConstraints = {
      min: preferredMin,
      max: preferredMax,
      direction: n,
      rayLength: rayLength
    };

    if (this.aPerpHandleS < preferredMin || this.aPerpHandleS > preferredMax) {
      this.aPerpHandleS = preferredMin;
    }
  };

  CircleDiagramRenderer.prototype.getAPerpHandlePoint = function () {
    if (!this.calculations || !this.calculations.results || !this.aPerpConstraints) return null;
    var r = this.calculations.results;
    var ray = r.APerpRay;
    if (!ray) return null;

    var s = this.aPerpHandleS;
    var dir = this.aPerpConstraints.direction;
    return {
      x: ray.start.x + dir.x * s,
      y: ray.start.y + dir.y * s
    };
  };

  CircleDiagramRenderer.prototype.computeAPerpSegment = function () {
    if (!this.calculations || !this.calculations.results || !this.aPerpConstraints) return null;

    var r = this.calculations.results;
    if (!r.torqueDir || !r.McLine) return null;

    var handle = this.getAPerpHandlePoint();
    if (!handle) return null;

    var mcPoint = r.McLine.point;
    var mcDir = r.McLine.direction;

    var intersection = this.getLineIntersection(handle, r.torqueDir, mcPoint, mcDir);
    if (!intersection || intersection.t <= 0) return null;

    var segmentDir = {
      x: intersection.point.x - handle.x,
      y: intersection.point.y - handle.y
    };
    var norm = this.normalizeVector(segmentDir);

    return {
      start: handle,
      end: intersection.point,
      length: norm ? norm.length : Math.sqrt(segmentDir.x * segmentDir.x + segmentDir.y * segmentDir.y),
      direction: norm || segmentDir
    };
  };

  CircleDiagramRenderer.prototype.computeM0MLine = function () {
    if (!this.calculations || !this.calculations.results || !this.aPerpConstraints) return null;
    var r = this.calculations.results;
    if (!r.M0 || !r.APerpRay) return null;
    var M = this.calculations.findPointForSlip(this.currentSlip);
    if (!M) return null;

    var dir = { x: M.x - r.M0.x, y: M.y - r.M0.y };
    var norm = this.normalizeVector(dir);
    if (!norm) return null;

    var rayDir = this.aPerpConstraints.direction;
    var intersection = this.getLineIntersection(r.M0, norm, r.APerpRay.start, rayDir);
    if (!intersection) return null;

    return {
      direction: dir,
      normalized: norm,
      intersectionPoint: intersection.point
    };
  };

  CircleDiagramRenderer.prototype.computeM0SlipIntersection = function (segment) {
    if (!this.calculations || !this.calculations.results) return null;
    var r = this.calculations.results;
    if (!r.M0) return null;

    var m0Line = this.computeM0MLine();
    var aPerpSegment = segment || this.computeAPerpSegment();
    if (!m0Line || !m0Line.normalized || !aPerpSegment || !aPerpSegment.direction) return null;

    var m0Dir = m0Line.normalized;
    var slipDir = aPerpSegment.direction;
    var intersection = this.getLineIntersection(r.M0, m0Dir, aPerpSegment.start, slipDir);
    if (!intersection) return null;

    var t = intersection.t;
    var u = intersection.u;
    var segLength = aPerpSegment.length;
    if (!isFinite(segLength) || segLength < 1e-6) return null;

    if (t < -1e-3) return null;
    if (u < -1e-3 || u > segLength + 1e-3) return null;

    var gValue = Math.max(0, Math.min(1, u / segLength));

    return {
      point: intersection.point,
      gValue: gValue
    };
  };

  CircleDiagramRenderer.prototype.isNearAPerpHandle = function (screenX, screenY) {
    var handle = this.getAPerpHandlePoint();
    if (!handle) return false;
    var screenHandle = this.worldToScreen(handle.x, handle.y);
    var dist = Math.sqrt(Math.pow(screenX - screenHandle.x, 2) + Math.pow(screenY - screenHandle.y, 2));
    return dist < 25;
  };

  CircleDiagramRenderer.prototype.updateAPerpHandleFromMouse = function (screenX, screenY) {
    if (!this.calculations || !this.calculations.results || !this.aPerpConstraints) return;
    var r = this.calculations.results;
    var ray = r.APerpRay;
    if (!ray) return;

    var world = this.screenToWorld(screenX, screenY);
    var dir = this.aPerpConstraints.direction;
    var vec = {
      x: world.x - ray.start.x,
      y: world.y - ray.start.y
    };
    var s = vec.x * dir.x + vec.y * dir.y;
    s = Math.max(this.aPerpConstraints.min, Math.min(this.aPerpConstraints.max, s));
    this.aPerpHandleS = s;
  };

  CircleDiagramRenderer.prototype.isNearPointM = function (screenX, screenY) {
    if (!this.calculations) return false;

    var M = this.calculations.findPointForSlip(this.currentSlip);
    var screenM = this.worldToScreen(M.x, M.y);

    var dist = Math.sqrt(Math.pow(screenX - screenM.x, 2) + Math.pow(screenY - screenM.y, 2));
    return dist < 30;
  };

  CircleDiagramRenderer.prototype.isNearCircle = function (screenX, screenY) {
    if (!this.calculations) return false;

    var r = this.calculations.results;
    var center = this.worldToScreen(r.Omega.x, r.Omega.y);
    var radiusPx = r.radius * this.baseScale * this.scale;

    var dist = Math.sqrt(Math.pow(screenX - center.x, 2) + Math.pow(screenY - center.y, 2));
    return Math.abs(dist - radiusPx) < 25;
  };

  CircleDiagramRenderer.prototype.updatePointMFromMouse = function (screenX, screenY) {
    if (!this.calculations) return;

    var world = this.screenToWorld(screenX, screenY);
    var r = this.calculations.results;

    var dx = world.x - r.Omega.x;
    var dy = world.y - r.Omega.y;
    var dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.001) return;

    var nx = dx / dist;
    var ny = dy / dist;

    var circleX = r.Omega.x + nx * r.radius;
    var circleY = r.Omega.y + ny * r.radius;

    // Constraint: M strictly between M0 and Mc (angular check)
    if (r.M0 && r.Mc && r.Omega) {
      // Angles relative to center Omega
      var angleM = Math.atan2(circleX - r.Omega.x, circleY - r.Omega.y);
      var angleM0 = Math.atan2(r.M0.x - r.Omega.x, r.M0.y - r.Omega.y);
      var angleMc = Math.atan2(r.Mc.x - r.Omega.x, r.Mc.y - r.Omega.y);

      // Normalize angles to be monotonic if needed, but usually atan2 results are fine for this quadrant
      // Order is typically M0 < M < Mc (angles increasing or decreasing monotonically)

      // Check if M is "before" M0 or "after" Mc
      // Simple distance check might be easier: clamp to the segment M0-Mc on the circle?
      // Or simply clamp the slip?

      // Let's use the slip calculation to clamp! 
      // This is robust: Calculate slip, clamp 0..1, then re-find point.
    }

    // On utilise uniquement la méthode de référence dans circle_calculations.js.
    // Calculate raw slip from the mouse position
    var calc = this.calculations.calculateForPointM(circleX, circleY);
    var rawSlip = (calc && typeof calc.slip === 'number') ? calc.slip : this.currentSlip;

    // Strict clamp 0 to 1
    this.currentSlip = Math.max(0, Math.min(1, rawSlip));
  };

  CircleDiagramRenderer.prototype.setOperatingPoint = function (target) {
    if (!this.calculations) return;
    var r = this.calculations.results;
    var slip = null;

    switch (target) {
      case 'noLoad':
        slip = 0;
        break;
      case 'lockedRotor':
        slip = 1;
        break;
      case 'nominal':
        if (r.ns > 0 && this.calculations.inputData.Ns > 0) {
          slip = (r.ns - this.calculations.inputData.Ns) / r.ns;
        } else {
          slip = 0.04;
        }
        break;
      case 'maxTorque':
        if (r.MTmax) {
          var calc = this.calculations.calculateForPointM(r.MTmax.x, r.MTmax.y);
          slip = (calc && typeof calc.slip === 'number') ? calc.slip : null;
        }
        break;
      default:
        slip = null;
    }

    if (slip === null || isNaN(slip)) {
      console.warn('Target operating point unavailable:', target);
      return;
    }

    this.currentSlip = Math.max(0, Math.min(1, slip));
    this.draw();
    this.updateDisplayValues();
    if (this.characteristics) {
      this.characteristics.setCurrentSlip(this.currentSlip);
      this.characteristics.drawAll();
    }
  };

  CircleDiagramRenderer.prototype.draw = function () {
    if (!this.calculations) return;

    var ctx = this.ctx;
    var w = this.displayWidth;
    var h = this.displayHeight;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = this.colors.background;
    ctx.fillRect(0, 0, w, h);

    this.drawGrid();
    this.drawAxes();
    this.drawCircle();
    this.drawKeyLines();
    this.drawPowerSegments();
    this.drawPoints();
    this.drawProjectionPoints(); // NEW: Draw M0…M3
    this.drawLabels();
    this.drawSlipIndicator();
    this.drawLegend();
  };

  // ============================================
  // LEGEND DRAWING
  // ============================================

  CircleDiagramRenderer.prototype.drawLegend = function () {
    if (this.showLegend === false) return;
    var ctx = this.ctx;
    var padding = 15;
    var legendX = padding;
    var legendY = 270;
    var lineHeight = 22;
    var dotRadius = 6;
    var lineLength = 30;
    var textOffset = 45;

    // Legend items - Points
    var pointItems = [
      { label: 'M₀ - No-load point', color: this.colors.M0, type: 'point' },
      { label: 'MC - Short-circuit point', color: this.colors.Mc, type: 'point' },
      { label: 'Mn - Nominal point', color: '#28a745', type: 'point' },
      { label: 'Ω - Circle center', color: this.colors.Omega, type: 'point' },
      { label: 'M - Current operating point', color: this.colors.currentPoint, type: 'point' },
      { label: 'Mτmax - Maximum torque point', color: '#FF8C00', type: 'point' },
      { label: 'Slip point', color: '#ff0088ff', type: 'point' },
    ];

    // Legend items - Lines
    var lineItems = [
      { label: 'M₀M∞ - Line of stator Joule losses', color: this.colors.M0MLine, type: 'line' },
      { label: 'M₀MC - Line of rotor Joule losses', color: this.colors.McLine, type: 'line' },
      { label: 'Useful Power', color: this.colors.powerSegments.Pu, type: 'line' },
      { label: 'Rotor Losses', color: this.colors.powerSegments.Pjr, type: 'line' },
      { label: 'Stator Joule Losses', color: this.colors.powerSegments.Pjs, type: 'line' },
      { label: 'Iron Losses', color: this.colors.powerSegments.Pm, type: 'line' }
    ];

    var allItems = pointItems.concat(lineItems);

    // Calculate legend box dimensions
    var maxTextWidth = 0;
    ctx.font = '12px "Satoshi-Medium", sans-serif';
    for (var i = 0; i < allItems.length; i++) {
      var textWidth = ctx.measureText(allItems[i].label).width;
      if (textWidth > maxTextWidth) maxTextWidth = textWidth;
    }

    var boxWidth = textOffset + maxTextWidth + padding;
    var boxHeight = (allItems.length * lineHeight) + padding * 2;

    // Draw legend background
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(legendX, legendY, boxWidth, boxHeight, 8);
    ctx.fill();
    ctx.stroke();

    // Draw legend title
    var titleText = 'Legend';
    var titleX = legendX + padding;
    var titleY = legendY + padding + 10;

    ctx.font = '14px "Satoshi-Medium", sans-serif';
    var titleMeasure = ctx.measureText(titleText);

    var grad = ctx.createLinearGradient(titleX, 0, titleX + titleMeasure.width, 0);
    grad.addColorStop(0, '#F6192B');
    grad.addColorStop(1, '#FE6743');

    ctx.fillStyle = grad;
    ctx.fillText(titleText, titleX, titleY);

    var startY = legendY + padding + 30;

    // Draw legend items
    ctx.font = '12px "Satoshi-Medium", sans-serif';
    for (var j = 0; j < allItems.length; j++) {
      var item = allItems[j];
      var itemY = startY + (j * lineHeight);

      if (item.type === 'point') {
        // Draw point symbol
        ctx.fillStyle = item.color;
        ctx.beginPath();
        ctx.arc(legendX + padding + dotRadius, itemY, dotRadius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        // Draw line symbol
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(legendX + padding, itemY);
        ctx.lineTo(legendX + padding + lineLength, itemY);
        ctx.stroke();
      }

      // Draw label
      ctx.fillStyle = '#333333';
      ctx.fillText(item.label, legendX + textOffset, itemY + 4);
    }

    ctx.restore();
  };

  CircleDiagramRenderer.prototype.drawGrid = function () {
    var ctx = this.ctx;
    var w = this.displayWidth;
    var h = this.displayHeight;
    ctx.save();
    ctx.strokeStyle = this.colors.grid;
    ctx.lineWidth = 1;

    var baseSpacing = 2;
    var spacing = baseSpacing;
    var pxPerUnit = this.baseScale * this.scale;
    while (pxPerUnit * spacing < 30) spacing *= 2;
    while (pxPerUnit * spacing > 80) spacing /= 2;

    var topLeft = this.screenToWorld(0, 0);
    var bottomRight = this.screenToWorld(w, h);
    var minX = Math.floor(Math.min(topLeft.x, bottomRight.x) / spacing) * spacing;
    var maxX = Math.ceil(Math.max(topLeft.x, bottomRight.x) / spacing) * spacing;
    var minY = Math.floor(Math.min(topLeft.y, bottomRight.y) / spacing) * spacing;
    var maxY = Math.ceil(Math.max(topLeft.y, bottomRight.y) / spacing) * spacing;

    for (var x = minX; x <= maxX; x += spacing) {
      var start = this.worldToScreen(x, minY);
      var end = this.worldToScreen(x, maxY);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
    for (var y = minY; y <= maxY; y += spacing) {
      var start2 = this.worldToScreen(minX, y);
      var end2 = this.worldToScreen(maxX, y);
      ctx.beginPath();
      ctx.moveTo(start2.x, start2.y);
      ctx.lineTo(end2.x, end2.y);
      ctx.stroke();
    }
    ctx.restore();
  };

  CircleDiagramRenderer.prototype.drawAxes = function () {
    var ctx = this.ctx;
    var w = this.displayWidth;
    var h = this.displayHeight;

    ctx.strokeStyle = this.colors.axis;
    ctx.lineWidth = 2;

    var topLeft = this.screenToWorld(0, 0);
    var bottomRight = this.screenToWorld(w, h);
    var minX = Math.min(topLeft.x, bottomRight.x);
    var maxX = Math.max(topLeft.x, bottomRight.x);
    var minY = Math.min(topLeft.y, bottomRight.y);
    var maxY = Math.max(topLeft.y, bottomRight.y);
    var pxPerUnit = this.baseScale * this.scale;
    var tickSpacing = this.getDynamicSpacing(pxPerUnit);

    if (0 >= minY && 0 <= maxY) {
      var xStart = this.worldToScreen(minX, 0);
      var xEnd = this.worldToScreen(maxX, 0);
      ctx.beginPath();
      ctx.moveTo(xStart.x, xStart.y);
      ctx.lineTo(xEnd.x, xEnd.y);
      ctx.stroke();
    }

    if (0 >= minX && 0 <= maxX) {
      var yStart = this.worldToScreen(0, minY);
      var yEnd = this.worldToScreen(0, maxY);
      ctx.beginPath();
      ctx.moveTo(yStart.x, yStart.y);
      ctx.lineTo(yEnd.x, yEnd.y);
      ctx.stroke();
    }

    ctx.fillStyle = this.colors.axis;
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';

    var xLabel = this.worldToScreen(Math.min(maxX, 0) + (maxX - minX) * 0.4, 0);
    ctx.fillText('Reactive (A)', xLabel.x, xLabel.y - 8);

    var yLabel = this.worldToScreen(0, Math.min(maxY, 0) - (maxY - minY) * 0.4);
    ctx.save();
    ctx.translate(yLabel.x - 10, yLabel.y);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Active (A)', 0, 0);
    ctx.restore();

    this.drawAxisTicks(minX, maxX, minY, maxY, tickSpacing);
  };

  CircleDiagramRenderer.prototype.getDynamicSpacing = function (pxPerUnit) {
    var spacing = 1;
    while (pxPerUnit * spacing < 40) spacing *= 2;
    while (pxPerUnit * spacing > 120) spacing /= 2;
    return spacing;
  };

  CircleDiagramRenderer.prototype.formatTickValue = function (value) {
    if (Math.abs(value - Math.round(value)) < 1e-4) {
      return Math.round(value).toString();
    }
    var absVal = Math.abs(value);
    if (absVal >= 100) return value.toFixed(0);
    if (absVal >= 10) return value.toFixed(1);
    if (absVal >= 1) return value.toFixed(2);
    return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  };

  CircleDiagramRenderer.prototype.drawAxisTicks = function (minX, maxX, minY, maxY, spacing) {
    var ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = this.colors.grid;
    ctx.fillStyle = this.colors.axis;
    ctx.font = '12px Arial';

    if (0 >= minY && 0 <= maxY) {
      var startX = Math.floor(minX / spacing) * spacing;
      for (var x = startX; x <= maxX; x += spacing) {
        if (Math.abs(x) < spacing * 0.5) continue;
        var screen = this.worldToScreen(x, 0);
        ctx.beginPath();
        ctx.moveTo(screen.x, screen.y - 6);
        ctx.lineTo(screen.x, screen.y + 6);
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.fillText(this.formatTickValue(x), screen.x, screen.y + 18);
      }
    }

    if (0 >= minX && 0 <= maxX) {
      var startY = Math.floor(minY / spacing) * spacing;
      for (var y = startY; y <= maxY; y += spacing) {
        if (Math.abs(y) < spacing * 0.5) continue;
        var screenY = this.worldToScreen(0, y);
        ctx.beginPath();
        ctx.moveTo(screenY.x - 6, screenY.y);
        ctx.lineTo(screenY.x + 6, screenY.y);
        ctx.stroke();
        ctx.textAlign = 'right';
        ctx.fillText(this.formatTickValue(y), screenY.x - 8, screenY.y + 4);
      }
    }
    ctx.restore();
  };

  CircleDiagramRenderer.prototype.drawCircle = function () {
    var ctx = this.ctx;
    var r = this.calculations.results;

    var center = this.worldToScreen(r.Omega.x, r.Omega.y);
    var radiusPx = r.radius * this.baseScale * this.scale;
    var circleStrokeWidth = this.circleStrokeWidth || 3;

    ctx.strokeStyle = this.colors.circle;
    ctx.lineWidth = circleStrokeWidth;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radiusPx, 0, 2 * Math.PI);
    ctx.stroke();
  };

  CircleDiagramRenderer.prototype.drawKeyLines = function () {
    var ctx = this.ctx;
    var r = this.calculations.results;
    var gamma = r.gamma || 0;

    // Draw AF line - always through center Ω (since center is on AF)
    // Extend the AF line beyond A and F for visibility
    var tanG = Math.tan(gamma);
    var extendLength = r.radius * 2;

    var AFstart = {
      x: r.A.x - extendLength * 0.5,
      y: r.A.y + tanG * (-extendLength * 0.5)
    };
    var AFend = {
      x: r.F.x + extendLength * 0.3,
      y: r.A.y + tanG * (r.F.x + extendLength * 0.3 - r.A.x)
    };

    this.drawLine(AFstart, AFend, '#9900cc', 2, [5, 5]);

    // Draw gamma arc if applicable
    if (gamma > 0.001) {
      this.drawGammaArc(r.A, gamma, 20);
    }

    // Draw perpendicular ray from A (length 2×diameter) and new construction lines
    var shouldShowSlip = this.showSlipSegment !== false;

    if (r.APerpRay && shouldShowSlip) {
      // Half-line along Mc direction (only forward from Mc)
      if (r.McLine) {
        var mcLength = this.aPerpConstraints ? this.aPerpConstraints.rayLength : undefined;
        this.drawHalfLine(r.McLine.point, r.McLine.direction, mcLength, this.colors.McLine, 2, [8, 6]);
      }

      // Perpendicular ray
      this.drawLine(r.APerpRay.start, r.APerpRay.end, this.colors.APerpRay, 2, [6, 4]);

      // Segment parallel to M∞ (from handle)
      var aPerpSegment = this.computeAPerpSegment();
      var m0SlipIntersection = null;
      if (aPerpSegment) {
        m0SlipIntersection = this.computeM0SlipIntersection(aPerpSegment);
        var slipWidth = this.circleStrokeWidth || 3;
        this.drawLine(aPerpSegment.start, aPerpSegment.end, this.colors.APerpSegment, slipWidth, []);

        // g labels at endpoints
        this.drawLabelledPoint(aPerpSegment.start, this.colors.APerpGPoint, 'g = 0', { x: -18, y: -12 });
        this.drawLabelledPoint(aPerpSegment.end, this.colors.APerpGPoint, 'g = 1', { x: 12, y: 12 });

        // Graduations 0 → 1
        this.drawSegmentTicks(aPerpSegment, 10);

        var midPoint = {
          x: (aPerpSegment.start.x + aPerpSegment.end.x) / 2,
          y: (aPerpSegment.start.y + aPerpSegment.end.y) / 2
        };
        this.drawTextLabel(midPoint, 'Slip Segment', this.colors.APerpSegment, { x: 0, y: -18 });

        if (m0SlipIntersection) {
          var label = 'g = ' + m0SlipIntersection.gValue.toFixed(2);
          this.drawLabelledPoint(m0SlipIntersection.point, this.colors.M0MIntersection, label, { x: 10, y: -14 });
        }
      }

      // Half-line from M0 through current M (only positive direction)
      var m0Line = this.computeM0MLine();
      if (m0Line) {
        this.drawHalfLine(
          r.M0,
          m0Line.direction,
          this.aPerpConstraints ? this.aPerpConstraints.rayLength : undefined,
          this.colors.M0MLine,
          1.5,
          [4, 4]
        );
        if (m0Line.intersectionPoint) {
          this.drawLabelledPoint(m0Line.intersectionPoint, this.colors.M0MIntersection, 'M0M ∩ g', { x: 10, y: -10 });
        }
      }

      // Draggable handle
      var handle = this.getAPerpHandlePoint();
      if (handle) {
        var screenHandle = this.worldToScreen(handle.x, handle.y);
        ctx.save();
        ctx.fillStyle = this.colors.APerpHandle;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(screenHandle.x, screenHandle.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    // Draw torque line (M0 to M∞)
    if (r.MInf) {
      this.drawLine(r.M0, r.MInf, this.colors.torqueLine, 2, []);
    }

    // Draw line M0 to Mc
    this.drawLine(r.M0, r.Mc, '#cc6666', 1, [3, 3]);

    // Draw vertical line through M
    var M = this.calculations.findPointForSlip(this.currentSlip);
    var maxY = Math.max(r.M0.y, r.Mc.y, M.y) + 5;
    this.drawLine({ x: M.x, y: -2 }, { x: M.x, y: maxY }, '#cccccc', 1, [2, 2]);

    // Draw line from origin to M (current vector)
    this.drawLine({ x: 0, y: 0 }, M, this.colors.currentPoint, 2, []);

    // Draw segment AC (horizontal through A) if C exists
    if (r.C) {
      this.drawLine(r.A, r.C, this.colors.C || '#000000', 2, []);
    }
  };

  CircleDiagramRenderer.prototype.drawGammaArc = function (point, gamma, radius) {
    var ctx = this.ctx;
    var screen = this.worldToScreen(point.x, point.y);
    var arcRadius = radius * this.scale;

    ctx.strokeStyle = '#9900cc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, arcRadius, -Math.PI / 2, -Math.PI / 2 + gamma, false);
    ctx.stroke();

    var labelX = screen.x + arcRadius * 1.5;
    var labelY = screen.y - arcRadius * 0.5;
    ctx.fillStyle = '#9900cc';
    ctx.font = 'italic 12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('γ', labelX, labelY);
  };

  CircleDiagramRenderer.prototype.drawPowerSegments = function () {
    var ctx = this.ctx;
    var r = this.calculations.results;
    var M = this.calculations.findPointForSlip(this.currentSlip);
    var results = this.calculations.calculateForPointM(M.x, M.y);

    var M0p = results.projectionPoints.M0;
    var M1p = results.projectionPoints.M1;
    var M2p = results.projectionPoints.M2;
    var M3p = results.projectionPoints.M3;

    // Draw power segments with distinct colors
    var segments = [
      { start: M0p, end: M1p, color: this.colors.powerSegments.Pm, label: 'Pm (M1M0)' },
      { start: M1p, end: M2p, color: this.colors.powerSegments.Pjs, label: 'Pjs (M2M1)' },
      { start: M2p, end: M3p, color: this.colors.powerSegments.Pjr, label: 'Pjr (M3M2)' },
      { start: M3p, end: M, color: this.colors.powerSegments.Pu, label: 'Pu (MM3)' }
    ];

    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      this.drawLine(seg.start, seg.end, seg.color, 5, []);
    }
  };

  // NEW: Draw projection points M0…M3
  CircleDiagramRenderer.prototype.drawProjectionPoints = function () {
    if (!this.calculations) return;

    var M = this.calculations.findPointForSlip(this.currentSlip);
    var results = this.calculations.calculateForPointM(M.x, M.y);

    // Draw each projection point
    this.drawPoint(results.projectionPoints.M0, this.colors.projectionPoints.M0, "M0'", 5, false);
    this.drawPoint(results.projectionPoints.M1, this.colors.projectionPoints.M1, 'M1', 5, false);
    this.drawPoint(results.projectionPoints.M2, this.colors.projectionPoints.M2, 'M2', 5, false);
    this.drawPoint(results.projectionPoints.M3, this.colors.projectionPoints.M3, 'M3', 5, false);
  };

  CircleDiagramRenderer.prototype.drawPoints = function () {
    var ctx = this.ctx;
    var r = this.calculations.results;

    this.drawPoint(r.M0, this.colors.M0, 'M₀', 7, false);
    this.drawPoint(r.Mc, this.colors.Mc, 'Mc', 7, false);
    this.drawPoint(r.A, this.colors.A, 'A', 6, false);
    if (r.C) {
      this.drawPoint(r.C, this.colors.C, 'C', 6, false);
    }
    this.drawPoint(r.F, this.colors.F, 'F', 6, false);
    this.drawPoint(r.Omega, this.colors.Omega, 'Ω', 5, false);

    if (r.MInf) {
      this.drawPoint(r.MInf, this.colors.MInf, 'M∞', 6, false);
    }

    if (r.Mn) {
      this.drawPoint(r.Mn, r.Mn.color || '#28a745', 'Mn', 6, false);
    }

    if (r.MTmax) {
      this.drawPoint(r.MTmax, r.MTmax.color, r.MTmax.label, 6, false);
    }

    var M = this.calculations.findPointForSlip(this.currentSlip);
    this.drawPoint(M, this.colors.currentPoint, 'M', 9, true);
  };

  CircleDiagramRenderer.prototype.drawPoint = function (point, color, label, size, highlight) {
    var ctx = this.ctx;
    var screen = this.worldToScreen(point.x, point.y);

    if (highlight) {
      ctx.fillStyle = color + '40';
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, size + 4, 0, 2 * Math.PI);
      ctx.fill();
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, size, 0, 2 * Math.PI);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (label) {
      ctx.fillStyle = '#333333';
      ctx.font = 'bold 13px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(label, screen.x + size + 5, screen.y - size);
    }
  };

  CircleDiagramRenderer.prototype.drawLine = function (p1, p2, color, width, dash) {
    var ctx = this.ctx;
    var s1 = this.worldToScreen(p1.x, p1.y);
    var s2 = this.worldToScreen(p2.x, p2.y);

    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash || []);

    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.lineTo(s2.x, s2.y);
    ctx.stroke();

    ctx.setLineDash([]);
  };

  CircleDiagramRenderer.prototype.drawLabels = function () {
    var ctx = this.ctx;

    ctx.fillStyle = '#333333';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Circle Diagram - Asynchronous Machine', this.displayWidth / 2, 30);
  };

  CircleDiagramRenderer.prototype.drawSlipIndicator = function () {
    var ctx = this.ctx;

    // Calculer la vraie valeur d'intersection géométrique du slip
    var slipPercent = '';
    var aPerpSegment = this.computeAPerpSegment && this.computeAPerpSegment();
    var m0SlipIntersection = aPerpSegment && this.computeM0SlipIntersection(aPerpSegment);
    if (m0SlipIntersection && typeof m0SlipIntersection.gValue === 'number') {
      slipPercent = (m0SlipIntersection.gValue * 100).toFixed(2);
    } else {
      slipPercent = '0.00';
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(10, 10, 180, 60);
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 1;
    ctx.strokeRect(10, 10, 180, 60);

    ctx.fillStyle = '#333333';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Slip (g) (intersection M₀M):', 20, 30);

    ctx.font = 'bold 20px Arial';
    ctx.fillStyle = this.colors.currentPoint;
    ctx.fillText(slipPercent + ' %', 20, 55);
  };

  CircleDiagramRenderer.prototype.updateDisplayValues = function () {
    if (!this.calculations) return;

    var M = this.calculations.findPointForSlip(this.currentSlip);
    var results = this.calculations.calculateForPointM(M.x, M.y);

    this.calculations.updateDisplay(results);
    this.updateDashboard(results);
  };

  CircleDiagramRenderer.prototype.updateDashboard = function (results) {
    var d = this.calculations.inputData;
    var r = this.calculations.results;

    var nominalSpeed = d.Ns * 2 * Math.PI / 60;
    var nominalTorque = nominalSpeed > 0 ? d.Pn / nominalSpeed : 0;

    var currentPercent = d.In > 0 ? (results.I1 / d.In) * 100 : 0;
    var powerPercent = d.Pn > 0 ? (results.powers.Pu / d.Pn) * 100 : 0;
    var torquePercent = nominalTorque > 0 ? (results.performance.Tu / nominalTorque) * 100 : 0;
    var speedPercent = r.ns > 0 ? (results.n / r.ns) * 100 : 0;

    var dashCurrentEl = document.getElementById('dashboard-current');
    var dashPowerEl = document.getElementById('dashboard-power');
    var dashTorqueEl = document.getElementById('dashboard-torque');
    var dashSpeedEl = document.getElementById('dashboard-speed');

    if (dashCurrentEl) dashCurrentEl.textContent = currentPercent.toFixed(1) + '%';
    if (dashPowerEl) dashPowerEl.textContent = powerPercent.toFixed(1) + '%';
    if (dashTorqueEl) dashTorqueEl.textContent = torquePercent.toFixed(1) + '%';
    if (dashSpeedEl) dashSpeedEl.textContent = speedPercent.toFixed(1) + '%';

    var circumference = 263.89;

    var currentRing = document.getElementById('gauge-current-ring');
    var powerRing = document.getElementById('gauge-power-ring');
    var torqueRing = document.getElementById('gauge-torque-ring');
    var speedRing = document.getElementById('gauge-speed-ring');

    var currentOffset = circumference - (Math.min(currentPercent, 100) / 100) * circumference;
    var powerOffset = circumference - (Math.min(powerPercent, 100) / 100) * circumference;
    var torqueOffset = circumference - (Math.min(torquePercent, 100) / 100) * circumference;
    var speedOffset = circumference - (Math.min(speedPercent, 100) / 100) * circumference;

    if (currentRing) currentRing.style.strokeDashoffset = currentOffset;
    if (powerRing) powerRing.style.strokeDashoffset = powerOffset;
    if (torqueRing) torqueRing.style.strokeDashoffset = torqueOffset;
    if (speedRing) speedRing.style.strokeDashoffset = speedOffset;

    var dashboard = document.getElementById('motorDashboard');
    if (dashboard) dashboard.style.display = 'block';
  };

  CircleDiagramRenderer.prototype.setCalculations = function (calculations) {
    this.calculations = calculations;

    // Calculate nominal slip from rated speed
    var d = calculations.inputData;
    var r = calculations.results;
    var nominalSlip = 0.04; // fallback

    if (d && r && r.ns > 0 && d.Ns > 0) {
      nominalSlip = (r.ns - d.Ns) / r.ns;
      nominalSlip = Math.max(0, Math.min(1, nominalSlip));
    }

    this.currentSlip = nominalSlip;
    this.isDraggingAPerpHandle = false;
    this.recomputeAPerpConstraints();
  };

  CircleDiagramRenderer.prototype.setCharacteristics = function (characteristics) {
    this.characteristics = characteristics;
  };

  CircleDiagramRenderer.prototype.render = function () {
    this.draw();
    this.updateDisplayValues();
  };

  CircleDiagramRenderer.prototype.resize = function () {
    this.setupCanvas();
    this.draw();
  };

  CircleDiagramRenderer.prototype.zoomIn = function () {
    this.scale = Math.min(this.scale * 1.2, 5);
    this.draw();
  };

  CircleDiagramRenderer.prototype.zoomOut = function () {
    this.scale = Math.max(this.scale / 1.2, 0.2);
    this.draw();
  };

  CircleDiagramRenderer.prototype.resetZoom = function () {
    this.resetView();
    this.draw();
  };

  CircleDiagramRenderer.prototype.toggleSlipSegment = function (forceState) {
    var nextState = typeof forceState === 'boolean' ? forceState : !this.showSlipSegment;
    this.showSlipSegment = nextState;
    this.draw();
    return this.showSlipSegment;
  };

  CircleDiagramRenderer.prototype.toggleLegend = function (forceState) {
    var nextState = typeof forceState === 'boolean' ? forceState : !this.showLegend;
    this.showLegend = nextState;
    this.draw();
    return this.showLegend;
  };

  CircleDiagramRenderer.prototype.exportImage = function () {
    return this.canvas.toDataURL('image/png');
  };

  return CircleDiagramRenderer;
})();

// ============================================
// Global variables and initialization
// ============================================

var diagramRenderer = null;
var motorCalculations = null;
var characteristicsRenderer = null;

function setDrawButtonLoadingState(isLoading) {
  var drawButton = document.getElementById('drawButton');
  if (!drawButton) return;
  var label = drawButton.querySelector('.draw-label');
  drawButton.disabled = isLoading;
  drawButton.classList.toggle('is-loading', isLoading);
  if (label) {
    label.textContent = isLoading ? 'Calcul en cours...' : 'Draw the Circle Diagram';
  }
}

// ============================================
// Main draw function
// ============================================

function handleDrawDiagram() {
  console.log('Draw button clicked!');

  setDrawButtonLoadingState(true);

  try {
    // Initialize calculations
    motorCalculations = new MotorCalculations();
    motorCalculations.getInputData();
    motorCalculations.calculateInitialParameters();
    motorCalculations.calculateCircleGeometry();

    // Initialize diagram renderer
    if (!diagramRenderer) {
      diagramRenderer = new CircleDiagramRenderer('circleDiagramCanvas');
    }
    diagramRenderer.setCalculations(motorCalculations);
    diagramRenderer.resetView(true);

    // Initialize characteristics renderer
    if (!characteristicsRenderer) {
      characteristicsRenderer = new CharacteristicsRenderer();
      characteristicsRenderer.init();
    }

    // Generate curve data
    var curveData = motorCalculations.generateCharacteristicData(100);
    characteristicsRenderer.setData(curveData);
    characteristicsRenderer.setCurrentSlip(diagramRenderer.currentSlip);

    // Link them together
    diagramRenderer.setCharacteristics(characteristicsRenderer);

    // Render everything
    diagramRenderer.render();
    characteristicsRenderer.drawAll();

    // Show success message
    showNotification('The diagram has been successfully drawn!', 'success');

  } catch (error) {
    console.error('Error drawing diagram:', error);
    showNotification('Error: ' + error.message, 'error');
  } finally {
    setDrawButtonLoadingState(false);
  }
}

// ============================================
// Notification helper
// ============================================

function showNotification(message, type) {
  var existing = document.querySelector('.notification');
  if (existing) {
    existing.remove();
  }

  var notification = document.createElement('div');
  notification.className = 'notification';
  notification.style.cssText = 'position: fixed; top: 120px; right: 20px; padding: 16px 24px; border-radius: 12px; color: white; font-family: "Satoshi-Bold", sans-serif; z-index: 9999; animation: slideIn 0.3s ease;';

  if (type === 'success') {
    notification.style.background = 'linear-gradient(to right, #00cc66, #00aa55)';
  } else {
    notification.style.background = 'linear-gradient(to right, #F6192B, #FE6743)';
  }

  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(function () {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(function () {
      notification.remove();
    }, 300);
  }, 3000);
}

// ============================================
// Initialize when DOM is ready
// ============================================

document.addEventListener('DOMContentLoaded', function () {
  console.log('Circle Diagram Application initialized');

  var drawButton = document.getElementById('drawButton');
  if (drawButton) {
    drawButton.addEventListener('click', handleDrawDiagram);
    console.log('Draw button event listener attached');
  } else {
    console.error('Draw button not found!');
  }

  var zoomInBtn = document.getElementById('zoomInBtn');
  var zoomOutBtn = document.getElementById('zoomOutBtn');
  var toggleSlipSegmentBtn = document.getElementById('toggleSlipSegmentBtn');
  var mainHeader = document.querySelector('.main-header');
  var hoverZones = [
    document.querySelector('.plotting'),
    document.querySelector('.curves-section')
  ].filter(Boolean);

  if (zoomInBtn) {
    zoomInBtn.addEventListener('click', function () {
      if (diagramRenderer) diagramRenderer.zoomIn();
    });
  }

  if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', function () {
      if (diagramRenderer) diagramRenderer.zoomOut();
    });
  }

  if (toggleSlipSegmentBtn) {
    var updateSlipButtonState = function (isVisible) {
      toggleSlipSegmentBtn.textContent = isVisible ? '👁‍🗨 Slip' : '🚫 Slip';
      toggleSlipSegmentBtn.title = isVisible
        ? 'Masquer le Slip Segment et les droites associées'
        : 'Afficher le Slip Segment et les droites associées';
      toggleSlipSegmentBtn.style.background = isVisible ? '#111111' : '#e0e0e0';
      toggleSlipSegmentBtn.style.color = isVisible ? '#ffffff' : '#222222';
    };

    updateSlipButtonState(true);

    toggleSlipSegmentBtn.addEventListener('click', function () {
      if (!diagramRenderer) return;
      var visible = diagramRenderer.toggleSlipSegment();
      updateSlipButtonState(visible);
    });
  }

  var toggleLegendBtn = document.getElementById('toggleLegendBtn');
  if (toggleLegendBtn) {
    var updateLegendButtonState = function (isVisible) {
      toggleLegendBtn.textContent = isVisible ? '👁‍🗨 Legend' : '🚫 Legend';
      toggleLegendBtn.title = isVisible
        ? 'Masquer la légende'
        : 'Afficher la légende';
      toggleLegendBtn.style.background = isVisible ? '#111111' : '#e0e0e0';
      toggleLegendBtn.style.color = isVisible ? '#ffffff' : '#222222';
    };

    // Initialize state
    updateLegendButtonState(true);

    toggleLegendBtn.addEventListener('click', function () {
      if (!diagramRenderer) return;
      var visible = diagramRenderer.toggleLegend();
      updateLegendButtonState(visible);
    });
  }

  // Handle Resistive Torque Input
  var plotResistiveTorqueBtn = document.getElementById('plotResistiveTorqueBtn');
  var resistiveTorqueInput = document.getElementById('resistiveTorqueInput');
  var resistiveTorqueError = document.getElementById('resistiveTorqueError');

  if (plotResistiveTorqueBtn && resistiveTorqueInput) {
    plotResistiveTorqueBtn.addEventListener('click', function () {
      var expr = resistiveTorqueInput.value.trim();



      // Broad validation: Allow numbers, N, basic math chars
      // Added some math functions support just in case, but restriction is requested.
      // Requested: "seuls les caractères numériques, la lettre N (majuscule), les opérateurs + et −, ainsi que les opérations mathématiques de base"
      // I'll stick to basic operators + - * / ( ) . and N
      var regex = /^[0-9N\+\-\*\/\(\)\.\s]+$/;

      if (!regex.test(expr)) {
        if (resistiveTorqueError) resistiveTorqueError.textContent = "Format invalide. Utilisez uniquement chiffres, N, +, -, *, /, (, ).";
        return;
      }

      if (resistiveTorqueError) resistiveTorqueError.textContent = "";

      if (characteristicsRenderer) {
        characteristicsRenderer.setResistiveTorqueFormula(expr);

        // Calculate intersection
        var newSlip = characteristicsRenderer.calculateOperatingPointIntersection();

        if (newSlip !== null) {
          // Update global operating point
          newSlip = Math.max(0, Math.min(1, newSlip));

          if (diagramRenderer) {
            diagramRenderer.currentSlip = newSlip;
            diagramRenderer.draw();
            diagramRenderer.updateDisplayValues();
          }

          characteristicsRenderer.setCurrentSlip(newSlip);
          characteristicsRenderer.drawAll();

          if (typeof showNotification === 'function') {
            showNotification("Point de fonctionnement trouvé: g = " + (newSlip * 100).toFixed(2) + "%", "success");
          }
        } else {
          characteristicsRenderer.drawAll(); // Draw curve even if no intersection or error
          if (typeof showNotification === 'function') {
            showNotification("Courbe tracée, mais pas d'intersection trouvée dans la plage utile.", "warning");
          }
        }
      }
    });
  }

  if (mainHeader && hoverZones.length) {
    var applyHeaderVisibility = function (shouldHide) {
      if (shouldHide) {
        mainHeader.classList.add('header-hidden');
      } else {
        mainHeader.classList.remove('header-hidden');
      }
    };

    if ('IntersectionObserver' in window) {
      var visibleZones = new Set();
      var headerObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            visibleZones.add(entry.target);
          } else {
            visibleZones.delete(entry.target);
          }
        });
        applyHeaderVisibility(visibleZones.size > 0);
      }, { threshold: 0.2 });

      hoverZones.forEach(function (zone) {
        headerObserver.observe(zone);
      });
    } else {
      var checkHeaderVisibility = function () {
        var shouldHide = hoverZones.some(function (zone) {
          var rect = zone.getBoundingClientRect();
          return rect.top < window.innerHeight && rect.bottom > 0;
        });
        applyHeaderVisibility(shouldHide);
      };
      window.addEventListener('scroll', checkHeaderVisibility);
      checkHeaderVisibility();
    }
  }

  var resizeTimeout;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(function () {
      if (diagramRenderer) {
        diagramRenderer.resize();
      }
      if (characteristicsRenderer) {
        characteristicsRenderer.drawAll();
      }
    }, 100);
  });

  var pointShortcuts = document.getElementById('pointShortcuts');
  if (pointShortcuts) {
    pointShortcuts.addEventListener('click', function (e) {
      var btn = e.target.closest('.point-shortcut');
      if (!btn) return;
      var target = btn.getAttribute('data-point-target');
      if (!target) return;
      if (diagramRenderer && typeof diagramRenderer.setOperatingPoint === 'function') {
        diagramRenderer.setOperatingPoint(target);
      } else {
        console.warn('Diagram renderer not ready for point shortcuts');
      }
    });
  }
});
