/**
 * Aperture — Exposure Scope & Histogram Engine (Laptop 1 Workstream)
 * Implements prd.md > Features and Behavior > Live Exposure Histogram
 */

const ScopeEngine = {
  canvas: null,
  ctx: null,
  isPolling: false,
  pollIntervalMs: 300, // ~3.3 fps for smooth responsive feedback without CPU strain
  lastMetrics: null,

  init() {
    this.canvas = document.getElementById('scopeCanvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    this.shadowsEl = document.getElementById('telemetryShadows');
    this.highlightsEl = document.getElementById('telemetryHighlights');
    this.lumaEl = document.getElementById('telemetryLuma');

    // Resize canvas to match display
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    this.startPolling();
  },

  resizeCanvas() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * window.devicePixelRatio;
    this.canvas.height = rect.height * window.devicePixelRatio;
    if (this.lastMetrics) {
      this.drawHistogram(this.lastMetrics.histogram);
    }
  },

  startPolling() {
    if (this.isPolling) return;
    this.isPolling = true;

    const poll = async () => {
      if (!this.isPolling) return;

      const frameBase64 = CameraManager.captureCurrentFrameBase64(0.35); // Low-res thumbnail for histogram speed
      if (frameBase64) {
        try {
          const res = await fetch('/api/histogram', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_base64: frameBase64 })
          });
          if (res.ok) {
            const data = await res.json();
            this.lastMetrics = data;
            this.updateTelemetry(data);
            this.drawHistogram(data.histogram);
          }
        } catch (err) {
          // Graceful polling fallback
        }
      }

      setTimeout(poll, this.pollIntervalMs);
    };

    poll();
  },

  updateTelemetry(data) {
    if (this.shadowsEl) this.shadowsEl.textContent = `${data.shadow_clip_pct}%`;
    if (this.highlightsEl) this.highlightsEl.textContent = `${data.highlight_clip_pct}%`;
    if (this.lumaEl) this.lumaEl.textContent = `${data.mean_luminance}`;
  },

  /** 3-tap smoothing so the 256 raw bins render as a clean curve. */
  smoothBins(bins, passes = 2) {
    let out = bins.slice();
    for (let p = 0; p < passes; p++) {
      const next = out.slice();
      for (let i = 1; i < out.length - 1; i++) {
        next[i] = (out[i - 1] + 2 * out[i] + out[i + 1]) / 4;
      }
      out = next;
    }
    return out;
  },

  /** Trace a smooth (quadratic midpoint) curve for bins inside panel [x0, x0+pw]. */
  tracePath(ctx, bins, x0, pw, top, baseY) {
    const n = bins.length;
    const pt = (i) => [
      x0 + (i / (n - 1)) * pw,
      baseY - Math.min(Math.max(bins[i], 0), 1) * (baseY - top)
    ];
    let [px, py] = pt(0);
    ctx.moveTo(px, py);
    for (let i = 1; i < n; i++) {
      const [x, y] = pt(i);
      ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
      px = x; py = y;
    }
    ctx.lineTo(px, py);
  },

  /**
   * DaVinci Resolve-style RGB parade: three side-by-side panels (R | G | B),
   * each with a graticule, clipping zones, filled channel curve and a luma overlay.
   */
  drawHistogram(hist) {
    if (!this.ctx || !hist) return;
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0a0b0d';
    ctx.fillRect(0, 0, w, h);

    const gap = 6 * dpr;
    const padTop = 8 * dpr;
    const padBottom = 14 * dpr;
    const panelW = (w - gap * 2) / 3;
    const baseY = h - padBottom;
    const panels = [
      { bins: hist.r, color: '#ef4444', label: 'R' },
      { bins: hist.g, color: '#22c55e', label: 'G' },
      { bins: hist.b, color: '#3b82f6', label: 'B' }
    ];

    ctx.font = `${9 * dpr}px "JetBrains Mono", monospace`;
    ctx.textBaseline = 'alphabetic';

    panels.forEach((panel, idx) => {
      const x0 = idx * (panelW + gap);

      // Panel background + clipping zones (<10 shadows, >245 highlights)
      ctx.fillStyle = '#0f1115';
      ctx.fillRect(x0, padTop, panelW, baseY - padTop);
      ctx.fillStyle = 'rgba(59,130,246,0.10)';
      ctx.fillRect(x0, padTop, (10 / 255) * panelW, baseY - padTop);
      ctx.fillStyle = 'rgba(239,68,68,0.12)';
      ctx.fillRect(x0 + (245 / 255) * panelW, padTop, panelW - (245 / 255) * panelW, baseY - padTop);

      // Graticule: quarter lines
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const p of [0.25, 0.5, 0.75]) {
        const gx = Math.round(x0 + p * panelW) + 0.5;
        ctx.moveTo(gx, padTop); ctx.lineTo(gx, baseY);
        const gy = Math.round(padTop + p * (baseY - padTop)) + 0.5;
        ctx.moveTo(x0, gy); ctx.lineTo(x0 + panelW, gy);
      }
      ctx.stroke();

      if (panel.bins && panel.bins.length) {
        const bins = this.smoothBins(panel.bins);

        // Filled channel curve with vertical gradient
        const grad = ctx.createLinearGradient(0, padTop, 0, baseY);
        grad.addColorStop(0, panel.color + 'cc');
        grad.addColorStop(1, panel.color + '14');
        ctx.beginPath();
        ctx.moveTo(x0, baseY);
        this.tracePath(ctx, bins, x0, panelW, padTop, baseY);
        ctx.lineTo(x0 + panelW, baseY);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.beginPath();
        this.tracePath(ctx, bins, x0, panelW, padTop, baseY);
        ctx.strokeStyle = panel.color;
        ctx.lineWidth = 1.5 * dpr;
        ctx.lineJoin = 'round';
        ctx.stroke();
      }

      // Luma overlay (thin amber line) on every panel
      if (hist.luma && hist.luma.length) {
        ctx.beginPath();
        this.tracePath(ctx, this.smoothBins(hist.luma), x0, panelW, padTop, baseY);
        ctx.strokeStyle = 'rgba(245,158,11,0.85)';
        ctx.lineWidth = 1 * dpr;
        ctx.stroke();
      }

      // Panel frame + labels
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.strokeRect(x0 + 0.5, padTop + 0.5, panelW - 1, baseY - padTop - 1);
      ctx.fillStyle = panel.color;
      ctx.fillText(panel.label, x0 + 5 * dpr, padTop + 11 * dpr);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillText('0', x0 + 1 * dpr, h - 3 * dpr);
      ctx.fillText('128', x0 + panelW / 2 - 8 * dpr, h - 3 * dpr);
      ctx.fillText('255', x0 + panelW - 20 * dpr, h - 3 * dpr);
    });
  }
};
