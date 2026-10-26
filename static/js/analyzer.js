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
    this.lightingDiagramSvg = document.getElementById('lightingDiagramSvg');
    this.lightingFixturesLegend = document.getElementById('lightingFixturesLegend');
    this.lightingDiagramCard = document.getElementById('lightingDiagramCard');

    this.renderLightingDiagram(this.getDefaultLightingDiagram());

    this.bindEvents();
    if (typeof CameraManager !== 'undefined' && typeof CameraManager.isLive === 'function') {
      this.setButtonEnabled(CameraManager.isLive());
    }
  },

  setButtonEnabled(enabled) {
    if (!this.btn) return;
    this.btn.disabled = !enabled;
    if (enabled) {
      this.btn.title = "Analyze current live camera frame (Alt+A)";
    } else {
      this.btn.title = "Connect or select a live camera under Source to enable analysis";
    }
  },

  bindEvents() {
    if (this.btn) {
      this.btn.addEventListener('click', () => this.analyzeCurrentFrame());
    }

    // Keyboard shortcut Alt+A / Option+A to trigger frame analysis
    document.addEventListener('keydown', (e) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'a' || e.key === 'A')) {
        const el = document.activeElement;
        const tag = (el && el.tagName) || '';
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && !(el && el.isContentEditable)) {
          e.preventDefault();
          this.analyzeCurrentFrame();
        }
      }
    });
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      const chatHistory = ChatManager.getHistory();
      const exposureMetrics = ScopeEngine.lastMetrics;

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          image_base64: frameBase64,
          chat_history: chatHistory,
          exposure_metrics: exposureMetrics
        })
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const advice = await res.json();
      this.lastAdvice = advice;
      this.renderAdvice(advice);

      const fullDataUrl = frameBase64.startsWith('data:') ? frameBase64 : `data:image/jpeg;base64,${frameBase64}`;

      // Save as Take A reference for A/B Wipe comparison
      if (window.GradingEngine && typeof window.GradingEngine.saveTakeA === 'function') {
        window.GradingEngine.saveTakeA(fullDataUrl, exposureMetrics);
      }

      // Automatically log to Take Reel
      if (window.TakeReelManager && typeof window.TakeReelManager.addTake === 'function') {
        let sceneIntent = 'Analysis Capture';
        if (typeof ChatManager !== 'undefined') {
          const history = ChatManager.getHistory();
          const lastUser = [...history].reverse().find(m => m.role === 'user');
          if (lastUser && lastUser.text) {
            sceneIntent = lastUser.text.slice(0, 35) + (lastUser.text.length > 35 ? '...' : '');
          }
        }
        window.TakeReelManager.addTake({
          frameBase64: fullDataUrl,
          sceneIntent,
          telemetry: exposureMetrics,
          advice: advice,
          lightingDiagram: advice.lighting_diagram
        });
      }
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
    const isLive = typeof CameraManager !== 'undefined' && CameraManager.isLive();
    this.btn.disabled = isLoading || !isLive;
    this.btn.setAttribute('aria-busy', String(isLoading));

    if (isLoading) {
      this.btn.classList.add('loading');
      if (spanText) spanText.textContent = 'CRITIQUING...';
      if (this.statusBadge) {
        this.statusBadge.textContent = 'AI EVALUATING SHOT';
        this.statusBadge.style.color = 'var(--accent-amber)';
      }

      const skeletonHtml = `
        <div class="critique-skeleton" aria-hidden="true">
          <div class="skeleton-bar" style="width: 92%;"></div>
          <div class="skeleton-bar" style="width: 78%;"></div>
          <div class="skeleton-bar" style="width: 84%;"></div>
        </div>
      `;
      if (this.anglesText) this.anglesText.innerHTML = skeletonHtml;
      if (this.lightingText) this.lightingText.innerHTML = skeletonHtml;
      if (this.compositionText) this.compositionText.innerHTML = skeletonHtml;
    } else {
      this.btn.classList.remove('loading');
      if (spanText) spanText.textContent = 'ANALYZE FRAME';
    }
  },

  formatBullets(rawInput) {
    if (!rawInput || (Array.isArray(rawInput) && rawInput.length === 0)) {
      return '<p style="color:var(--text-muted);font-style:italic;">No advice available.</p>';
    }

    const rawText = Array.isArray(rawInput) ? rawInput.join('\n') : String(rawInput);
    if (!rawText.trim()) {
      return '<p style="color:var(--text-muted);font-style:italic;">No advice available.</p>';
    }

    // Split text by newlines or inline bullet markers (•)
    let lines = rawText
      .split(/\r?\n+|(?=\s*•\s+)/)
      .map(line => line.trim())
      .filter(line => line.length > 0);

    let items = [];
    for (const line of lines) {
      // Strip leading bullet characters: •, -, *, >, numbers with period or parenthesis
      const cleaned = line.replace(/^([•\-\*›►]|\d+[\.\)])\s*/, '').trim();
      if (cleaned) {
        items.push(cleaned);
      }
    }

    // If text was a single paragraph without line breaks or bullet markers, split into sentences safely
    // while avoiding splits after common abbreviations (e.g., i.e., vs., etc.)
    if (items.length <= 1 && rawText.length > 80) {
      const sentences = rawText
        .replace(/\b(e\.g|i\.e|vs|etc|approx|dr|mr|mrs|ms)\.\s+/gi, '$1.\u0000')
        .split(/(?<=[.!?])\s+(?=[A-Z])/)
        .map(s => s.replace(/\u0000/g, ' ').trim().replace(/^([•\-\*›►]|\d+[\.\)])\s*/, '').trim())
        .filter(Boolean);
      if (sentences.length > 1) {
        items = sentences;
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
    this.lastAdvice = advice;
    if (this.anglesText) {
      this.anglesText.innerHTML = this.formatBullets(advice && advice.angles);
    }
    if (this.lightingText) {
      this.lightingText.innerHTML = this.formatBullets(advice && advice.lighting);
    }
    if (this.compositionText) {
      this.compositionText.innerHTML = this.formatBullets(advice && advice.composition);
    }

    if (advice && advice.lighting_diagram) {
      this.renderLightingDiagram(advice.lighting_diagram);
    } else {
      this.renderLightingDiagram(this.getDefaultLightingDiagram());
    }

    if (this.statusBadge) {
      this.statusBadge.textContent = 'CRITIQUE UPDATED';
      this.statusBadge.style.color = 'var(--channel-g)';
    }
  },

  getDefaultLightingDiagram() {
    return {
      key: { angle: -45, intensity: 80, distance: 70, label: 'Key Light (45°)' },
      fill: { angle: 45, intensity: 40, distance: 80, label: 'Fill Light' },
      back: { angle: 135, intensity: 50, distance: 75, label: 'Rim Light' }
    };
  },

  renderLightingDiagram(diag) {
    if (!this.lightingDiagramSvg) return;
    if (!diag) diag = this.getDefaultLightingDiagram();

    const cx = 140;
    const cy = 95;
    const camX = 140;
    const camY = 175;

    const sources = [
      { key: 'key', data: diag.key, color: '#e8a33d', beamRgba: 'rgba(232, 163, 61, 0.22)', defaultAngle: -45, title: 'KEY LIGHT' },
      { key: 'fill', data: diag.fill, color: '#4c8dff', beamRgba: 'rgba(76, 141, 255, 0.18)', defaultAngle: 45, title: 'FILL LIGHT' },
      { key: 'back', data: diag.back, color: '#ffd166', beamRgba: 'rgba(255, 209, 102, 0.22)', defaultAngle: 135, title: 'RIM / BACKLIGHT' },
    ].filter(s => !!s.data);

    let beamsSvg = '';
    let fixturesSvg = '';
    let legendHtml = '';

    sources.forEach(src => {
      const angleDeg = src.data.angle ?? src.defaultAngle;
      const intensity = src.data.intensity ?? 70;
      const rawDist = src.data.distance ?? 70;
      const d = 35 + (Math.max(40, Math.min(100, rawDist)) * 0.45);
      const rad = (angleDeg * Math.PI) / 180;

      const fx = cx + d * Math.sin(rad);
      const fy = cy + d * Math.cos(rad);

      const dx = cx - fx;
      const dy = cy - fy;
      const len = Math.hypot(dx, dy) || 1;
      const perpX = (-dy / len) * 16;
      const perpY = (dx / len) * 16;

      const p1x = (cx + perpX).toFixed(1);
      const p1y = (cy + perpY).toFixed(1);
      const p2x = (cx - perpX).toFixed(1);
      const p2y = (cy - perpY).toFixed(1);

      beamsSvg += `
        <polygon points="${fx.toFixed(1)},${fy.toFixed(1)} ${p1x},${p1y} ${p2x},${p2y}"
          fill="${src.beamRgba}" stroke="${src.color}" stroke-opacity="0.3" stroke-width="0.75" />
      `;

      const align = fx > cx ? 'start' : 'end';
      const labelOffsetX = fx > cx ? 12 : -12;

      fixturesSvg += `
        <g class="diagram-fixture" data-role="${src.key}">
          <circle cx="${fx.toFixed(1)}" cy="${fy.toFixed(1)}" r="7" fill="#181a20" stroke="${src.color}" stroke-width="2" />
          <circle cx="${fx.toFixed(1)}" cy="${fy.toFixed(1)}" r="2.5" fill="${src.color}" />
          <text x="${(fx + labelOffsetX).toFixed(1)}" y="${(fy + 3).toFixed(1)}" fill="${src.color}"
            font-size="8.5" font-weight="600" text-anchor="${align}" font-family="var(--font-sans)">
            ${src.key.toUpperCase()} ${intensity}%
          </text>
        </g>
      `;

      legendHtml += `
        <div class="fixture-legend-pill pill-${src.key}">
          <span class="pill-dot" style="background:${src.color}"></span>
          <span class="pill-title">${src.title}:</span>
          <span class="pill-details">${src.data.label || src.title} (${angleDeg > 0 ? '+' : ''}${angleDeg}°, ${intensity}%)</span>
        </div>
      `;
    });

    this.lightingDiagramSvg.innerHTML = `
      <defs>
        <radialGradient id="stageGlow" cx="50%" cy="48%" r="50%">
          <stop offset="0%" stop-color="#242732" stop-opacity="0.3" />
          <stop offset="100%" stop-color="#0e1014" stop-opacity="0" />
        </radialGradient>
      </defs>

      <!-- Stage background glow & radar range rings -->
      <circle cx="${cx}" cy="${cy}" r="88" fill="url(#stageGlow)" />
      <circle cx="${cx}" cy="${cy}" r="40" fill="none" stroke="#252832" stroke-width="1" stroke-dasharray="3 3" />
      <circle cx="${cx}" cy="${cy}" r="75" fill="none" stroke="#252832" stroke-width="1" stroke-dasharray="3 3" />
      <line x1="${cx - 85}" y1="${cy}" x2="${cx + 85}" y2="${cy}" stroke="#1c1f26" stroke-width="1" />
      <line x1="${cx}" y1="${cy - 80}" x2="${cx}" y2="${camY}" stroke="#1c1f26" stroke-width="1" />

      <!-- Light Beams -->
      ${beamsSvg}

      <!-- Camera Sightline Frustum Cone -->
      <polygon points="${camX},${camY} ${cx - 24},${cy + 15} ${cx + 24},${cy + 15}" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" stroke-width="1" stroke-dasharray="2 2" />

      <!-- Subject / Actor Center Node -->
      <g class="diagram-subject">
        <circle cx="${cx}" cy="${cy}" r="13" fill="#181a20" stroke="#e8a33d" stroke-width="1.5" />
        <polygon points="${cx - 4},${cy + 8} ${cx + 4},${cy + 8} ${cx},${cy + 13}" fill="#e8a33d" />
        <text x="${cx}" y="${cy + 3}" fill="#f0f0f0" font-size="7" font-weight="700" text-anchor="middle" font-family="var(--font-sans)">ACTOR</text>
      </g>

      <!-- Camera Icon Node -->
      <g class="diagram-camera">
        <rect x="${camX - 14}" y="${camY - 7}" width="28" height="14" rx="2" fill="#22252e" stroke="#8c92a4" stroke-width="1.2" />
        <polygon points="${camX - 4},${camY - 7} ${camX + 4},${camY - 7} ${camX},${camY - 11}" fill="#8c92a4" />
        <text x="${camX}" y="${camY + 3}" fill="#cbd0df" font-size="7.5" font-weight="700" text-anchor="middle" font-family="var(--font-sans)">CAM</text>
      </g>

      <!-- Light Fixtures -->
      ${fixturesSvg}
    `;

    if (this.lightingFixturesLegend) {
      this.lightingFixturesLegend.innerHTML = legendHtml;
    }
  },

  renderError(message) {
    const fallbackAngles = '• Keep the camera right at eye level for a natural, engaging connection.\n• Maintain a comfortable distance (4–6 feet) to prevent wide-angle facial distortion.';
    const fallbackLighting = '• Check your exposure scopes: balance your main light so highlights and shadows retain clean detail.\n• Add a subtle light behind the subject to help separate them from the background.';
    const fallbackComposition = '• Place your subject along a rule-of-thirds line rather than dead center.\n• Leave comfortable headroom at the top and extra look room in the direction they are facing.';

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

window.AnalyzerManager = AnalyzerManager;
