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
    if (this.btn) {
      this.btn.addEventListener('click', () => this.analyzeCurrentFrame());
    }
  },

  async analyzeCurrentFrame() {
    if (this.isAnalyzing) return;

    // Grab full-resolution current frame from camera
    const frameBase64 = CameraManager.captureCurrentFrameBase64(1.0);
    if (!frameBase64) {
      if (this.statusBadge) {
        this.statusBadge.textContent = 'CAMERA INACTIVE';
        this.statusBadge.style.color = 'var(--channel-r)';
      }
      this.renderWarning(
        'Camera is not active. Please select a camera source in the top bar to enable live analysis.'
      );
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
      this.renderError(
        'Could not reach multimodal critique model. Verify server connection or GEMINI_API_KEY in .env.'
      );
    } finally {
      this.setLoading(false);
    }
  },

  setLoading(isLoading) {
    this.isAnalyzing = isLoading;
    if (!this.btn) return;

    const spanText = this.btn.querySelector('span');
    if (isLoading) {
      this.btn.classList.add('loading');
      if (spanText) spanText.textContent = 'CRITIQUING...';
      if (this.statusBadge) {
        this.statusBadge.textContent = 'AI EVALUATING SHOT';
        this.statusBadge.style.color = 'var(--accent-amber)';
      }

      if (this.anglesText) this.anglesText.style.opacity = '0.5';
      if (this.lightingText) this.lightingText.style.opacity = '0.5';
      if (this.compositionText) this.compositionText.style.opacity = '0.5';
    } else {
      this.btn.classList.remove('loading');
      if (spanText) spanText.textContent = 'ANALYZE FRAME';
      if (this.anglesText) this.anglesText.style.opacity = '1';
      if (this.lightingText) this.lightingText.style.opacity = '1';
      if (this.compositionText) this.compositionText.style.opacity = '1';
    }
  },

  formatBullets(rawText) {
    if (!rawText) return '<p style="color:var(--text-muted);font-style:italic;">No advice available.</p>';

    // Split text by newlines
    let lines = rawText
      .split(/\r?\n+/)
      .map(line => line.trim())
      .filter(line => line.length > 0);

    let items = [];
    for (const line of lines) {
      // Strip leading bullet characters: •, -, *, >, numbers with period or parenthesis
      const cleaned = line.replace(/^([•\-\*›►•]|\d+[\.\)])\s*/, '').trim();
      if (cleaned) {
        items.push(cleaned);
      }
    }

    // If text was a single paragraph without line breaks, split into sentences
    if (items.length <= 1 && rawText.length > 80) {
      const sentences = rawText.match(/[^.!?]+[.!?]+(\s|$)/g);
      if (sentences && sentences.length > 1) {
        items = sentences
          .map(s => s.trim().replace(/^([•\-\*›►•]|\d+[\.\)])\s*/, '').trim())
          .filter(Boolean);
      }
    }

    if (items.length === 0) {
      items = [rawText.trim()];
    }

    // Render formatted bulleted list matching DaVinci Resolve aesthetic
    return `
      <ul class="critique-bullet-list" style="list-style: none; padding: 0; margin: 4px 0 0 0; display: flex; flex-direction: column; gap: 8px;">
        ${items.map(item => `
          <li style="display: flex; align-items: flex-start; gap: 8px; font-size: 12px; line-height: 1.45; color: var(--text-primary);">
            <span style="color: var(--accent-amber); font-weight: bold; flex-shrink: 0; line-height: 1.4; font-size: 13px;">▸</span>
            <span style="flex: 1;">${this.escapeHtml(item)}</span>
          </li>
        `).join('')}
      </ul>
    `;
  },

  renderAdvice(advice) {
    if (this.anglesText && advice.angles) {
      this.anglesText.innerHTML = this.formatBullets(advice.angles);
    }
    if (this.lightingText && advice.lighting) {
      this.lightingText.innerHTML = this.formatBullets(advice.lighting);
    }
    if (this.compositionText && advice.composition) {
      this.compositionText.innerHTML = this.formatBullets(advice.composition);
    }

    if (this.statusBadge) {
      this.statusBadge.textContent = 'CRITIQUE UPDATED';
      this.statusBadge.style.color = 'var(--channel-g)';
    }
  },

  renderError(message) {
    const fallbackAngles = '• Maintain camera at subject eye level for clear perspective.\n• Avoid positioning too close to subject to prevent wide-angle distortion.';
    const fallbackLighting = '• Check OpenCV exposure scopes below monitor for highlight and shadow balance.\n• Adjust light placement to achieve defined separation from background.';
    const fallbackComposition = '• Place subject along rule-of-thirds grid line.\n• Ensure adequate headroom and generous look room in the direction of subject gaze.';

    if (this.anglesText) this.anglesText.innerHTML = this.formatBullets(fallbackAngles);
    if (this.lightingText) this.lightingText.innerHTML = this.formatBullets(fallbackLighting);
    if (this.compositionText) this.compositionText.innerHTML = this.formatBullets(fallbackComposition);

    if (this.statusBadge) {
      this.statusBadge.textContent = 'ANALYSIS ERROR';
      this.statusBadge.style.color = 'var(--channel-r)';
    }
  },

  renderWarning(message) {
    const warningBullet = `• ${message}`;
    if (this.anglesText) this.anglesText.innerHTML = this.formatBullets(warningBullet);
    if (this.lightingText) this.lightingText.innerHTML = this.formatBullets(warningBullet);
    if (this.compositionText) this.compositionText.innerHTML = this.formatBullets(warningBullet);
  },

  escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};
