// ============================================
// circle_calculations.js - Motor Calculations for Circle Diagram
// All mathematical calculations and geometry
// FIXED: Center on AF, correct N/L/K/H points, power from distances
// ============================================

class MotorCalculations {
  constructor() {
    this.inputData = {};
    this.results = {};
  }

  // ============================================
  // INPUT DATA COLLECTION
  // ============================================

  getInputData() {
    // Motor Nameplate Data
    this.inputData.Vn = this.getFloatValue('rated_voltage');
    this.inputData.In = this.getFloatValue('rated_current');
    this.inputData.Pn = this.getFloatValue('rated_power') * 1000; // kW to W
    this.inputData.f = this.getFloatValue('rated_frequency');
    this.inputData.Ns = this.getFloatValue('rated_speed');
    this.inputData.Ns_sync = this.getNearestSynchronousSpeed(this.inputData.Ns, this.inputData.f);
    this.inputData.connection = document.getElementById('winding_connection')?.value || 'star';

    // Calculate number of pole pairs from synchronous speed
    var syncReference = this.inputData.Ns_sync > 0 ? this.inputData.Ns_sync : this.inputData.Ns;
    var polesEstimate = syncReference > 0 ? (120 * this.inputData.f) / syncReference : 2;
    this.inputData.p = Math.max(1, Math.round(polesEstimate) / 2);
    if (this.inputData.p < 1) this.inputData.p = 1;
    this.inputData.poles = Math.round(this.inputData.p * 2);

    // No-Load Test Data
    this.inputData.V0 = this.getFloatValue('no_load_voltage');
    this.inputData.I0 = this.getFloatValue('no_load_current');
    this.inputData.P0 = this.getFloatValue('no_load_power') * 1000; // kW to W

    // Blocked Rotor Test Data (at reduced voltage)
    this.inputData.Vcc_prime = this.getFloatValue('blockedRotorVoltage');
    this.inputData.Icc_prime = this.getFloatValue('lockedRotorCurrent');
    this.inputData.Pcc_prime = this.getFloatValue('blockedRotorPower') * 1000; // kW to W

    // Stator Resistance - Direct input
    this.inputData.Rs = this.getFloatValue('statorResistance');
    if (this.inputData.Rs <= 0) {
      this.inputData.Rs = 0.5; // Default value if not provided
    }

    // Rotor Resistance - Direct input
    this.inputData.rotorResistance = this.getFloatValue('rotorResistanceInput');
    if (this.inputData.rotorResistance <= 0) {
      this.inputData.rotorResistance = 0.2; // Default value if not provided
    }

    this.inputData.m = 1; // Transformation ratio

    // Convert line currents to phase currents for delta connection
    // In delta: I_line = sqrt(3) * I_phase, so I_phase = I_line / sqrt(3)
    if (this.inputData.connection === 'delta') {
      this.inputData.I0 = this.inputData.I0 / Math.sqrt(3);
      this.inputData.Icc_prime = this.inputData.Icc_prime / Math.sqrt(3);
      this.inputData.In = this.inputData.In / Math.sqrt(3);
    }

    this.validateInputs();
  }

  getFloatValue(id) {
    var el = document.getElementById(id);
    if (!el) return 0;
    var val = parseFloat(el.value);
    return isNaN(val) ? 0 : val;
  }

  validateInputs() {
    var required = ['Vn', 'Pn', 'f', 'Ns', 'V0', 'I0', 'P0', 'Vcc_prime', 'Icc_prime', 'Pcc_prime'];
    var missing = [];
    for (var i = 0; i < required.length; i++) {
      var k = required[i];
      if (!this.inputData[k] || this.inputData[k] <= 0) {
        missing.push(k);
      }
    }

    if (missing.length > 0) {
      throw new Error('Missing or invalid data: ' + missing.join(', '));
    }

    if (this.inputData.I0 >= this.inputData.Icc_prime) {
      console.warn('Warning: I₀ should be less than Icc');
    }

    if (this.inputData.P0 >= this.inputData.Pcc_prime) {
      console.warn('Warning: P₀ should be less than Pcc');
    }
  }

  // ============================================
  // INITIAL PARAMETERS CALCULATION
  // ============================================

