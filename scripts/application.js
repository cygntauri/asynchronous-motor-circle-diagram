// ============================================
// Circle Diagram Application - Vanilla JS
// ============================================

class CircleDiagramApp {
  constructor() {
    // State
    this.calculated = null;
    this.params = null;
    this.operatingPoint = null;
    this.zoomLevel = 1;

    // Refs
    this.canvas = document.getElementById('circleDiagramCanvas');
    this.renderer = null;

    // Initialize
    this.init();
  }

  init() {
    this.setupFormHandlers();
    this.setupCanvasRenderer();
    this.setupResizeHandler();
    this.createZoomControls();
    this.setupFrequencyHandlers();
  }

  // ============================================
  // Form Handling
  // ============================================

  setupFrequencyHandlers() {
    const freqSelect = document.getElementById('rated_frequency');
    const syncSelect = document.getElementById('sync_speed');

    if (!freqSelect || !syncSelect) return;

    const updateSyncOptions = () => {
      const freq = parseInt(freqSelect.value);

      let options = [];
      if (freq === 60) {
        options = [
          { val: 3600, label: '3600 rpm (2 poles)' },
          { val: 1800, label: '1800 rpm (4 poles)' },
          { val: 1200, label: '1200 rpm (6 poles)' },
          { val: 900, label: '900 rpm (8 poles)' }
        ];
      } else {
        options = [
          { val: 3000, label: '3000 rpm (2 poles)' },
          { val: 1500, label: '1500 rpm (4 poles)' },
          { val: 1000, label: '1000 rpm (6 poles)' },
          { val: 750, label: '750 rpm (8 poles)' }
        ];
      }

      syncSelect.innerHTML = '';
      options.forEach((opt, index) => {
        const el = document.createElement('option');
        el.value = opt.val;
        el.textContent = opt.label;
        // Default to 4 poles (index 1)
        if (index === 1) el.selected = true;
        syncSelect.appendChild(el);
      });
    };

    freqSelect.addEventListener('change', updateSyncOptions);
    // Initialize on load
    updateSyncOptions();
  }

  setupFormHandlers() {
    // Create calculate button if it doesn't exist
    const inputsContainer = document.querySelector('.inputs');
    if (!document.getElementById('calculateBtn')) {
      const btnContainer = document.createElement('div');
      btnContainer.style.cssText = 'grid-column: 1 / -1; margin-top: 20px;';
      btnContainer.innerHTML = `
        <button id="calculateBtn" class="calculate-button">
           Draw the Circle Diagram
        </button>
      `;
      inputsContainer.appendChild(btnContainer);
    }

    const calculateBtn = document.getElementById('calculateBtn');
    const allInputs = inputsContainer.querySelectorAll('input[type="number"]');

    // Validation: Only allow digits and comma, prevent others
    allInputs.forEach(input => {
      input.addEventListener('input', (e) => {
        // Only allow: digits, comma, dot
        let value = e.target.value.replace(/[^\d,\.]/g, '');
        // Only one comma or dot
        value = value.replace(/([,.])[,.]+/g, '$1');
        // Replace multiple commas/dots by one
        e.target.value = value;
        this.validateInputsAndButton();
      });
    });

    // Validate on page load
    this.validateInputsAndButton();

    // Validate on input
    inputsContainer.addEventListener('input', () => {
      this.validateInputsAndButton();
    });

    calculateBtn.addEventListener('click', (e) => {
      e.preventDefault();
      // Check again before calculating
      if (!this.validateInputsAndButton(true)) return;
      this.handleCalculate();
    });
  }

