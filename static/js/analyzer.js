/**
 * Aperture — Frame Analyzer & Advice Engine (Laptop 3 Workstream)
 * Implements prd.md > Features and Behavior > Analyze Frame and Advice Panel
 */

const AnalyzerManager = {
  isAnalyzing: false,

  init() {
    this.btn = document.getElementById('analyzeBtn');
    this.statusBadge = document.getElementById('adviceStatus');
    this.anglesText = document.getElementById('anglesText');
    this.lightingText = document.getElementById('lightingText');
    this.compositionText = document.getElementById('compositionText');

    this.bindEvents();
  },

  bindEvents() {
    this.btn.addEventListener('click', () => this.analyzeCurrentFrame());
  },

  async analyzeCurrentFrame() {
    if (this.isAnalyzing) return;

    // Grab current frame
    const frameBase64 = CameraManager.captureCurrentFrameBase64(1.0);
    if (!frameBase64) {
      alert('Camera is not active. Please select a camera source first.');
      return;
    }

    this.setLoading(true);

    try {
      const chatHistory = ChatManager.getHistory();
      const exposureMetrics = ScopeEngine.lastMetrics;

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: frameBase64,
          chat_history: chatHistory,
          exposure_metrics: exposureMetrics
        })
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const advice = await res.json();
      this.renderAdvice(advice);
    } catch (err) {
      console.error('Frame analysis failed:', err);
      this.anglesText.textContent = 'Could not reach analysis model. Verify server connection or GEMINI_API_KEY.';
      this.lightingText.textContent = 'Check telemetry scopes for baseline exposure guidance.';
      this.compositionText.textContent = 'Ensure subject aligns with vertical grid lines and maintains natural look room.';
      this.statusBadge.textContent = 'ANALYSIS ERROR';
    } finally {
      this.setLoading(false);
    }
  },

  setLoading(isLoading) {
    this.isAnalyzing = isLoading;
    if (isLoading) {
      this.btn.classList.add('loading');
      this.btn.querySelector('span').textContent = 'CRITIQUING...';
      this.statusBadge.textContent = 'AI EVALUATING SHOT';
      this.statusBadge.style.color = 'var(--accent-amber)';

      this.anglesText.style.opacity = '0.5';
      this.lightingText.style.opacity = '0.5';
      this.compositionText.style.opacity = '0.5';
    } else {
      this.btn.classList.remove('loading');
      this.btn.querySelector('span').textContent = 'ANALYZE FRAME';
      this.anglesText.style.opacity = '1';
      this.lightingText.style.opacity = '1';
      this.compositionText.style.opacity = '1';
    }
  },

  renderAdvice(advice) {
    if (advice.angles) this.anglesText.textContent = advice.angles;
    if (advice.lighting) this.lightingText.textContent = advice.lighting;
    if (advice.composition) this.compositionText.textContent = advice.composition;

    this.statusBadge.textContent = 'CRITIQUE UPDATED';
    this.statusBadge.style.color = 'var(--channel-g)';
  }
};