  calculateInitialParameters() {
    var d = this.inputData;
    var r = this.results;

    // Synchronous speed
    r.ns = d.Ns_sync > 0 ? d.Ns_sync : (120 * d.f) / (d.p * 2); // rpm
    r.ws = (2 * Math.PI * d.f) / d.p; // rad/s (mechanical)
    r.Omega_s = r.ws;

    // No-load calculations
    var S0 = Math.sqrt(3) * d.V0 * d.I0;
    r.cosphi0 = S0 > 0 ? d.P0 / S0 : 0.1;
    r.cosphi0 = Math.max(0.05, Math.min(0.99, r.cosphi0));
    r.phi0 = Math.acos(r.cosphi0);
    r.sinphi0 = Math.sin(r.phi0);

    // Short-circuit at reduced voltage - calculate regulated values at nominal voltage
    var ratio = d.Vn / d.Vcc_prime;
    r.Icc = d.Icc_prime * ratio;
    r.Pcc = d.Pcc_prime * ratio * ratio;
    r.Id = r.Icc;

    // Short-circuit power factor at nominal voltage
    var Scc = Math.sqrt(3) * d.Vn * r.Icc;
    r.cosphicc = Scc > 0 ? r.Pcc / Scc : 0.3;
    r.cosphicc = Math.max(0.05, Math.min(0.99, r.cosphicc));
    r.phicc = Math.acos(r.cosphicc);
    r.sinphicc = Math.sin(r.phicc);

    // Starting torque estimation from blocked-rotor test
    var Pjs_start = 3 * d.Rs * r.Id * r.Id;
    var PJr_start = Math.max(0, r.Pcc - Pjs_start);
    r.startingTorque = r.ws > 0 ? PJr_start / r.ws : 0;

    // Angle γ (small angle offset at point A)
    // Formula: sin γ ≈ tan γ = (2Rs*I0*sin φ0) / V₁
    // Note: γ is negligible for high power motors (P ≥ 15kW)
    if (d.Pn < 15000) { // Pn is already in Watts
      r.gamma = Math.abs(d.V0) > 0 ? (2 * d.Rs * d.I0 * r.sinphi0) / d.V0 : 0;
      r.gamma = Math.min(Math.PI / 36, Math.abs(r.gamma)); // Limit to 5 degrees max
    } else {
      r.gamma = 0; // Negligible for motors >= 15kW
    }

    // Iron and mechanical losses from no-load test
    r.P_iron_mech = Math.max(0, d.P0 - 3 * d.Rs * d.I0 * d.I0);
    r.P_iron = r.P_iron_mech * 0.7;
    r.P_mech = r.P_iron_mech * 0.3;

    // Phase voltage (for power calculations from distances)
    // Star: Vs = Vn / sqrt(3), Delta: Vs = Vn
    if (d.connection === 'delta') {
      r.Vs = d.Vn;
    } else {
      r.Vs = d.Vn / Math.sqrt(3);
    }

    console.log('Initial Parameters:', {
      'Synchronous speed (rpm)': r.ns.toFixed(2),
      'cos φ₀': r.cosphi0.toFixed(4),
      'cos φcc': r.cosphicc.toFixed(4),
      'γ (rad)': r.gamma.toFixed(6),
      'Icc (regulated at Vn)': r.Icc.toFixed(2),
      'Pcc (regulated at Vn)': (r.Pcc / 1000).toFixed(2) + ' kW',
      'Id (starting current)': r.Id.toFixed(2)
    });
  }

  // ============================================
  // CIRCLE GEOMETRY CALCULATION
  // FIXED: Center Ω is ALWAYS on line AF
  // ============================================