  validateInputsAndButton(focusFirstEmpty = false) {
    const inputsContainer = document.querySelector('.inputs');
    const calculateBtn = document.getElementById('calculateBtn');
    const allInputs = inputsContainer.querySelectorAll('input[type="number"]');
    let allFilled = true;
    let firstEmpty = null;
    allInputs.forEach(input => {
      // Remove spaces
      let val = input.value.trim();
      // Accept comma or dot as decimal separator
      val = val.replace(',', '.');
      // Not empty and is a valid number
      if (val === '' || isNaN(Number(val))) {
        allFilled = false;
        if (!firstEmpty) firstEmpty = input;
      }
    });
    calculateBtn.disabled = !allFilled;
    if (focusFirstEmpty && firstEmpty) {
      firstEmpty.focus({ preventScroll: true });
      setTimeout(() => {
        firstEmpty.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    }
    return allFilled;
  }

  getFormValues() {
    return {
      // Rated Data
      voltage: parseFloat(document.getElementById('rated_voltage').value) || 380,
      ratedCurrent: parseFloat(document.getElementById('rated_current').value) || 10,
      ratedPower: parseFloat(document.getElementById('rated_power').value) || 5,
      frequency: parseFloat(document.getElementById('rated_frequency').value) || 50,
      ratedSpeed: parseFloat(document.getElementById('rated_speed').value) || 1440,
      couplingType: document.getElementById('winding_connection').value === 'star' ? 'Y' : 'D',

      // Calculate pole pairs from rated speed and frequency
      polePairs: this.calculatePolePairs(
        parseFloat(document.getElementById('rated_frequency').value) || 50,
        parseFloat(document.getElementById('rated_speed').value) || 1440
      ),

      // No-Load Test
      noLoadVoltage: parseFloat(document.getElementById('no_load_voltage').value) || 380,
      noLoadCurrent: parseFloat(document.getElementById('no_load_current').value) || 5,
      noLoadPower: (parseFloat(document.getElementById('no_load_power').value) || 0.5) * 1000, // kW to W

      // Short-Circuit Test (Blocked Rotor)
      shortCircuitVoltage: parseFloat(document.getElementById('blockedRotorVoltage').value) || 100,
      shortCircuitCurrent: parseFloat(document.getElementById('lockedRotorCurrent').value) || 25,
      shortCircuitPower: (parseFloat(document.getElementById('blockedRotorPower').value) || 2) * 1000, // kW to W

      // Stator Resistance Test
      statorVoltage: parseFloat(document.getElementById('statorVoltage').value) || 10,
      statorCurrent: parseFloat(document.getElementById('statorCurrent').value) || 10,

      // Calculated resistance
      statorResistance: this.calculateStatorResistance(
        parseFloat(document.getElementById('statorVoltage').value) || 10,
        parseFloat(document.getElementById('statorCurrent').value) || 10
      ),

      // Defaults
      rotorResistance: 0.4,
      transformationRatio: 1,
      leakageReactance: 1.5,
      shortCircuitCorrected: 'non',
      coupling: document.getElementById('winding_connection').value // 'star' or 'delta'
    };
  }

  calculatePolePairs(frequency, ratedSpeed) {
    // n_s = 120 * f / p, so p = 120 * f / n_s
    const syncSpeed = (120 * frequency) / 2; // Assume 2 pole pairs initially
    const p = Math.round(60 * frequency / ratedSpeed);
    return Math.max(1, p);
  }

  calculateStatorResistance(voltage, current) {
    if (current > 0) {
      return voltage / current;
    }
    return 0.5; // Default value
  }

  handleCalculate() {
    const btn = document.getElementById('calculateBtn');
    btn.disabled = true;
    btn.textContent = 'Calcul en cours...';

    try {
      this.params = this.getFormValues();
      this.calculated = this.performCalculations(this.params);

      // Render diagram
      this.renderDiagram();

      // Update results
      this.updateResults();

      // Show success message
      this.showMessage('The diagram has been successfully drawn!', 'success');
    } catch (error) {
      console.error('Calculation error:', error);
      this.showMessage('Error during calculation: ' + error.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Draw the Circle Diagram';
    }
  }

  // ============================================
  // Calculations (AsynchronousMotor Logic)
  // ============================================

  performCalculations(params) {
    const {
      voltage, frequency, polePairs, noLoadVoltage, noLoadCurrent, noLoadPower,
      shortCircuitVoltage, shortCircuitCurrent, shortCircuitPower,
      statorResistance, rotorResistance, leakageReactance, transformationRatio
    } = params;

    // Angular frequency
    const omega = 2 * Math.PI * frequency;
    const omegaS = (2 * Math.PI * frequency) / polePairs;

    // No-load calculations (g = 0)
    const cosPhi0 = noLoadPower / (Math.sqrt(3) * noLoadVoltage * noLoadCurrent);
    const phi0 = Math.acos(cosPhi0);
    const I0a = noLoadCurrent * cosPhi0;
    const I0r = noLoadCurrent * Math.sin(phi0);

    // Iron losses
    const PFe = noLoadPower - 3 * statorResistance * noLoadCurrent * noLoadCurrent;

    // Short-circuit calculations (g = 1)
    const cosPhiCC = shortCircuitPower / (Math.sqrt(3) * shortCircuitVoltage * shortCircuitCurrent);
    const phiCC = Math.acos(cosPhiCC);

    // Starting current (scaled to nominal voltage)
    const Id = shortCircuitCurrent * (voltage / shortCircuitVoltage);
    const Ida = Id * cosPhiCC;
    const Idr = Id * Math.sin(phiCC);

    // Losses at starting
    const PJs = 3 * statorResistance * Id * Id;
    const PJr = shortCircuitPower - PJs;

    // Starting torque
    const Td = (3 * PJr) / omegaS;

    // Circle geometry
    // M0 point (no-load)
    const M0 = { x: I0a, y: I0r };

    // M1 point (starting)
    const M1 = { x: Ida, y: Idr };

    // Center Omega (on y-axis)
    const Omega = {
      x: 0,
      y: (M0.y + M1.y) / 2 +
        (M1.x * M1.x - M0.x * M0.x) / (2 * (M0.y - M1.y))
    };

    // Radius
    const radius = Math.sqrt(
      Math.pow(M0.x - Omega.x, 2) +
      Math.pow(M0.y - Omega.y, 2)
    );

    return {
      // No-load
      cosPhi0,
      I0a,
      I0r,
      M0,

      // Starting
      cosPhiCC,
      Id,
      Ida,
      Idr,
      M1,

      // Losses
      PFe,
      PJs,
      PJr,

      // Torque
      Td,
      omegaS,

      // Circle
      Omega,
      radius,

      // For rendering
      voltage,
      frequency,
      polePairs
    };
  }

  // ============================================
  // Canvas & Rendering
  // ============================================

  setupCanvasRenderer() {
    if (!this.canvas) {
      console.error('Canvas element not found');
      return;
    }

    const plottingDiv = document.querySelector('.plotting');
    if (plottingDiv && !plottingDiv.querySelector('canvas')) {
      this.canvas = document.createElement('canvas');
      this.canvas.id = 'circleDiagramCanvas';
      this.canvas.style.cssText = 'width: 100%; height: 600px; border: 1px solid #ccc; border-radius: 8px;';
      plottingDiv.appendChild(this.canvas);
    }

    try {
      // Initialize renderer (assuming CircleDiagramRenderer exists)
      if (typeof CircleDiagramRenderer !== 'undefined') {
        this.renderer = new CircleDiagramRenderer(this.canvas, {
          padding: 70,
          gridSpacing: 1,
          showGrid: true,
          showLabels: true,
          showPowerLine: true,
          showGamma: true,
          showBoughrara: true,
          userScale: this.zoomLevel
        });
      } else {
        console.warn('CircleDiagramRenderer not found, using basic canvas rendering');
        this.setupBasicRenderer();
      }
    } catch (error) {
      console.error('Failed to initialize renderer:', error);
      this.setupBasicRenderer();
    }
  }

  setupBasicRenderer() {
    // Fallback basic renderer
    const ctx = this.canvas.getContext('2d');
    this.renderer = {
      render: (calculated) => {
        if (!calculated) return;

        const width = this.canvas.width;
        const height = this.canvas.height;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, width, height);

        // Draw axes
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(50, height - 50);
        ctx.lineTo(width - 50, height - 50);
        ctx.moveTo(50, height - 50);
        ctx.lineTo(50, 50);
        ctx.stroke();

        // Draw circle
        const centerX = 50;
        const centerY = height - 50 - calculated.Omega.y * 20;
        const radius = calculated.radius * 20;

        ctx.strokeStyle = '#0066cc';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(centerX + calculated.Omega.x * 20, centerY, radius, 0, 2 * Math.PI);
        ctx.stroke();

        // Draw points
        this.drawPoint(ctx, centerX + calculated.M0.x * 20, height - 50 - calculated.M0.y * 20, 'M₀', '#00cc00');
        this.drawPoint(ctx, centerX + calculated.M1.x * 20, height - 50 - calculated.M1.y * 20, 'M₁', '#cc0000');
      },
      setUserScale: (scale) => { },
      resetScale: () => { },
      resize: () => {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
      },
      toDataURL: () => this.canvas.toDataURL()
    };

    this.renderer.resize();
  }

  drawPoint(ctx, x, y, label, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, 2 * Math.PI);
    ctx.fill();

    ctx.fillStyle = '#000';
    ctx.font = '12px Arial';
    ctx.fillText(label, x + 8, y - 8);
  }

  renderDiagram() {
    if (!this.renderer || !this.calculated) return;

    this.renderer.setUserScale(this.zoomLevel);
    this.renderer.render(this.calculated, this.operatingPoint);
  }

  setupResizeHandler() {
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (this.renderer && this.canvas) {
          this.renderer.resize();
          this.renderer.resetScale();
          this.renderDiagram();
        }
      }, 100);
    });
  }

  // ============================================
  // Zoom Controls
  // ============================================

  createZoomControls() {
    const plottingDiv = document.querySelector('.plotting');
    if (!plottingDiv) return;

    const zoomContainer = document.createElement('div');
    zoomContainer.id = 'zoomControls';
    zoomContainer.style.cssText = `
      position: absolute;
      top: 10px;
      left: 10px;
      display: none;
      gap: 5px;
      background: rgba(255, 255, 255, 0.9);
      padding: 8px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      z-index: 10;
    `;

    zoomContainer.innerHTML = `
      <button id="zoomIn" title="Zoom In" style="padding: 8px; cursor: pointer; border: 1px solid #ccc; background: white; border-radius: 4px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="M21 21l-4.35-4.35"></path>
          <line x1="11" y1="8" x2="11" y2="14"></line>
          <line x1="8" y1="11" x2="14" y2="11"></line>
        </svg>
      </button>
      <button id="zoomOut" title="Zoom Out" style="padding: 8px; cursor: pointer; border: 1px solid #ccc; background: white; border-radius: 4px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="M21 21l-4.35-4.35"></path>
          <line x1="8" y1="11" x2="14" y2="11"></line>
        </svg>
      </button>
      <button id="zoomReset" title="Reset" style="padding: 8px; cursor: pointer; border: 1px solid #ccc; background: white; border-radius: 4px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 4v6h-6"></path>
          <path d="M1 20v-6h6"></path>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg>
      </button>
      <span id="zoomLevel" style="padding: 8px; font-family: monospace; font-size: 12px;">100%</span>
    `;

    plottingDiv.style.position = 'relative';
    plottingDiv.appendChild(zoomContainer);

    document.getElementById('zoomIn').addEventListener('click', () => this.handleZoomIn());
    document.getElementById('zoomOut').addEventListener('click', () => this.handleZoomOut());
    document.getElementById('zoomReset').addEventListener('click', () => this.handleZoomReset());
  }

  handleZoomIn() {
    this.zoomLevel = Math.min(this.zoomLevel + 0.25, 3);
    this.updateZoom();
  }

  handleZoomOut() {
    this.zoomLevel = Math.max(this.zoomLevel - 0.25, 0.5);
    this.updateZoom();
  }

  handleZoomReset() {
    this.zoomLevel = 1;
    if (this.renderer) {
      this.renderer.resetScale();
    }
    this.updateZoom();
  }

  updateZoom() {
    document.getElementById('zoomLevel').textContent = `${Math.round(this.zoomLevel * 100)}%`;
    this.renderDiagram();
  }

  showZoomControls() {
    const controls = document.getElementById('zoomControls');
    if (controls) {
      controls.style.display = 'flex';
    }
  }

  // ============================================
  // Results Display
  // ============================================

  updateResults() {
    if (!this.calculated || !this.params) return;

    this.showZoomControls();

    // Power Balance
    const slip = 0.04; // Example slip, should be calculated
    const Pa = this.calculated.voltage * this.calculated.Id * Math.sqrt(3) * this.calculated.cosPhi0 / 1000;
    const Ps = this.calculated.PJs / 1000;
    const Ptr = Pa - Ps;
    const Pr = Ptr * slip;
    const Pem = Ptr - Pr;
    const Pc = 0.05; // Mechanical losses (example)
    const Pu = Pem - Pc;
    const efficiency = (Pu / Pa) * 100;

    this.setResultValue('absorbed_power', Pa.toFixed(3));
    this.setResultValue('stator_losses', Ps.toFixed(3));
    this.setResultValue('air_gap_power', Ptr.toFixed(3));
    this.setResultValue('rotor_losses', Pr.toFixed(3));
    this.setResultValue('electromagnetic_power', Pem.toFixed(3));
    this.setResultValue('mechnical_losses', Pc.toFixed(3));
    this.setResultValue('useful_power', Pu.toFixed(3));
    this.setResultValue('efficiency', efficiency.toFixed(2));

    // Machine Parameters
    this.setResultValue('phaseResistance', this.params.statorResistance.toFixed(4));
    this.setResultValue('phaseReactance', this.params.leakageReactance.toFixed(4));
    const inductance = this.params.leakageReactance / (2 * Math.PI * this.params.frequency);
    this.setResultValue('phaseInductance', inductance.toFixed(6));

    // Mechanical Parameters
    this.setResultValue('slip', (slip * 100).toFixed(2));
    const rotorSpeed = this.params.ratedSpeed * (1 - slip);
    this.setResultValue('rotorSpeed', rotorSpeed.toFixed(0));
    const rotorFrequency = this.params.frequency * slip;
    this.setResultValue('rotorFrequency', rotorFrequency.toFixed(2));
    this.setResultValue('usefulTorque', (Pu * 1000 / (2 * Math.PI * rotorSpeed / 60)).toFixed(2));
    this.setResultValue('electromagneticTorque', (Pem * 1000 / (2 * Math.PI * rotorSpeed / 60)).toFixed(2));
    this.setResultValue('mechanicalLossesTorque', (Pc * 1000 / (2 * Math.PI * rotorSpeed / 60)).toFixed(2));

    // Electrical Parameters
    this.setResultValue('supplyVoltage', this.params.voltage.toFixed(0));
    this.setResultValue('supplyCurrent', this.calculated.Id.toFixed(2));
    const Q = this.params.voltage * this.calculated.Idr * Math.sqrt(3);
    const S = this.params.voltage * this.calculated.Id * Math.sqrt(3);
    this.setResultValue('reactivePower', Q.toFixed(0));
    this.setResultValue('apparentPower', S.toFixed(0));
    this.setResultValue('powerFactor', this.calculated.cosPhi0.toFixed(3));
    this.setResultValue('phaseShift', (Math.acos(this.calculated.cosPhi0) * 180 / Math.PI).toFixed(2));
    this.setResultValue('powerAngle', (Math.acos(this.calculated.cosPhi0) * 180 / Math.PI).toFixed(2));
  }

  setResultValue(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  // ============================================
  // Utilities
  // ============================================

  showMessage(message, type = 'info') {
    const existingMsg = document.getElementById('calculationMessage');
    if (existingMsg) {
      existingMsg.remove();
    }

    const msgDiv = document.createElement('div');
    msgDiv.id = 'calculationMessage';
    msgDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20%;
      padding: 15px 20px;
      border-radius: 8px;
      background: ${type === 'success' ? '#4CAF50' : '#f44336'};
      color: white;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 1000;
      animation: slideIn 0.3s ease;
    `;
    msgDiv.textContent = message;
    document.body.appendChild(msgDiv);

    setTimeout(() => {
      msgDiv.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => msgDiv.remove(), 300);
    }, 3000);
  }

  exportImage() {
    if (this.renderer) {
      const dataURL = this.renderer.toDataURL();
      const link = document.createElement('a');
      link.download = 'circle-diagram.png';
      link.href = dataURL;
      link.click();
    }
  }
}

// ============================================
// Initialize on DOM load
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  window.circleDiagramApp = new CircleDiagramApp();
});

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
  
  .calculate-button {
    width: 100%;
    padding: 12px 24px;
    font-size: 16px;
    font-weight: 600;
    color: white;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.3s ease;
  }
  
  .calculate-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }
  
  .calculate-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
`;
document.head.appendChild(style);