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

  drawHistogram(hist) {
    if (!this.ctx || !hist) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, w, h);

    // Draw background grid lines (25%, 50%, 75%)
    ctx.strokeStyle = '#1e222b';
    ctx.lineWidth = 1;
    for (let p of [0.25, 0.5, 0.75]) {
      ctx.beginPath();
      ctx.moveTo(p * w, 0);
      ctx.lineTo(p * w, h);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, p * h);
      ctx.lineTo(w, p * h);
      ctx.stroke();
    }

    // Helper to draw single channel curve
    const drawChannel = (bins, color, alpha) => {
      if (!bins || bins.length === 0) return;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.moveTo(0, h);

      for (let i = 0; i < bins.length; i++) {
        const x = (i / (bins.length - 1)) * w;
        const val = Math.min(bins[i], 1.0);
        const y = h - (val * (h - 8));
        ctx.lineTo(x, y);
      }

      ctx.stroke();
    };

    // Draw R, G, B channels with additive translucent blending
    ctx.globalCompositeOperation = 'screen';
    drawChannel(hist.r, '#ef4444', 0.6);
    drawChannel(hist.g, '#10b981', 0.6);
    drawChannel(hist.b, '#3b82f6', 0.6);

    // Draw Luma curve prominent in amber
    ctx.globalCompositeOperation = 'source-over';
    drawChannel(hist.luma, '#f59e0b', 0.9);
  }
};