  calculateCircleGeometry() {
    var d = this.inputData;
    var r = this.results;

    // Point M₀ (no-load point)
    r.M0 = {
      x: d.I0 * r.sinphi0,
      y: d.I0 * r.cosphi0,
      label: 'M₀'
    };

    // Point Mc (short-circuit point at nominal voltage)
    r.Mc = {
      x: r.Icc * r.sinphicc,
      y: r.Icc * r.cosphicc,
      label: 'Mc'
    };

    // Calculate Nominal Point (Mn) will be done at the end of this function
    // as it requires the slip segment geometry.

    // Infinite line passing through Mc (direction M0 → Mc)
    var mcDirX = r.Mc.x - r.M0.x;
    var mcDirY = r.Mc.y - r.M0.y;
    var mcDirLen = Math.sqrt(mcDirX * mcDirX + mcDirY * mcDirY);
    if (mcDirLen > 1e-6) {
      r.McLine = {
        point: { x: r.Mc.x, y: r.Mc.y },
        direction: { x: mcDirX / mcDirLen, y: mcDirY / mcDirLen }
      };
    } else {
      r.McLine = null;
    }

    // Point A (on vertical through M0, with gamma offset if applicable)
    // A is at the intersection of the vertical from M0 and the power line
    r.A = {
      x: r.M0.x,
      y: Math.max(0, r.M0.y - r.M0.x * Math.tan(r.gamma)),
      label: 'A'
    };

    // ============================================
    // FIXED: Circle center Ω MUST be on line AF
    // Line AF has equation: y = A.y + tan(gamma) * (x - A.x)
    // For gamma = 0, this is horizontal: y = A.y
    // ============================================

    // Find center Ω that:
    // 1. Lies on line AF (y = A.y + tan(gamma) * (x - A.x))
    // 2. Is equidistant from M0 and Mc

    var midX = (r.M0.x + r.Mc.x) / 2;
    var midY = (r.M0.y + r.Mc.y) / 2;

    var dx = r.Mc.x - r.M0.x;
    var dy = r.Mc.y - r.M0.y;

    var tanGamma = Math.tan(r.gamma);

    var centerX, centerY;

    if (Math.abs(dy) < 0.001) {
      // M0 and Mc at same height - perpendicular bisector is vertical
      centerX = midX;
      centerY = r.A.y + tanGamma * (centerX - r.A.x);
    } else {
      // Perpendicular bisector slope
      var perpSlope = -dx / dy;

      // Perpendicular bisector: y - midY = perpSlope * (x - midX)
      // AF line: y = A.y + tanGamma * (x - A.x)
      // 
      // Solve: A.y + tanGamma * (x - A.x) = midY + perpSlope * (x - midX)
      // A.y + tanGamma*x - tanGamma*A.x = midY + perpSlope*x - perpSlope*midX
      // x * (tanGamma - perpSlope) = midY - perpSlope*midX - A.y + tanGamma*A.x

      var slopeDiff = tanGamma - perpSlope;

      if (Math.abs(slopeDiff) < 0.0001) {
        // Lines are nearly parallel - use midpoint projection on AF
        centerX = midX;
        centerY = r.A.y + tanGamma * (centerX - r.A.x);
      } else {
        centerX = (midY - perpSlope * midX - r.A.y + tanGamma * r.A.x) / slopeDiff;
        centerY = r.A.y + tanGamma * (centerX - r.A.x);
      }
    }

    r.Omega = {
      x: centerX,
      y: centerY,
      label: 'Ω',
      color: '#cc0066'
    };

    r.radius = Math.sqrt(Math.pow(r.M0.x - r.Omega.x, 2) + Math.pow(r.M0.y - r.Omega.y, 2));

    // Point F - intersection of AF line with circle (right side)
    var yF = r.Omega.y; // F is at the same y as Omega when on AF line
    var deltaY = yF - r.Omega.y;

    // F is where AF line intersects the circle
    // For line y = A.y + tanGamma * (x - A.x), find intersection with circle
    // Circle: (x - Omega.x)² + (y - Omega.y)² = r²
    // Since Omega is on AF: (x - Omega.x)² + (tanGamma * (x - A.x) + A.y - Omega.y)² = r²
    // But Omega.y = A.y + tanGamma * (Omega.x - A.x)
    // So: (x - Omega.x)² + (tanGamma * (x - Omega.x))² = r²
    // (x - Omega.x)² * (1 + tanGamma²) = r²
    // (x - Omega.x)² = r² / (1 + tanGamma²)
    // x - Omega.x = ± r / sqrt(1 + tanGamma²)

    var cosG = Math.cos(r.gamma);
    var deltaX = r.radius * cosG;

    r.F = {
      x: r.Omega.x + deltaX,
      y: r.A.y + tanGamma * (r.Omega.x + deltaX - r.A.x),
      label: 'F'
    };

    // Point C - second intersection of horizontal line through A with circle
    var horizontalOffset = r.A.y - r.Omega.y;
    var inside = r.radius * r.radius - horizontalOffset * horizontalOffset;
    if (inside >= -1e-6) {
      var dxC = Math.sqrt(Math.max(0, inside));
      var xCandidate1 = r.Omega.x + dxC;
      var xCandidate2 = r.Omega.x - dxC;
      var otherX = Math.abs(xCandidate1 - r.A.x) < Math.abs(xCandidate2 - r.A.x) ? xCandidate2 : xCandidate1;
      r.C = {
        x: otherX,
        y: r.A.y,
        label: 'C',
        color: '#000000'
      };
    } else {
      r.C = null;
    }

    // K₁ and L₁ for torque line (M0 to M∞)
    r.K1 = {
      x: r.Mc.x,
      y: r.M0.y,
      label: 'K₁',
      color: '#666666'
    };

    var L1K1_distance = d.Vn > 0 ? (d.Rs * r.Id * r.Id) / d.Vn : 0;

    r.L1 = {
      x: r.K1.x,
      y: r.K1.y + L1K1_distance,
      label: 'L₁',
      color: '#996633'
    };

    // Find M∞ - intersection of torque line (M0, L1) with circle
    r.MInf = this.findLineCircleIntersection(
      r.M0.x, r.M0.y,
      r.L1.x, r.L1.y,
      r.Omega.x, r.Omega.y,
      r.radius,
      true
    );

    if (r.MInf) {
      r.MInf.label = 'M∞';
      r.MInf.color = '#999999';
    } else {
      r.MInf = { x: r.Mc.x, y: r.Mc.y, label: 'M∞', color: '#999999' };
    }

    // Ray from A perpendicular to torque line (length = 2 * diameter = 4 * radius)
    r.APerpRay = null;
    r.torqueDir = null;
    if (r.MInf && r.M0) {
      var torqueDx = r.MInf.x - r.M0.x;
      var torqueDy = r.MInf.y - r.M0.y;
      var torqueLen = Math.sqrt(torqueDx * torqueDx + torqueDy * torqueDy);

      if (torqueLen > 1e-6) {
        var torqueDir = {
          x: torqueDx / torqueLen,
          y: torqueDy / torqueLen
        };
        r.torqueDir = torqueDir;

        // Perpendicular vector (rotate 90°)
        var perpDx = -torqueDir.y;
        var perpDy = torqueDir.x;
        var rayLength = 4 * r.radius; // 2 × diameter

        r.APerpRay = {
          start: { x: r.A.x, y: r.A.y },
          end: {
            x: r.A.x + perpDx * rayLength,
            y: r.A.y + perpDy * rayLength
          },
          direction: { x: perpDx, y: perpDy },
          length: rayLength,
          unit: { x: perpDx, y: perpDy }
        };
      }
    }

    // Default slip segment definition (for mapping g → M)
    r.slipSegment = this.computeDefaultSlipSegment();

    // Calculate Nominal Point Mn (Fixed Point)
    if (r.ns > 0 && d.Ns > 0) {
      var gNom = (r.ns - d.Ns) / r.ns;
      var Mn = this.findPointForSlip(gNom);
      if (Mn) {
        r.Mn = {
          x: Mn.x,
          y: Mn.y,
          label: 'Mn',
          color: '#28a745' // Green-ish color
        };
      }
    }

    // Calculate MTmax (Maximum Torque Point)
    // User Request: Determine from the peak of the mechanical characteristic
    if (r.slipSegment && r.M0) {
      var maxTorque = -1;
      var bestM = null;
      var bestG = 0;

      // Scane slip from 0 to 1 to find the peak torque
      var step = 0.005; // Precision step
      for (var g = 0; g <= 1; g += step) {
        var M_candidate = this.findPointForSlip(g);
        if (M_candidate) {
          var calc = this.calculateForPointM(M_candidate.x, M_candidate.y);
          var tem = calc.performance.Tem;
          if (tem > maxTorque) {
            maxTorque = tem;
            bestM = M_candidate;
            bestG = g;
          }
        }
      }

      // Refine search around peak
      var startG = Math.max(0, bestG - step);
      var endG = Math.min(1, bestG + step);
      var fineStep = step / 10;
      for (var g = startG; g <= endG; g += fineStep) {
        var M_candidate = this.findPointForSlip(g);
        if (M_candidate) {
          var calc = this.calculateForPointM(M_candidate.x, M_candidate.y);
          var tem = calc.performance.Tem;
          if (tem > maxTorque) {
            maxTorque = tem;
            bestM = M_candidate;
          }
        }
      }

      if (bestM) {
        r.MTmax = {
          x: bestM.x,
          y: bestM.y,
          label: 'Mτmax',
          color: '#FF8C00' // Dark Orange
        };
      }
    }

    console.log('Circle Geometry:', {
      'Center Ω': '(' + r.Omega.x.toFixed(2) + ', ' + r.Omega.y.toFixed(2) + ')',
      'Radius': r.radius.toFixed(2) + ' A',
      'M₀': '(' + r.M0.x.toFixed(2) + ', ' + r.M0.y.toFixed(2) + ')',
      'Mc': '(' + r.Mc.x.toFixed(2) + ', ' + r.Mc.y.toFixed(2) + ')',
      'Mn': r.Mn ? '(' + r.Mn.x.toFixed(2) + ', ' + r.Mn.y.toFixed(2) + ')' : 'Not defined',
      'A': '(' + r.A.x.toFixed(2) + ', ' + r.A.y.toFixed(2) + ')',
      'Omega on AF': 'y=' + (r.A.y + Math.tan(r.gamma) * (r.Omega.x - r.A.x)).toFixed(4) + ' == Omega.y=' + r.Omega.y.toFixed(4)
    });

    // ============================================
    // NEW PARAMS CALCULATION (User request)
    // Rsmu, Xssmu, ls'
    // Updated formulas: Rsmu = 3*Vs²/P0, Xsmu = 3*Vs²/Q0
    // ============================================

    // Calculate Q0 (reactive power at no-load)
    // Q0 = sqrt(S0² - P0²) or S0 * sin(phi0)
    var S0 = Math.sqrt(3) * d.V0 * d.I0;
    var Q0 = Math.sqrt(Math.max(0, S0 * S0 - d.P0 * d.P0));

    // Alternative: Q0 = S0 * sin(phi0)
    // var Q0 = S0 * r.sinphi0;

    // Rsmu = 3 * Vs² / P0
    // where Vs is the phase voltage
    if (d.P0 > 1e-6) {
      r.Rsmu = (3 * r.Vs * r.Vs) / d.P0;
    } else {
      r.Rsmu = 0;
    }

    // Xsmu = 3 * Vs² / Q0
    if (Q0 > 1e-6) {
      r.Xssmu = (3 * r.Vs * r.Vs) / Q0;
    } else {
      r.Xssmu = 0;
    }

    // ls' = Vs / (distance_AC * ws)
    if (r.C && r.A && r.ws > 0) {
      var distAC = Math.sqrt(Math.pow(r.C.x - r.A.x, 2) + Math.pow(r.C.y - r.A.y, 2));
      if (distAC > 1e-6) {
        r.ls_prime = r.Vs / (distAC * r.ws);
      } else {
        r.ls_prime = 0;
      }
    } else {
      r.ls_prime = 0;
    }

    // Calculate Xs' (leakage reactance) from leakage inductance
    // Xs' = ω * ls' where ω = 2πf
    var omega_elec = 2 * Math.PI * d.f; // Electrical angular frequency (rad/s)
    r.Xs_prime = r.ls_prime * omega_elec;
  }

