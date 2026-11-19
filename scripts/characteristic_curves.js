// ============================================
// characteristic_curves.js - Characteristic Curves Renderer
// Plots all motor characteristic curves
// ============================================

var CharacteristicsRenderer = (function () {

  function CharacteristicsRenderer() {
    this.canvases = {};
    this.contexts = {};
    this.data = null;
    this.currentSlip = 0.04;
    this.displayWidth = 400;
    this.displayHeight = 300;

    this.colors = {
      curve: '#F6192B',
      grid: '#e5e5e5',
      axis: '#333',
      marker: '#0066cc',
      fill: 'rgba(246, 25, 43, 0.1)'
    };
    this.resistiveTorqueFormula = null;
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  CharacteristicsRenderer.prototype.init = function () {
    var canvasIds = [
      'graph-torque-speed',
      'graph-torque-slip',
      'graph-current-slip',
      'graph-current-power',
      'graph-pf-power',
      'graph-pf-slip',
      'graph-pf-slip',
      'graph-efficiency-slip',
      'graph-useful-torque-slip'
    ];

    for (var i = 0; i < canvasIds.length; i++) {
      var id = canvasIds[i];
      var canvas = document.getElementById(id);
      if (canvas) {
        this.canvases[id] = canvas;
        this.contexts[id] = canvas.getContext('2d');
        this.resizeCanvas(canvas);
      }
    }
  };

  CharacteristicsRenderer.prototype.resizeCanvas = function (canvas) {
    var container = canvas.parentElement;
    if (!container) return;

    var rect = container.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';

    this.displayWidth = rect.width;
    this.displayHeight = rect.height;
  };

  // ============================================
  // DATA MANAGEMENT
  // ============================================

  CharacteristicsRenderer.prototype.setData = function (data) {
    this.data = data;
  };

  CharacteristicsRenderer.prototype.setCurrentSlip = function (slip) {
    this.currentSlip = slip;
  };

  CharacteristicsRenderer.prototype.setResistiveTorqueFormula = function (formula) {
    this.resistiveTorqueFormula = formula;
  };

  CharacteristicsRenderer.prototype.calculateOperatingPointIntersection = function () {
    if (!this.data || !this.resistiveTorqueFormula) return null;

    var xData = this.data.speed;
    var yData = this.data.torque;
    var ns = xData[0]; // Assuming g=0 is first point

    try {
      var formula = this.resistiveTorqueFormula;
      var prevDiff = 0;

      for (var i = 0; i < xData.length; i++) {
        var N = xData[i];
        var expr = formula.replace(/N/g, '(' + N + ')');
        var Tr = new Function('return ' + expr)();
        var Tu = yData[i];

        var diff = Tu - Tr;

        if (i > 0) {
          if (prevDiff * diff <= 0) { // Intersection found
            // Linear interpolation
            var fraction = Math.abs(prevDiff) / (Math.abs(prevDiff) + Math.abs(diff));
            var N_op = xData[i - 1] + fraction * (xData[i] - xData[i - 1]);

            if (ns > 0) {
              return (ns - N_op) / ns; // Return slip
            }
          }
        }
        prevDiff = diff;
      }
    } catch (e) {
      console.error("Intersection calculation error", e);
    }
    return null;
  };

  // ============================================
  // DRAW ALL CURVES
  // ============================================

  CharacteristicsRenderer.prototype.drawAll = function () {
    if (!this.data) return;

    this.drawTorqueSpeed();
    this.drawTorqueSlip();
    this.drawCurrentSlip();
    this.drawCurrentPower();
    this.drawPowerFactorPower();
    this.drawPowerFactorSlip();
    this.drawEfficiencySlip();
    this.drawUsefulTorqueSlip();
  };

  // ============================================
  // TORQUE vs SPEED
  // ============================================

  CharacteristicsRenderer.prototype.drawTorqueSpeed = function () {
    var canvas = this.canvases['graph-torque-speed'];
    var ctx = this.contexts['graph-torque-speed'];
    if (!canvas || !ctx) return;

    this.resizeCanvas(canvas);
    var w = this.displayWidth;
    var h = this.displayHeight;

    ctx.clearRect(0, 0, w, h);

    var xData = this.data.speed;
    var yData = this.data.torque;

    var xMin = 0;
    var xMax = Math.max.apply(null, xData);
    var yMin = 0;
    var yMax = Math.max.apply(null, yData) * 1.15;

    this.drawAxesAndGrid(ctx, w, h, xMin, xMax, yMin, yMax, 'Speed (rpm)', 'Torque (N·m)');
    this.drawCurve(ctx, w, h, xData, yData, xMin, xMax, yMin, yMax, this.colors.curve, 3);

    var currentIdx = Math.round(this.currentSlip * (xData.length - 1));
    this.drawMarker(ctx, w, h, xData[currentIdx], yData[currentIdx], xMin, xMax, yMin, yMax, null);

    this.drawTitle(ctx, w, 'Mechanical Characteristic T(n)');
  };

  // ============================================
  // TORQUE vs SLIP
  // ============================================

  CharacteristicsRenderer.prototype.drawTorqueSlip = function () {
    var canvas = this.canvases['graph-torque-slip'];
    var ctx = this.contexts['graph-torque-slip'];
    if (!canvas || !ctx) return;

    this.resizeCanvas(canvas);
    var w = this.displayWidth;
    var h = this.displayHeight;

    ctx.clearRect(0, 0, w, h);

    var xData = this.data.slip;
    var yData = this.data.torque;

    var xMin = 0;
    var xMax = 100;
    var yMin = 0;
    var yMax = Math.max.apply(null, yData) * 1.15;

    this.drawAxesAndGrid(ctx, w, h, xMin, xMax, yMin, yMax, 'Slip (%)', 'Torque (N·m)');
    this.drawCurve(ctx, w, h, xData, yData, xMin, xMax, yMin, yMax, this.colors.curve, 3);

    var currentX = this.currentSlip * 100;
    var currentIdx = Math.round(this.currentSlip * (xData.length - 1));
    this.drawMarker(ctx, w, h, currentX, yData[currentIdx], xMin, xMax, yMin, yMax, null);

    this.drawTitle(ctx, w, 'Torque vs Slip T(s)');
  };

  // ============================================
  // CURRENT vs SLIP
  // ============================================

  CharacteristicsRenderer.prototype.drawCurrentSlip = function () {
    var canvas = this.canvases['graph-current-slip'];
    var ctx = this.contexts['graph-current-slip'];
    if (!canvas || !ctx) return;

    this.resizeCanvas(canvas);
    var w = this.displayWidth;
    var h = this.displayHeight;

    ctx.clearRect(0, 0, w, h);

    var xData = this.data.slip;
    var yData = this.data.current;

    var xMin = 0;
    var xMax = 100;
    var yMin = 0;
    var yMax = Math.max.apply(null, yData) * 1.15;

    this.drawAxesAndGrid(ctx, w, h, xMin, xMax, yMin, yMax, 'Slip (%)', 'Current (A)');
    this.drawCurve(ctx, w, h, xData, yData, xMin, xMax, yMin, yMax, this.colors.curve, 3);

    var currentX = this.currentSlip * 100;
    var currentIdx = Math.round(this.currentSlip * (xData.length - 1));
    this.drawMarker(ctx, w, h, currentX, yData[currentIdx], xMin, xMax, yMin, yMax, null);

    this.drawTitle(ctx, w, 'Current vs Slip I(s)');
  };

  // ============================================
  // CURRENT vs POWER
  // ============================================

  CharacteristicsRenderer.prototype.drawCurrentPower = function () {
    var canvas = this.canvases['graph-current-power'];
    var ctx = this.contexts['graph-current-power'];
    if (!canvas || !ctx) return;

    this.resizeCanvas(canvas);
    var w = this.displayWidth;
    var h = this.displayHeight;

    ctx.clearRect(0, 0, w, h);

    var xData = this.data.usefulPower;
    var yData = this.data.current;

    var xMin = 0;
    var xMax = Math.max.apply(null, xData) * 1.1;
    var yMin = 0;
    var yMax = Math.max.apply(null, yData) * 1.15;

    this.drawAxesAndGrid(ctx, w, h, xMin, xMax, yMin, yMax, 'Useful Power (kW)', 'Current (A)');
    this.drawCurve(ctx, w, h, xData, yData, xMin, xMax, yMin, yMax, this.colors.curve, 3);

    var currentIdx = Math.round(this.currentSlip * (xData.length - 1));
    this.drawMarker(ctx, w, h, xData[currentIdx], yData[currentIdx], xMin, xMax, yMin, yMax, null);

    this.drawTitle(ctx, w, 'Current vs Useful Power I(Pu)');
  };

  // ============================================
  // POWER FACTOR vs POWER
  // ============================================

  CharacteristicsRenderer.prototype.drawPowerFactorPower = function () {
    var canvas = this.canvases['graph-pf-power'];
    var ctx = this.contexts['graph-pf-power'];
    if (!canvas || !ctx) return;

    this.resizeCanvas(canvas);
    var w = this.displayWidth;
    var h = this.displayHeight;

    ctx.clearRect(0, 0, w, h);

    var xData = this.data.usefulPower;
    var yData = this.data.efficiency;

    var xMin = 0;
    var xMax = Math.max.apply(null, xData) * 1.1;
    var yMin = 0;
    var yMax = 100;

    this.drawAxesAndGrid(ctx, w, h, xMin, xMax, yMin, yMax, 'Useful Power (kW)', 'Efficiency (%)');

    // Suggestion: Fill under curve for efficiency for better look (optional, but consistent with other eta graph)
    this.fillUnderCurve(ctx, w, h, xData, yData, xMin, xMax, yMin, yMax);

    this.drawCurve(ctx, w, h, xData, yData, xMin, xMax, yMin, yMax, this.colors.curve, 3);

    var currentIdx = Math.round(this.currentSlip * (xData.length - 1));
    this.drawMarker(ctx, w, h, xData[currentIdx], yData[currentIdx], xMin, xMax, yMin, yMax, null);

    this.drawTitle(ctx, w, 'Efficiency vs Useful Power η(Pu)');
  };

  // ============================================
  // POWER FACTOR vs SLIP
  // ============================================

  CharacteristicsRenderer.prototype.drawPowerFactorSlip = function () {
    var canvas = this.canvases['graph-pf-slip'];
    var ctx = this.contexts['graph-pf-slip'];
    if (!canvas || !ctx) return;

    this.resizeCanvas(canvas);
    var w = this.displayWidth;
    var h = this.displayHeight;

    ctx.clearRect(0, 0, w, h);

    var xData = this.data.slip;
    var yData = this.data.powerFactor;

    var xMin = 0;
    var xMax = 100;
    var yMin = 0;
    var yMax = 1;

    this.drawAxesAndGrid(ctx, w, h, xMin, xMax, yMin, yMax, 'Slip (%)', 'Power Factor');
    this.drawCurve(ctx, w, h, xData, yData, xMin, xMax, yMin, yMax, this.colors.curve, 3);

    var currentX = this.currentSlip * 100;
    var currentIdx = Math.round(this.currentSlip * (xData.length - 1));
    this.drawMarker(ctx, w, h, currentX, yData[currentIdx], xMin, xMax, yMin, yMax, null);

    this.drawTitle(ctx, w, 'Power Factor cos φ(s)');
  };

  // ============================================
  // EFFICIENCY vs SLIP
  // ============================================

  CharacteristicsRenderer.prototype.drawEfficiencySlip = function () {
    var canvas = this.canvases['graph-efficiency-slip'];
    var ctx = this.contexts['graph-efficiency-slip'];
    if (!canvas || !ctx) return;

    this.resizeCanvas(canvas);
    var w = this.displayWidth;
    var h = this.displayHeight;

    ctx.clearRect(0, 0, w, h);

    var xData = this.data.slip;
    var yData = this.data.efficiency;

    var xMin = 0;
    var xMax = 100;
    var yMin = 0;
    var yMax = 100;

    this.drawAxesAndGrid(ctx, w, h, xMin, xMax, yMin, yMax, 'Slip (%)', 'Efficiency (%)');

    // Fill area under curve
    this.fillUnderCurve(ctx, w, h, xData, yData, xMin, xMax, yMin, yMax);

    // Draw curve
    this.drawCurve(ctx, w, h, xData, yData, xMin, xMax, yMin, yMax, this.colors.curve, 3);

    var currentX = this.currentSlip * 100;
    var currentIdx = Math.round(this.currentSlip * (xData.length - 1));
    this.drawMarker(ctx, w, h, currentX, yData[currentIdx], xMin, xMax, yMin, yMax, null);

    // Find and mark maximum efficiency
    var maxEff = Math.max.apply(null, yData);
    var maxIdx = yData.indexOf(maxEff);
    this.drawMarker(ctx, w, h, xData[maxIdx], yData[maxIdx], xMin, xMax, yMin, yMax, '#00cc66');

    this.drawTitle(ctx, w, 'Efficiency vs Slip η(s)');

  };

  // ============================================
  // USEFUL TORQUE vs SLIP (Requested by User)
  // ============================================

  CharacteristicsRenderer.prototype.drawUsefulTorqueSlip = function () {
    var canvas = this.canvases['graph-useful-torque-slip'];
    var ctx = this.contexts['graph-useful-torque-slip'];
    if (!canvas || !ctx) return;

    this.resizeCanvas(canvas);
    var w = this.displayWidth;
    var h = this.displayHeight;

    ctx.clearRect(0, 0, w, h);

    // Use Speed vs Torque data instead of Slip vs UsefulTorque
    var xData = this.data.speed;
    var yData = this.data.torque;

    var xMin = 0;
    var xMax = Math.max.apply(null, xData);
    var yMin = 0;
    var yMax = Math.max.apply(null, yData) * 1.15;

    // ----- RESISTIVE TORQUE PLOTTING -----
    var resistiveData = [];
    if (this.resistiveTorqueFormula) {
      try {
        var formula = this.resistiveTorqueFormula;
        for (var i = 0; i < xData.length; i++) {
          var N = xData[i];
          var expr = formula.replace(/N/g, '(' + N + ')');
          var Tr = new Function('return ' + expr)();
          resistiveData.push(Tr);
          yMax = Math.max(yMax, Tr * 1.05);
        }
      } catch (e) { console.warn("Plot error", e); }
    }

    // Draw axes and grid
    this.drawAxesAndGrid(ctx, w, h, xMin, xMax, yMin, yMax, 'Speed (rpm)', 'Torque (N·m)');

    // Draw Tu curve
    this.drawCurve(ctx, w, h, xData, yData, xMin, xMax, yMin, yMax, this.colors.curve, 3);

    // Draw Tr curve if exists
    if (resistiveData.length > 0) {
      this.drawCurve(ctx, w, h, xData, resistiveData, xMin, xMax, yMin, yMax, '#00cc66', 3); // Green line

      // Mark intersection if operating point matches current slip?
      // We just draw the current operating point marker as usual.
      this.drawTitle(ctx, w, 'Intersection Tu(N) and Tr(N)');
    } else {
      this.drawTitle(ctx, w, 'Mechanical Characteristic T(n)');
    }

    // Draw marker for current point (using current slip to find index)
    var currentIdx = Math.round(this.currentSlip * (xData.length - 1));
    this.drawMarker(ctx, w, h, xData[currentIdx], yData[currentIdx], xMin, xMax, yMin, yMax, null);
  };

  // ============================================
  // UTILITY: DRAW AXES AND GRID
  // ============================================

  CharacteristicsRenderer.prototype.drawAxesAndGrid = function (ctx, w, h, xMin, xMax, yMin, yMax, xLabel, yLabel) {
    var margin = { left: 60, right: 20, top: 40, bottom: 50 };
    var plotW = w - margin.left - margin.right;
    var plotH = h - margin.top - margin.bottom;

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = this.colors.grid;
    ctx.lineWidth = 1;

    var xSteps = 5;
    var ySteps = 5;

    for (var i = 0; i <= xSteps; i++) {
      var x = margin.left + (i / xSteps) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, margin.top);
      ctx.lineTo(x, margin.top + plotH);
      ctx.stroke();
    }

    for (var j = 0; j <= ySteps; j++) {
      var y = margin.top + plotH - (j / ySteps) * plotH;
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(margin.left + plotW, y);
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = this.colors.axis;
    ctx.lineWidth = 2;

    // X-axis
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top + plotH);
    ctx.lineTo(margin.left + plotW, margin.top + plotH);
    ctx.stroke();

    // Y-axis
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, margin.top + plotH);
    ctx.stroke();

    // Labels
    ctx.fillStyle = this.colors.axis;
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';

    // X-axis labels
    for (var k = 0; k <= xSteps; k++) {
      var xPos = margin.left + (k / xSteps) * plotW;
      var val = xMin + (k / xSteps) * (xMax - xMin);
      ctx.fillText(val.toFixed(0), xPos, margin.top + plotH + 20);
    }

    // Y-axis labels
    ctx.textAlign = 'right';
    for (var l = 0; l <= ySteps; l++) {
      var yPos = margin.top + plotH - (l / ySteps) * plotH;
      var valY = yMin + (l / ySteps) * (yMax - yMin);
      ctx.fillText(valY.toFixed(1), margin.left - 10, yPos + 4);
    }

    // Axis titles
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(xLabel, margin.left + plotW / 2, h - 10);

    ctx.save();
    ctx.translate(15, margin.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
  };

  // ============================================
  // UTILITY: DRAW CURVE
  // ============================================

  CharacteristicsRenderer.prototype.drawCurve = function (ctx, w, h, xData, yData, xMin, xMax, yMin, yMax, color, lineWidth) {
    var margin = { left: 60, right: 20, top: 40, bottom: 50 };
    var plotW = w - margin.left - margin.right;
    var plotH = h - margin.top - margin.bottom;

    function toScreenX(x) {
      return margin.left + ((x - xMin) / (xMax - xMin)) * plotW;
    }
    function toScreenY(y) {
      return margin.top + plotH - ((y - yMin) / (yMax - yMin)) * plotH;
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.beginPath();
    for (var i = 0; i < xData.length; i++) {
      var sx = toScreenX(xData[i]);
      var sy = toScreenY(yData[i]);

      if (i === 0) {
        ctx.moveTo(sx, sy);
      } else {
        ctx.lineTo(sx, sy);
      }
    }
    ctx.stroke();
  };

  // ============================================
  // UTILITY: FILL UNDER CURVE
  // ============================================

  CharacteristicsRenderer.prototype.fillUnderCurve = function (ctx, w, h, xData, yData, xMin, xMax, yMin, yMax) {
    var margin = { left: 60, right: 20, top: 40, bottom: 50 };
    var plotW = w - margin.left - margin.right;
    var plotH = h - margin.top - margin.bottom;

    function toScreenX(x) {
      return margin.left + ((x - xMin) / (xMax - xMin)) * plotW;
    }
    function toScreenY(y) {
      return margin.top + plotH - ((y - yMin) / (yMax - yMin)) * plotH;
    }

    ctx.fillStyle = this.colors.fill;

    ctx.beginPath();
    ctx.moveTo(toScreenX(xData[0]), toScreenY(yMin));

    for (var i = 0; i < xData.length; i++) {
      ctx.lineTo(toScreenX(xData[i]), toScreenY(yData[i]));
    }

    ctx.lineTo(toScreenX(xData[xData.length - 1]), toScreenY(yMin));
    ctx.closePath();
    ctx.fill();
  };

  // ============================================
  // UTILITY: DRAW MARKER
  // ============================================

  CharacteristicsRenderer.prototype.drawMarker = function (ctx, w, h, x, y, xMin, xMax, yMin, yMax, color) {
    var margin = { left: 60, right: 20, top: 40, bottom: 50 };
    var plotW = w - margin.left - margin.right;
    var plotH = h - margin.top - margin.bottom;

    var sx = margin.left + ((x - xMin) / (xMax - xMin)) * plotW;
    var sy = margin.top + plotH - ((y - yMin) / (yMax - yMin)) * plotH;

    // Vertical line
    ctx.strokeStyle = color || this.colors.marker;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(sx, margin.top);
    ctx.lineTo(sx, margin.top + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    // Marker circle
    ctx.fillStyle = color || this.colors.marker;
    ctx.beginPath();
    ctx.arc(sx, sy, 6, 0, 2 * Math.PI);
    ctx.fill();

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  // ============================================
  // UTILITY: DRAW TITLE
  // ============================================

  CharacteristicsRenderer.prototype.drawTitle = function (ctx, w, title) {
    ctx.fillStyle = '#333';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(title, w / 2, 20);
  };

  return CharacteristicsRenderer;
})();
