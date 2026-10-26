/**
 * Aperture — Take Reel & Lookbook Export Engine
 * Manages take capture progression, visual filmstrip dock, and PDF/HTML Lookbook generation.
 */

const TakeReelManager = {
  takes: [],
  takeCounter: 1,

  // UI Elements
  dockEl: null,
  stripEl: null,
  emptyEl: null,
  subtitleEl: null,
  logBtn: null,
  exportBtn: null,
  clearBtn: null,

  init() {
    this.dockEl = document.getElementById('takeReelDock');
    this.stripEl = document.getElementById('takeReelStrip');
    this.emptyEl = document.getElementById('takeReelEmpty');
    this.subtitleEl = document.getElementById('takeReelSubtitle');
    this.logBtn = document.getElementById('logTakeBtn');
    this.exportBtn = document.getElementById('exportLookbookBtn');
    this.clearBtn = document.getElementById('clearReelBtn');

    this.loadFromStorage();
    this.bindEvents();
    this.render();

    console.log('[TakeReelManager] Initialized with', this.takes.length, 'takes.');
  },

  bindEvents() {
    if (this.logBtn) {
      this.logBtn.addEventListener('click', () => this.logCurrentFrame());
    }

    if (this.exportBtn) {
      this.exportBtn.addEventListener('click', () => this.exportLookbook());
    }

    if (this.clearBtn) {
      this.clearBtn.addEventListener('click', () => {
        if (this.takes.length === 0) return;
        if (confirm('Clear all recorded takes from the reel?')) {
          this.clearTakes();
        }
      });
    }
  },

  loadFromStorage() {
    try {
      const saved = localStorage.getItem('aperture_take_reel');
      if (saved) {
        this.takes = JSON.parse(saved);
        if (this.takes.length > 0) {
          const maxNum = Math.max(...this.takes.map(t => t.takeNumber || 1));
          this.takeCounter = maxNum + 1;
          const latestTake = this.takes[this.takes.length - 1];
          const engine = window.GradingEngine || (typeof GradingEngine !== 'undefined' ? GradingEngine : null);
          if (latestTake && engine && typeof engine.saveTakeA === 'function') {
            engine.saveTakeA(latestTake.frameBase64, latestTake.telemetry);
          }
        }
      }
    } catch (e) {
      console.warn('[TakeReelManager] Could not load stored takes:', e);
      this.takes = [];
    }
  },

  saveToStorage() {
    let toSave = [...this.takes];
    while (toSave.length > 0) {
      try {
        localStorage.setItem('aperture_take_reel', JSON.stringify(toSave));
        return;
      } catch (e) {
        // If quota exceeded, evict oldest takes
        if (toSave.length > 1) {
          toSave.shift();
        } else {
          console.warn('[TakeReelManager] Storage quota exceeded, could not save takes:', e);
          break;
        }
      }
    }
  },

  logCurrentFrame() {
    if (typeof CameraManager === 'undefined' || !CameraManager.isLive()) return;

    const frameBase64 = CameraManager.captureCurrentFrameBase64(0.9);
    if (!frameBase64) {
      alert('Camera is not active. Please start camera before capturing a take.');
      return;
    }

    const fullDataUrl = frameBase64.startsWith('data:') ? frameBase64 : `data:image/jpeg;base64,${frameBase64}`;
    const telemetry = (typeof ScopeEngine !== 'undefined' && ScopeEngine.lastMetrics) ? ScopeEngine.lastMetrics : {};
    
    // Grab scene intent from Director chat if any
    let sceneIntent = 'Studio Take';
    if (typeof ChatManager !== 'undefined') {
      const history = ChatManager.getHistory();
      const lastUser = [...history].reverse().find(m => m.role === 'user');
      if (lastUser && lastUser.text) {
        sceneIntent = lastUser.text.slice(0, 35) + (lastUser.text.length > 35 ? '...' : '');
      }
    }

    const advice = (typeof AnalyzerManager !== 'undefined' && AnalyzerManager.lastAdvice) ? AnalyzerManager.lastAdvice : null;
    const lightingDiagram = advice && advice.lighting_diagram ? advice.lighting_diagram : null;

    this.addTake({
      frameBase64: fullDataUrl,
      sceneIntent,
      telemetry,
      advice,
      lightingDiagram
    });
  },

  addTake(data) {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];

    const take = {
      id: `take_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      takeNumber: this.takeCounter++,
      timestamp: timeStr,
      frameBase64: data.frameBase64,
      sceneIntent: data.sceneIntent || 'Studio Take',
      telemetry: {
        shadow_clip_pct: data.telemetry?.shadow_clip_pct ?? '--',
        highlight_clip_pct: data.telemetry?.highlight_clip_pct ?? '--',
        mean_luminance: data.telemetry?.mean_luminance ?? '--'
      },
      advice: data.advice || null,
      lightingDiagram: data.lightingDiagram || null
    };

    this.takes.push(take);
    this.saveToStorage();
    this.render();

    // Automatically make this the reference frame for A/B Wipe if GradingEngine exists
    const engine = window.GradingEngine || (typeof GradingEngine !== 'undefined' ? GradingEngine : null);
    if (engine && typeof engine.saveTakeA === 'function') {
      engine.saveTakeA(take.frameBase64, take.telemetry);
    }

    // Scroll strip to right to show newest take
    if (this.stripEl) {
      setTimeout(() => {
        this.stripEl.scrollTo({ left: this.stripEl.scrollWidth, behavior: 'smooth' });
      }, 50);
    }

    return take;
  },

  removeTake(id) {
    this.takes = this.takes.filter(t => t.id !== id);
    this.saveToStorage();
    this.render();
  },

  clearTakes() {
    this.takes = [];
    this.takeCounter = 1;
    this.saveToStorage();
    this.render();
  },

  render() {
    if (!this.stripEl) return;

    if (this.subtitleEl) {
      this.subtitleEl.textContent = `${this.takes.length} take${this.takes.length === 1 ? '' : 's'}`;
    }

    if (this.takes.length === 0) {
      if (this.emptyEl) this.emptyEl.style.display = 'flex';
      // Remove all take cards
      const cards = this.stripEl.querySelectorAll('.take-card');
      cards.forEach(c => c.remove());
      if (this.exportBtn) this.exportBtn.disabled = true;
      if (this.clearBtn) this.clearBtn.disabled = true;
      return;
    }

    if (this.emptyEl) this.emptyEl.style.display = 'none';
    if (this.exportBtn) this.exportBtn.disabled = false;
    if (this.clearBtn) this.clearBtn.disabled = false;

    // Render cards
    const existingCards = this.stripEl.querySelectorAll('.take-card');
    existingCards.forEach(c => c.remove());

    this.takes.forEach((take) => {
      const card = document.createElement('div');
      card.className = 'take-card';
      card.dataset.id = take.id;
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `Take ${take.takeNumber} (${take.sceneIntent || 'Studio Take'})`);

      card.innerHTML = `
        <div class="take-thumb-wrapper">
          <img src="${take.frameBase64}" alt="Take ${take.takeNumber}" class="take-thumb-img" loading="lazy">
          <span class="take-badge">TK ${take.takeNumber < 10 ? '0' + take.takeNumber : take.takeNumber}</span>
          <div class="take-hover-actions">
            <button type="button" class="btn-take-action btn-set-ref" title="Set as Take A for A/B Wipe">WIPE</button>
            <button type="button" class="btn-take-action btn-take-critique" title="Load advice for this take">INSPECT</button>
            <button type="button" class="btn-take-action btn-take-del" title="Delete take">✕</button>
          </div>
        </div>
        <div class="take-info">
          <div class="take-row-top">
            <span class="take-time">${take.timestamp}</span>
            <span class="take-luma">L:${take.telemetry.mean_luminance}</span>
          </div>
          <div class="take-row-metrics">
            <span class="tk-metric sh">S:${take.telemetry.shadow_clip_pct}%</span>
            <span class="tk-metric hl">H:${take.telemetry.highlight_clip_pct}%</span>
          </div>
        </div>
      `;

      // Event listeners for take card actions
      const setRefBtn = card.querySelector('.btn-set-ref');
      setRefBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const engine = window.GradingEngine || (typeof GradingEngine !== 'undefined' ? GradingEngine : null);
        if (engine && typeof engine.saveTakeA === 'function') {
          await engine.saveTakeA(take.frameBase64, take.telemetry);
        }
      });

      const critiqueBtn = card.querySelector('.btn-take-critique');
      critiqueBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const analyzer = window.AnalyzerManager || (typeof AnalyzerManager !== 'undefined' ? AnalyzerManager : null);
        if (take.advice && analyzer && typeof analyzer.renderAdvice === 'function') {
          analyzer.renderAdvice(take.advice);
        }
      });

      const delBtn = card.querySelector('.btn-take-del');
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeTake(take.id);
      });

      const selectTake = async () => {
        const engine = window.GradingEngine || (typeof GradingEngine !== 'undefined' ? GradingEngine : null);
        if (engine && typeof engine.saveTakeA === 'function') {
          await engine.saveTakeA(take.frameBase64, take.telemetry);
        }
        const analyzer = window.AnalyzerManager || (typeof AnalyzerManager !== 'undefined' ? AnalyzerManager : null);
        if (take.advice && analyzer && typeof analyzer.renderAdvice === 'function') {
          analyzer.renderAdvice(take.advice);
        }
      };

      // Clicking or pressing Enter/Space previews / sets as reference
      card.addEventListener('click', selectTake);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectTake();
        }
      });

      this.stripEl.appendChild(card);
    });
  },

  exportLookbook() {
    if (this.takes.length === 0) {
      alert('No takes to export. Analyze a frame or click + TAKE first.');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Popup blocker prevented opening the Lookbook. Please allow popups for this site.');
      return;
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const takesHtml = this.takes.map((t) => {
      const angles = (t.advice && t.advice.angles) ? t.advice.angles : 'Standard camera height and perspective.';
      const lighting = (t.advice && t.advice.lighting) ? t.advice.lighting : 'Natural balanced lighting.';
      const composition = (t.advice && t.advice.composition) ? t.advice.composition : 'Rule of thirds composition.';

      return `
        <article class="lookbook-take-page">
          <header class="take-header">
            <div class="take-tag">TAKE ${t.takeNumber < 10 ? '0' + t.takeNumber : t.takeNumber}</div>
            <div class="take-meta-right">
              <span class="time-stamp">${t.timestamp}</span>
              <span class="intent-badge">${this.escapeHtml(t.sceneIntent)}</span>
            </div>
          </header>

          <div class="take-visual-row">
            <div class="take-frame-hero">
              <img src="${t.frameBase64}" alt="Take ${t.takeNumber}">
            </div>
            <div class="take-telemetry-col">
              <div class="telemetry-box">
                <h4>EXPOSURE TELEMETRY</h4>
                <div class="metric-line"><span>Shadow Clipping:</span> <strong>${t.telemetry.shadow_clip_pct}%</strong></div>
                <div class="metric-line"><span>Highlight Clipping:</span> <strong>${t.telemetry.highlight_clip_pct}%</strong></div>
                <div class="metric-line"><span>Mean Luminance:</span> <strong>${t.telemetry.mean_luminance}</strong></div>
              </div>
            </div>
          </div>

          <div class="take-critique-grid">
            <div class="critique-item">
              <h4>CAMERA &amp; ANGLES</h4>
              <p>${this.formatAdviceForPrint(angles)}</p>
            </div>
            <div class="critique-item">
              <h4>LIGHTING &amp; EXPOSURE</h4>
              <p>${this.formatAdviceForPrint(lighting)}</p>
            </div>
            <div class="critique-item">
              <h4>COMPOSITION &amp; DEPTH</h4>
              <p>${this.formatAdviceForPrint(composition)}</p>
            </div>
          </div>
        </article>
      `;
    }).join('\n');

    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Aperture Lookbook — ${dateStr}</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 14mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #111215;
      color: #e5e5e5;
      padding: 24px;
      line-height: 1.5;
    }
    .print-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 18px;
      background: #1a1c22;
      border: 1px solid #313540;
      border-radius: 8px;
      margin-bottom: 24px;
    }
    .print-btn {
      background: #e8a33d;
      color: #0b0c0e;
      border: none;
      padding: 8px 18px;
      font-weight: 700;
      font-size: 13px;
      letter-spacing: 0.04em;
      border-radius: 4px;
      cursor: pointer;
    }
    .lookbook-cover {
      border-bottom: 2px solid #e8a33d;
      padding-bottom: 18px;
      margin-bottom: 30px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .lookbook-title {
      font-size: 26px;
      font-weight: 700;
      letter-spacing: 0.05em;
      color: #ffffff;
    }
    .lookbook-title span {
      color: #e8a33d;
    }
    .lookbook-meta {
      font-size: 12px;
      color: #9297a5;
    }
    .lookbook-take-page {
      background: #16181d;
      border: 1px solid #282c37;
      border-radius: 8px;
      padding: 18px;
      margin-bottom: 28px;
      page-break-after: always;
    }
    .take-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
      border-bottom: 1px solid #282c37;
      padding-bottom: 8px;
    }
    .take-tag {
      font-size: 16px;
      font-weight: 700;
      color: #e8a33d;
      letter-spacing: 0.06em;
    }
    .take-meta-right {
      display: flex;
      gap: 12px;
      align-items: center;
    }
    .time-stamp {
      font-size: 12px;
      color: #8c92a4;
      font-variant-numeric: tabular-nums;
    }
    .intent-badge {
      background: rgba(232, 163, 61, 0.15);
      border: 1px solid rgba(232, 163, 61, 0.4);
      color: #e8a33d;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }
    .take-visual-row {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 16px;
      margin-bottom: 16px;
    }
    .take-frame-hero img {
      width: 100%;
      height: 240px;
      object-fit: cover;
      border-radius: 6px;
      border: 1px solid #2a2e3b;
      display: block;
    }
    .telemetry-box {
      background: #101114;
      border: 1px solid #282c37;
      border-radius: 6px;
      padding: 14px;
      height: 100%;
    }
    .telemetry-box h4 {
      font-size: 11px;
      color: #8c92a4;
      letter-spacing: 0.05em;
      margin-bottom: 12px;
      border-bottom: 1px solid #20242e;
      padding-bottom: 4px;
    }
    .metric-line {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      margin-bottom: 8px;
      color: #cbd0df;
    }
    .metric-line strong {
      color: #e8a33d;
      font-variant-numeric: tabular-nums;
    }
    .take-critique-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 12px;
    }
    .critique-item {
      background: #101114;
      border: 1px solid #222631;
      border-radius: 6px;
      padding: 12px;
    }
    .critique-item h4 {
      font-size: 11px;
      color: #8c92a4;
      letter-spacing: 0.05em;
      margin-bottom: 6px;
      text-transform: uppercase;
    }
    .critique-item p {
      font-size: 11.5px;
      color: #d1d5db;
      line-height: 1.45;
      white-space: pre-line;
    }
    @media print {
      body {
        background: #ffffff !important;
        color: #111111 !important;
        padding: 0;
      }
      .print-bar {
        display: none !important;
      }
      .lookbook-take-page {
        background: #ffffff !important;
        border: 1px solid #cccccc !important;
        page-break-after: always;
        color: #111111 !important;
      }
      .take-tag {
        color: #b36b00 !important;
      }
      .telemetry-box, .critique-item {
        background: #f7f7f7 !important;
        border-color: #e0e0e0 !important;
        color: #222222 !important;
      }
      .critique-item p {
        color: #222222 !important;
      }
      .metric-line strong {
        color: #b36b00 !important;
      }
    }
  </style>
</head>
<body>
  <div class="print-bar">
    <div><strong>Aperture Production Lookbook</strong> — ${this.takes.length} Takes Recorded</div>
    <button class="print-btn" onclick="window.print()">PRINT / SAVE AS PDF</button>
  </div>

  <header class="lookbook-cover">
    <div>
      <h1 class="lookbook-title">APERTURE <span>LOOKBOOK</span></h1>
      <p class="lookbook-meta">Director of Photography Field Report &amp; Scene Progression</p>
    </div>
    <div class="lookbook-meta">
      <div>Date: ${dateStr}</div>
      <div>Total Takes: ${this.takes.length}</div>
    </div>
  </header>

  <main>
    ${takesHtml}
  </main>
</body>
</html>`;

    printWindow.document.write(fullHtml);
    printWindow.document.close();
  },

  formatAdviceForPrint(adviceText) {
    if (!adviceText) return '';
    return this.escapeHtml(adviceText);
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
};

window.TakeReelManager = TakeReelManager;