  // ============================================
  // UTILITY: LINE-CIRCLE INTERSECTION
  // ============================================

  findLineCircleIntersection(x1, y1, x2, y2, cx, cy, r, farPoint) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var fx = x1 - cx;
    var fy = y1 - cy;

    var a = dx * dx + dy * dy;
    if (a < 0.0001) return null;

    var b = 2 * (fx * dx + fy * dy);
    var c = fx * fx + fy * fy - r * r;

    var discriminant = b * b - 4 * a * c;

    if (discriminant < 0) return null;

    var t1 = (-b + Math.sqrt(discriminant)) / (2 * a);
    var t2 = (-b - Math.sqrt(discriminant)) / (2 * a);

    var t = farPoint ? Math.max(t1, t2) : Math.min(t1, t2);

    return {
      x: x1 + t * dx,
      y: y1 + t * dy
    };
  }

  // ============================================
  // BUILD DEFAULT SLIP SEGMENT (g = 0 → 1)
  // ============================================

  computeDefaultSlipSegment() {
    var r = this.results;
    if (!r || !r.APerpRay || !r.torqueDir || !r.McLine || !r.M0 || !r.Omega) return null;

    var rayDir = r.APerpRay.direction || r.APerpRay.unit;
    if (!rayDir) return null;
    var rayLen = Math.sqrt(rayDir.x * rayDir.x + rayDir.y * rayDir.y);
    if (!isFinite(rayLen) || rayLen < 1e-6) return null;
    var rayUnit = { x: rayDir.x / rayLen, y: rayDir.y / rayLen };

    var maxRay = r.APerpRay.length || rayLen;
    var center = r.Omega;
    var delta = (center.x - r.APerpRay.start.x) * rayUnit.x + (center.y - r.APerpRay.start.y) * rayUnit.y;
    var slipMargin = 0.02;
    var clearance = r.radius * (1 + slipMargin);
    var handleS = delta + clearance;
    handleS = Math.max(0, Math.min(maxRay, handleS));

    var startPoint = {
      x: r.APerpRay.start.x + rayUnit.x * handleS,
      y: r.APerpRay.start.y + rayUnit.y * handleS
    };

    var torqueDir = r.torqueDir;
    var torqueLen = Math.sqrt(torqueDir.x * torqueDir.x + torqueDir.y * torqueDir.y);
    if (!isFinite(torqueLen) || torqueLen < 1e-6) return null;
    var torqueUnit = { x: torqueDir.x / torqueLen, y: torqueDir.y / torqueLen };

    var mcPoint = r.McLine.point;
    var mcDir = r.McLine.direction;
    if (!mcPoint || !mcDir) return null;

    var mcDirLen = Math.sqrt(mcDir.x * mcDir.x + mcDir.y * mcDir.y);
    if (!isFinite(mcDirLen) || mcDirLen < 1e-6) return null;
    var mcUnit = { x: mcDir.x / mcDirLen, y: mcDir.y / mcDirLen };

    var intersection = this.lineIntersection(
      startPoint.x, startPoint.y,
      startPoint.x + torqueUnit.x, startPoint.y + torqueUnit.y,
      mcPoint.x, mcPoint.y,
      mcPoint.x + mcUnit.x, mcPoint.y + mcUnit.y
    );

    if (!intersection) return null;

    return {
      start: startPoint,
      end: intersection
    };
  }

  // ============================================
  // FIND POINT M FOR GIVEN SLIP
  // ============================================

  findPointForSlip(slip) {
    var r = this.results;
    if (!r || !r.slipSegment || typeof slip !== 'number') return null;

    var g = Math.max(0, Math.min(1, slip));

    // Optimization: if g is very close to 0, return M0 directly to avoid intersection errors
    if (g < 1e-4 && r.M0) {
      return { x: r.M0.x, y: r.M0.y, label: (r.M0.label || 'M₀') };
    }

    var seg = r.slipSegment;
    var slipPoint = {
      x: seg.start.x + (seg.end.x - seg.start.x) * g,
      y: seg.start.y + (seg.end.y - seg.start.y) * g
    };

    var useFarPoint = g > 1e-4;
    var intersection = this.findLineCircleIntersection(
      r.M0.x, r.M0.y,
      slipPoint.x, slipPoint.y,
      r.Omega.x, r.Omega.y,
      r.radius,
      useFarPoint
    );

    if (!intersection) return null;

    return {
      x: intersection.x,
      y: intersection.y
    };
  }

  // ============================================
  // CALCULATE VALUES FOR OPERATING POINT M
  // FIXED: Correct points N, L, K, H and power from distances
  // ============================================

  calculateForPointM(mx, my) {
    var d = this.inputData;
    var r = this.results;

    var output = {
      M: { x: mx, y: my },
      projectionPoints: {},
      powers: {},
      performance: {}
    };

    // Current magnitude and power factor
    output.I1 = Math.sqrt(mx * mx + my * my);
    output.cosphi = output.I1 > 0 ? my / output.I1 : 0;
    output.cosphi = Math.max(0, Math.min(1, output.cosphi));
    output.phi = Math.acos(output.cosphi);
    output.phiDeg = output.phi * 180 / Math.PI;

    // Calculate Rotor Current referred to stator (Ir')
    // Ir' is the vector M0 -> M
    if (r.M0) {
      output.Ir_prime = Math.sqrt(Math.pow(mx - r.M0.x, 2) + Math.pow(my - r.M0.y, 2));
    } else {
      output.Ir_prime = 0;
    }

    // Scalar difference between Stator Current (I1) and Rotor Current (Ir')
    // Requested as "difference between the two currents"
    output.diff_Is_Ir = Math.abs(output.I1 - output.Ir_prime);

    // Calculate slip from geometric projection on slip line (Inverse of findPointForSlip)
    // We intersect line (M0, M) with the slip segment line to find the slip value
    if (r.slipSegment && r.M0) {
      var distM0 = Math.sqrt(Math.pow(mx - r.M0.x, 2) + Math.pow(my - r.M0.y, 2));

      if (distM0 < 1e-4) {
        output.slip = 0;
      } else {
        // Find intersection P of line(M0, M) with line(SlipStart, SlipEnd)
        var P = this.lineIntersection(
          r.M0.x, r.M0.y,
          mx, my,
          r.slipSegment.start.x, r.slipSegment.start.y,
          r.slipSegment.end.x, r.slipSegment.end.y
        );

        if (P) {
          // Project P onto the segment (start -> end) to get ratio (0 to 1)
          var dx = r.slipSegment.end.x - r.slipSegment.start.x;
          var dy = r.slipSegment.end.y - r.slipSegment.start.y;
          var len2 = dx * dx + dy * dy;

          if (len2 > 1e-6) {
            var pdx = P.x - r.slipSegment.start.x;
            var pdy = P.y - r.slipSegment.start.y;
            output.slip = (pdx * dx + pdy * dy) / len2;
          } else {
            output.slip = 0;
          }
        } else {
          output.slip = 0;
        }
      }
    } else {
      // Fallback if geometry not ready
      output.slip = 0;
    }

    // Clamp slip between 0 and 1 theoretically, but allow slightly outside for visualization if needed
    // Usually slip is [0, 1] for motor mode
    output.slip = Math.max(0, Math.min(1, output.slip));

    // Speed calculations
    output.n = r.ns * (1 - output.slip);
    output.omega = output.n * 2 * Math.PI / 60;
    output.f2 = output.slip * d.f;

    // ============================================
    // FIXED: Calculate projection points correctly
    // All on vertical line through M (x = mx)
    // ============================================

    // M0: intersection of vertical through M with horizontal axis (y = 0)
    output.projectionPoints.M0 = { x: mx, y: 0 };

    // M1: intersection of vertical through M with horizontal line (segment AC)
    output.projectionPoints.M1 = { x: mx, y: r.A.y };

    // M2: intersection of vertical through M with line (M0, M∞)
    var L = this.lineIntersection(
      mx, 0, mx, my + 10, // vertical line through M
      r.M0.x, r.M0.y, r.MInf.x, r.MInf.y // line M0 to M∞
    );
    output.projectionPoints.M2 = L || { x: mx, y: r.M0.y };

    // M3: intersection of vertical through M with line (M0, Mc)
    var N = this.lineIntersection(
      mx, 0, mx, my + 10, // vertical line through M
      r.M0.x, r.M0.y, r.Mc.x, r.Mc.y // line M0 to Mc
    );
    output.projectionPoints.M3 = N || { x: mx, y: r.M0.y };

    // ============================================
    // FIXED: Power calculations using distances
    // Formula: Power = 3 * Vs * distance
    // Vs = Vn / sqrt(3) for star connection
    // ============================================

    var Vs = r.Vs; // Phase voltage

    // Calculate distances (all on vertical line through M)
    var distMM0 = my - output.projectionPoints.M0.y; // M to M0 (y-coordinate difference)
    var distMM3 = my - output.projectionPoints.M3.y; // M to M3
    var distMM2 = my - output.projectionPoints.M2.y; // M to M2
    var distM3M2 = output.projectionPoints.M3.y - output.projectionPoints.M2.y; // M3 to M2 (can be negative)
    var distM1M0 = output.projectionPoints.M1.y - output.projectionPoints.M0.y; // M1 to M0
    var distM2M1 = output.projectionPoints.M2.y - output.projectionPoints.M1.y; // M2 to M1 (can be negative)

    // Powers from distances (3 * Vs * distance)
    // Note: Distances are in Amperes (current scale), multiply by 3*Vs gives power in Watts


    output.powers.Pa = 3 * Vs * Math.abs(distMM0);      // Absorbed power: 3*Vs*MM0
    output.powers.Pfer = 3 * Vs * Math.abs(distM1M0);
    output.powers.Pjs = 3 * Vs * Math.abs(distM2M1);    // Stator losses: 3*Vs*M2M1
    output.powers.Ptr = output.powers.Pa - output.powers.Pjs - output.powers.Pfer;
    output.powers.Pjr = 3 * Vs * Math.abs(distM3M2);    // Rotor losses: 3*Vs*M3M2 = Pem - Pu
    output.powers.Pem = output.powers.Ptr - output.powers.Pjr; // Mechanical losses: 3*Vs*M1M0
    output.powers.Pu = output.powers.Pem;


    // ============================================
    // FIXED: Efficiency from distances
    // η = Pu/Pa = MM3/MM0
    // ============================================
    output.performance.eta = distMM0 > 0.001 ? output.powers.Pu / output.powers.Pa : 0;
    output.performance.eta = Math.max(0, Math.min(1, output.performance.eta));

    // Torque calculations
    output.performance.Tem = r.ws > 0 ? output.powers.Pem / r.ws : 0;
    output.performance.Tu = output.performance.Tem;
    output.performance.Td = r.startingTorque || 0;

    // Reactive and apparent power
    output.powers.Q = Math.sqrt(3) * d.Vn * output.I1 * Math.sin(output.phi);
    output.powers.S = Math.sqrt(3) * d.Vn * output.I1;

    // Store distances for display
    output.distances = {
      MM0: distMM0,
      MM3: distMM3,
      MM2: distMM2,
      M3M2: distM3M2,
      M1M0: distM1M0,
      M2M1: distM2M1
    };

    return output;
  }

  lineIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
    var denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

    if (Math.abs(denom) < 0.0001) return null;

    var t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;

    return {
      x: x1 + t * (x2 - x1),
      y: y1 + t * (y2 - y1)
    };
  }

  updateDisplay(results) {
    var self = this;

    function setVal(id, val, decimals) {
      if (decimals === undefined) decimals = 2;
      var el = document.getElementById(id);
      if (el) el.textContent = val.toFixed(decimals);
    }

    setVal('absorbed_power', results.powers.Pa, 3);
    setVal('stator_losses', results.powers.Pjs, 3);
    setVal('air_gap_power', results.powers.Ptr / 1, 3);
    setVal('rotor_losses', results.powers.Pjr / 1, 3);
    setVal('electromagnetic_power', results.powers.Pem / 1, 3);
    setVal('mechnical_losses', results.powers.Pmec_loss / 1, 3);
    setVal('useful_power', results.powers.Pu / 1, 3);
    setVal('iron_losses', results.powers.Pfer, 3);
    setVal('efficiency', results.performance.eta * 100, 2);

    setVal('phaseResistance', this.inputData.Rs, 4);

    // Display rotor resistance (from input)
    setVal('rotorResistanceResult', this.inputData.rotorResistance || 0, 4);

    // Display leakage reactance Xs'
    setVal('leakageReactanceResult', this.results.Xs_prime || 0, 4);

    setVal('magnetizingResistance', this.results.Rsmu, 2);
    setVal('magnetizingReactance', this.results.Xssmu, 2);
    setVal('leakageInductancePrime', (this.results.ls_prime || 0) * 1000, 3);

    setVal('slip', results.slip * 100, 2);
    setVal('rotorSpeed', results.n, 1);
    setVal('rotorFrequency', results.f2, 2);
    setVal('usefulTorque', results.performance.Tu, 2);
    setVal('electromagneticTorque', results.performance.Tem, 2);
    setVal('mechanicalLossesTorque', results.performance.Tc, 2);
    setVal('startingTorque', this.results.startingTorque || 0, 2);

    // Display maximum torque
    if (this.results.MTmax) {
      var maxTorqueCalc = this.calculateForPointM(this.results.MTmax.x, this.results.MTmax.y);
      setVal('maxTorqueResult', maxTorqueCalc.performance.Tem || 0, 2);
    } else {
      setVal('maxTorqueResult', 0, 2);
    }


    setVal('supplyVoltage', this.results.Vs, 1);
    setVal('supplyCurrent', results.I1, 2);
    setVal('reactivePower', results.powers.Q, 1);
    setVal('apparentPower', results.powers.S, 1);
    setVal('powerFactor', results.cosphi, 3);
    setVal('phaseShift', results.phiDeg, 2);
    setVal('gammaAngle', (this.results.gamma || 0) * 180 / Math.PI, 3); // Display gamma in degrees
    setVal('rotorCurrentPrime', results.Ir_prime, 2);
    setVal('brachCurrent', results.diff_Is_Ir, 2);
  }

  // ============================================
  // UTILITY: CHOOSE NEAREST SYNCHRONOUS SPEED
  // ============================================

  getNearestSynchronousSpeed(ratedSpeed, frequency) {
    if (!isFinite(ratedSpeed) || ratedSpeed <= 0) return 0;

    var freq = parseFloat(frequency) || 50;
    var is60Hz = Math.abs(freq - 60) < 1;

    // Ordered ascending to find the next higher speed
    var syncSpeeds = is60Hz ? [900, 1200, 1800, 3600] : [750, 1000, 1500, 3000];

    for (var i = 0; i < syncSpeeds.length; i++) {
      // Return the first speed that is >= ratedSpeed
      if (syncSpeeds[i] >= ratedSpeed) {
        return syncSpeeds[i];
      }
    }

    // If ratedSpeed is > max sync speed, return the max
    return syncSpeeds[syncSpeeds.length - 1];
  }

  generateCharacteristicData(numPoints) {
    if (numPoints === undefined) numPoints = 100;

    var data = {
      slip: [],
      speed: [],
      torque: [],
      current: [],
      powerFactor: [],
      efficiency: [],
      efficiency: [],
      usefulPower: [],
      usefulTorque_graph: []
    };

    // Determine slip at maximum torque
    var gMax = 1.0;
    if (this.results.MTmax) {
      var calcMax = this.calculateForPointM(this.results.MTmax.x, this.results.MTmax.y);
      if (calcMax && typeof calcMax.slip === 'number') {
        gMax = calcMax.slip;
      }
    }

    // 1. Generate standard diagram data
    for (var i = 0; i <= numPoints; i++) {
      var g = i / numPoints;
      var M = this.findPointForSlip(g);
      var calc = this.calculateForPointM(M.x, M.y);

      data.slip.push(g * 100);
      data.speed.push(calc.n);
      data.torque.push(calc.performance.Tem); // Diagram value
      data.current.push(calc.I1);
      data.powerFactor.push(calc.cosphi);
      data.efficiency.push(calc.performance.eta * 100);
      data.usefulPower.push(calc.powers.Pu / 1000);

      // Calculate Useful Torque for graph
      var distanceForTorque = Math.abs(calc.distances.MM3);
      var torqueGraph = (3 * this.results.Vs * distanceForTorque) / this.results.ws;
      data.usefulTorque_graph.push(torqueGraph);
    }

    // 2. Overwrite Torque Curve for g > gMax (User request)
    // Goal: Connect from near max torque to exact starting torque at g=1
    // "Not directly with peak, but 5-10% before" -> We take a point slightly after peak slip

    var torqueArray = data.torque;
    var slipArray = data.slip;
    var targetStartTorque = this.results.startingTorque || 0;

    // Find index of peak (or use gMax)
    var maxTorqueVal = -1;
    var maxTorqueIdx = 0;
    for (var i = 0; i < torqueArray.length; i++) {
      if (torqueArray[i] > maxTorqueVal) {
        maxTorqueVal = torqueArray[i];
        maxTorqueIdx = i;
      }
    }

    // Define splice point: 5-10% slip "after" the peak (towards g=1)
    // If we have 100 points, 1 point = 1% slip. 
    // Let's add ~5% slip (5 points)
    var spliceIdx = maxTorqueIdx + 5;

    // Safety check
    if (spliceIdx < torqueArray.length - 1) {

      // Parameters at splice point
      var g_s = slipArray[spliceIdx]; // percentage
      var T_s = torqueArray[spliceIdx];

      // Calculate slope roughly at splice point (backward difference)
      var g_prev = slipArray[spliceIdx - 1];
      var T_prev = torqueArray[spliceIdx - 1];
      var slope_s = (T_s - T_prev) / (g_s - g_prev);

      // Parameters at end point (g=100%)
      var g_e = 100;
      var T_e = targetStartTorque;

      // Fit Quadratic: T(g) = A(g - g_s)^2 + B(g - g_s) + C
      // T(g_s) = C = T_s
      // T'(g_s) = B = slope_s
      // T(g_e) = A(g_e - g_s)^2 + slope_s(g_e - g_s) + T_s = T_e

      var C = T_s;
      var B = slope_s;
      var delta_g = g_e - g_s;
      var A = (T_e - C - B * delta_g) / (delta_g * delta_g);

      // Overwrite values
      for (var i = spliceIdx + 1; i < torqueArray.length; i++) {
        var g_curr = slipArray[i];
        var diff = g_curr - g_s;
        var newVal = A * diff * diff + B * diff + C;
        torqueArray[i] = Math.max(0, newVal); // Clamp to 0 just in case
      }

    }

    return data;
  }
}
