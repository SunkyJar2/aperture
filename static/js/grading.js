/**
 * Aperture — Grading, False Color, Zebras & A/B Wipe Engine
 * Hardware-accelerated WebGL shader engine for live cinema monitoring.
 */

const GradingEngine = {
  gl: null,
  canvas: null,
  videoEl: null,
  program: null,
  textures: {
    live: null,
    ref: null,
  },
  uniforms: {},
  buffers: {},

  // State
  state: {
    lutMode: 0, // 0=none, 1=kodak2383, 2=tealorange, 3=noir, 4=bleach, 5=golden
    falseColor: false,
    zebras: false,
    abCompare: false,
    wipePos: 0.5,
    hasRef: false,
  },

  takeA: {
    image: null,
    metrics: null,
  },

  lutNames: ['passthrough', 'kodak2383', 'tealorange', 'noir', 'bleach', 'golden'],

  init() {
    this.canvas = document.getElementById('glMonitor');
    this.videoEl = document.getElementById('monitor');
    this.lutSelect = document.getElementById('lutSelect');
    this.fcBtn = document.getElementById('falseColorBtn');
    this.zebraBtn = document.getElementById('zebraBtn');
    this.abBtn = document.getElementById('abCompareBtn');
    this.abContainer = document.getElementById('abWipeContainer');
    this.abLine = document.getElementById('abWipeLine');
    this.abMetricA = document.getElementById('abMetricA');
    this.abMetricB = document.getElementById('abMetricB');

    if (!this.canvas || !this.videoEl) return;

    this.initWebGL();
    this.bindEvents();
    this.startRenderLoop();

    console.log('[GradingEngine] Initialized with WebGL shaders & A/B wipe.');
  },

  initWebGL() {
    const gl = this.canvas.getContext('webgl', {
      premultipliedAlpha: false,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) {
      console.warn('[GradingEngine] WebGL not supported, falling back to passthrough.');
      return;
    }
    this.gl = gl;

    const vsSource = `
      attribute vec2 a_position;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = vec2((a_position.x + 1.0) * 0.5, (1.0 - a_position.y) * 0.5);
      }
    `;

    const fsSource = `
      #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      #else
      precision mediump float;
      #endif
      varying vec2 v_texCoord;

      uniform sampler2D u_imageLive;
      uniform sampler2D u_imageRef;
      uniform bool u_hasRef;
      uniform bool u_abCompare;
      uniform float u_wipePos;

      uniform int u_lutMode;
      uniform bool u_falseColor;
      uniform bool u_zebras;
      uniform float u_zebraThreshold;
      uniform float u_time;
      uniform vec2 u_resolution;

      float getLuma(vec3 c) {
        return dot(c, vec3(0.2126, 0.7152, 0.0722));
      }

      vec3 applyKodak2383(vec3 c) {
        c = clamp(c, 0.0, 1.0);
        // Gentle gamma lift so indoor/low-light webcam scenes stay bright and detailed
        vec3 lifted = pow(max(c, vec3(0.0001)), vec3(0.86));
        float l = getLuma(lifted);

        // Smooth filmic toe & shoulder S-curve centered for natural indoor/studio exposure
        float s = smoothstep(0.02, 0.98, l);
        float curvedL = mix(l, s, 0.42);

        vec3 chroma = lifted / max(l, 0.001);
        vec3 film = clamp(chroma * curvedL, 0.0, 1.0);

        // Boost print stock color density in midtones
        float midWeight = 4.0 * curvedL * (1.0 - curvedL);
        film = clamp(mix(vec3(curvedL), film, 1.28 + 0.15 * midWeight), 0.0, 1.0);

        // Iconic Kodak 2383 split-tone: rich cyan-teal shadow toe + warm golden-amber print highlights
        vec3 shadowTint = vec3(0.04, 0.15, 0.24);
        vec3 midWarmth  = vec3(1.12, 1.01, 0.84);
        vec3 hiWarmth   = vec3(1.06, 0.97, 0.78);

        float shadowMask = pow(1.0 - curvedL, 1.6);
        film = mix(film, film + shadowTint, shadowMask * 0.65);
        film *= mix(midWarmth, hiWarmth, smoothstep(0.35, 0.92, curvedL));

        return clamp(film, 0.0, 1.0);
      }

      vec3 applyTealOrange(vec3 c) {
        c = clamp(c, 0.0, 1.0);
        float l = getLuma(c);
        float sCurve = mix(l, l * l * (3.0 - 2.0 * l), 0.35);

        // Push shadows/cool tones toward cinema teal and midtones/skin toward warm amber-orange
        vec3 tealShadow = vec3(0.04, 0.38, 0.52);
        vec3 orangeHigh = vec3(1.05, 0.72, 0.42);
        float shadowMask = 1.0 - smoothstep(0.0, 0.55, l);
        float highMask = smoothstep(0.25, 0.90, l);

        vec3 tinted = c;
        tinted = mix(tinted, mix(tinted, tealShadow, 0.55), shadowMask * 0.75);
        tinted = mix(tinted, tinted * orangeHigh, highMask * 0.55);

        // Restore clean luminance separation
        float newL = getLuma(tinted);
        tinted = tinted * (sCurve / max(newL, 0.001));
        return clamp(tinted, 0.0, 1.0);
      }

      vec3 applyNoir(vec3 c) {
        c = clamp(c, 0.0, 1.0);
        // Panchromatic B&W film weights (Kodak Double-X 5222: luminous skin tones, deep blue/cyan separation)
        float l = dot(c, vec3(0.32, 0.56, 0.12));

        // Lift mid-shadows first so indoor webcam faces glow, then apply dramatic silver-halide S-curve
        float lifted = pow(max(l, 0.0001), 0.84);
        float contrast = smoothstep(0.04, 0.94, lifted);
        float bw = mix(lifted, contrast, 0.68);

        // Subtle cool-silver highlight tint & deep velvety carbon blacks
        vec3 silverTone = vec3(bw * 0.98, bw * 0.99, min(1.0, bw * 1.03 + 0.01));
        return clamp(silverTone, 0.0, 1.0);
      }

      vec3 applyBleachBypass(vec3 c) {
        c = clamp(c, 0.0, 1.0);
        float l = getLuma(c);
        // Retain silver: desaturate 55% and blend with hard silver overlay curve
        vec3 desat = mix(c, vec3(l), 0.55);
        vec3 silverOverlay = l < 0.5
          ? (2.0 * desat * l)
          : (1.0 - 2.0 * (1.0 - desat) * (1.0 - l));
        vec3 result = mix(desat, silverOverlay, 0.50);
        // Cool metallic tint in midtones
        result *= vec3(0.97, 0.99, 1.03);
        return clamp(result, 0.0, 1.0);
      }

      vec3 applyGoldenWarmth(vec3 c) {
        c = clamp(c, 0.0, 1.0);
        c.r = min(1.0, c.r * 1.14 + 0.025);
        c.g = min(1.0, c.g * 1.04 + 0.01);
        c.b = c.b * 0.84;
        return clamp(c, 0.0, 1.0);
      }

      vec3 getFalseColor(float luma) {
        if (luma < 0.05) return vec3(0.55, 0.0, 0.85); // 0-5 IRE: Purple
        if (luma < 0.12) return vec3(0.0, 0.2, 0.9);   // 5-12 IRE: Blue
        if (luma < 0.38) return vec3(0.25, 0.25, 0.25);// 12-38 IRE: Dark gray
        if (luma < 0.52) return vec3(0.2, 0.8, 0.2);   // 38-52 IRE: Green
        if (luma < 0.65) return vec3(0.95, 0.45, 0.65);// 52-65 IRE: Pink (skin)
        if (luma < 0.75) return vec3(0.65, 0.65, 0.65);// 65-75 IRE: Mid gray
        if (luma < 0.88) return vec3(0.95, 0.9, 0.1);  // 75-88 IRE: Yellow
        if (luma < 0.95) return vec3(0.95, 0.55, 0.0); // 88-95 IRE: Orange
        return vec3(1.0, 0.05, 0.05);                  // 95-100 IRE: Red (clip)
      }

      void main() {
        vec2 uv = v_texCoord;
        vec4 baseColor;

        if (u_abCompare && u_hasRef) {
          float dividerWidth = 2.0 / u_resolution.x;
          if (abs(uv.x - u_wipePos) < dividerWidth) {
            gl_FragColor = vec4(0.91, 0.64, 0.24, 1.0); // Amber wipe line
            return;
          } else if (uv.x < u_wipePos) {
            baseColor = texture2D(u_imageRef, uv);
          } else {
            baseColor = texture2D(u_imageLive, uv);
          }
        } else {
          baseColor = texture2D(u_imageLive, uv);
        }

        vec3 rawRgb = clamp(baseColor.rgb, 0.0, 1.0);
        // Evaluate sensor exposure telemetry BEFORE LUT grading so LUTs never mask clipped highlights
        float rawLuma = getLuma(rawRgb);
        float maxChan = max(rawRgb.r, max(rawRgb.g, rawRgb.b));

        vec3 color = rawRgb;

        if (u_lutMode == 1) color = applyKodak2383(color);
        else if (u_lutMode == 2) color = applyTealOrange(color);
        else if (u_lutMode == 3) color = applyNoir(color);
        else if (u_lutMode == 4) color = applyBleachBypass(color);
        else if (u_lutMode == 5) color = applyGoldenWarmth(color);

        if (u_falseColor) {
          color = getFalseColor(rawLuma);
        }

        // Trigger Zebra stripes on highlights >= adaptive threshold (pre-LUT or post-LUT peak)
        float effectiveLuma = max(rawLuma, getLuma(color));
        float effectiveMax = max(maxChan, max(color.r, max(color.g, color.b)));
        if (u_zebras && (effectiveLuma >= u_zebraThreshold || effectiveMax >= min(0.90, u_zebraThreshold + 0.05))) {
          vec2 fragCoord = uv * u_resolution;
          float phase = mod(u_time * 28.0, 12.0);
          float diag = mod(fragCoord.x + fragCoord.y + phase, 12.0);
          bool isClip = (effectiveLuma >= 0.88 || effectiveMax >= 0.94);
          if (diag < 6.0) {
            color = vec3(0.05, 0.05, 0.05);
          } else if (isClip) {
            color = vec3(1.0, 0.25, 0.2);
          } else {
            color = vec3(1.0, 0.82, 0.18);
          }
        }

        gl_FragColor = vec4(color, 1.0);
      }
    `;

    const vs = this.compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[GradingEngine] Program link failed:', gl.getProgramInfoLog(program));
      return;
    }
    this.program = program;
    gl.useProgram(program);

    // Geometry quad
    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const posAttr = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

    // Uniform locations
    this.uniforms = {
      imageLive: gl.getUniformLocation(program, 'u_imageLive'),
      imageRef: gl.getUniformLocation(program, 'u_imageRef'),
      hasRef: gl.getUniformLocation(program, 'u_hasRef'),
      abCompare: gl.getUniformLocation(program, 'u_abCompare'),
      wipePos: gl.getUniformLocation(program, 'u_wipePos'),
      lutMode: gl.getUniformLocation(program, 'u_lutMode'),
      falseColor: gl.getUniformLocation(program, 'u_falseColor'),
      zebras: gl.getUniformLocation(program, 'u_zebras'),
      zebraThreshold: gl.getUniformLocation(program, 'u_zebraThreshold'),
      time: gl.getUniformLocation(program, 'u_time'),
      resolution: gl.getUniformLocation(program, 'u_resolution'),
    };

    // Create live texture
    this.textures.live = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.textures.live);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(this.uniforms.imageLive, 0);

    // Create ref texture
    this.textures.ref = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.textures.ref);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(this.uniforms.imageRef, 1);
  },

  compileShader(type, source) {
    const gl = this.gl;
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('[GradingEngine] Shader error:', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  },

  bindEvents() {
    // LUT Select
    if (this.lutSelect) {
      this.lutSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        const idx = this.lutNames.indexOf(val);
        this.setLUT(idx >= 0 ? idx : 0);
      });
    }

    // False Color Button
    if (this.fcBtn) {
      this.fcBtn.addEventListener('click', () => this.toggleFalseColor());
    }

    // Zebras Button
    if (this.zebraBtn) {
      this.zebraBtn.addEventListener('click', () => this.toggleZebras());
    }

    // A/B Compare Button
    if (this.abBtn) {
      this.abBtn.addEventListener('click', () => this.toggleABCompare());
    }

    // A/B Wipe Dragging
    this.initWipeDrag();

    // Keyboard Shortcuts (F=False Color, Z=Zebras, W=Wipe, L=Next LUT)
    document.addEventListener('keydown', (e) => {
      const el = document.activeElement;
      const tag = (el && el.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el && el.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        this.toggleFalseColor();
      } else if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        this.toggleZebras();
      } else if (e.key === 'w' || e.key === 'W') {
        if (this.state.hasRef) {
          e.preventDefault();
          this.toggleABCompare();
        }
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        const nextMode = (this.state.lutMode + 1) % this.lutNames.length;
        this.setLUT(nextMode);
      }
    });

    window.addEventListener('resize', () => this.resizeCanvas());
  },

  setLUT(modeIndex) {
    this.state.lutMode = modeIndex;
    if (this.lutSelect) {
      this.lutSelect.value = this.lutNames[modeIndex] || 'passthrough';
    }
    this.updateCanvasVisibility();
  },

  toggleFalseColor() {
    this.state.falseColor = !this.state.falseColor;
    if (this.fcBtn) {
      this.fcBtn.classList.toggle('active', this.state.falseColor);
      this.fcBtn.setAttribute('aria-pressed', String(this.state.falseColor));
    }
    this.updateCanvasVisibility();
  },

  toggleZebras() {
    this.state.zebras = !this.state.zebras;
    if (this.zebraBtn) {
      this.zebraBtn.classList.toggle('active', this.state.zebras);
      this.zebraBtn.setAttribute('aria-pressed', String(this.state.zebras));
    }
    this.updateCanvasVisibility();
  },

  toggleABCompare() {
    if (!this.state.hasRef) return;
    this.state.abCompare = !this.state.abCompare;
    if (this.abBtn) {
      this.abBtn.classList.toggle('active', this.state.abCompare);
      this.abBtn.setAttribute('aria-pressed', String(this.state.abCompare));
    }
    if (this.abContainer) {
      this.abContainer.classList.toggle('hidden', !this.state.abCompare);
    }
    this.updateCanvasVisibility();
  },

  updateCanvasVisibility() {
    const isEffectActive =
      this.state.lutMode > 0 ||
      this.state.falseColor ||
      this.state.zebras ||
      this.state.abCompare;

    if (this.canvas) {
      this.canvas.classList.toggle('active', isEffectActive);
    }
    if (this.videoEl) {
      this.videoEl.style.opacity = isEffectActive ? '0' : '1';
    }
  },

  initWipeDrag() {
    if (!this.abLine || !this.abContainer) return;
    let isDragging = false;

    const onPointerMove = (clientX) => {
      if (!isDragging) return;
      const rect = this.canvas.getBoundingClientRect();
      let norm = (clientX - rect.left) / rect.width;
      norm = Math.max(0.02, Math.min(0.98, norm));
      this.state.wipePos = norm;
      this.abLine.style.left = `${norm * 100}%`;
    };

    this.abLine.addEventListener('mousedown', (e) => {
      isDragging = true;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => onPointerMove(e.clientX));
    document.addEventListener('mouseup', () => {
      isDragging = false;
    });

    this.abLine.addEventListener('touchstart', (e) => {
      isDragging = true;
      e.preventDefault();
    });

    document.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches[0]) onPointerMove(e.touches[0].clientX);
    });

    document.addEventListener('touchend', () => {
      isDragging = false;
    });
  },

  saveTakeA(frameDataUrl, metrics) {
    if (!frameDataUrl) return Promise.resolve(false);

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        if (!this.gl) {
          resolve(false);
          return;
        }
        const gl = this.gl;
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.textures.ref);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

        this.state.hasRef = true;
        this.takeA.image = img;
        this.takeA.metrics = metrics || ScopeEngine.lastMetrics || {};

        if (this.abBtn) {
          this.abBtn.disabled = false;
          this.abBtn.classList.remove('disabled');
          this.abBtn.title = 'Compare Take A reference frame vs live adjustments (W)';
        }

        if (this.abMetricA) {
          const sh = this.takeA.metrics.shadow_clip_pct ?? '--';
          const hl = this.takeA.metrics.highlight_clip_pct ?? '--';
          const lu = this.takeA.metrics.mean_luminance ?? '--';
          this.abMetricA.textContent = `Sh:${sh}% | Hl:${hl}% | Lum:${lu}`;
        }
        resolve(true);
      };
      img.onerror = () => resolve(false);
      img.src = frameDataUrl;
    });
  },

  resizeCanvas() {
    if (!this.canvas || !this.videoEl) return;
    const w = this.videoEl.videoWidth || 640;
    const h = this.videoEl.videoHeight || 480;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      if (this.gl) {
        this.gl.viewport(0, 0, w, h);
      }
    }
  },

  /**
   * Computes an adaptive IRE threshold for Zebra striping so that:
   * - In bright scenes, Zebras trigger at >= 70% IRE (standard Zebra 2 highlight level).
   * - In normal/dim indoor webcam rooms, Zebras adapt to highlight the top ~10% brightest zone
   *   of the frame (down to 45% IRE) so Zebra feedback is always visible on the brightest highlights.
   */
  getAdaptiveZebraThreshold() {
    if (
      typeof ScopeEngine !== 'undefined' &&
      ScopeEngine.lastMetrics &&
      ScopeEngine.lastMetrics.histogram &&
      Array.isArray(ScopeEngine.lastMetrics.histogram.luma)
    ) {
      const lumaBins = ScopeEngine.lastMetrics.histogram.luma;
      let total = 0;
      for (let i = 0; i < lumaBins.length; i++) total += lumaBins[i];
      if (total > 0) {
        let accum = 0;
        const target = total * 0.10; // Top 10% brightest pixels
        for (let i = lumaBins.length - 1; i >= 0; i--) {
          accum += lumaBins[i];
          if (accum >= target) {
            const pct = i / 255.0;
            return Math.max(0.45, Math.min(0.70, pct));
          }
        }
      }
    }
    return 0.65;
  },

  /**
   * Draws the current frame with only the active LUT applied (no False Color, Zebras, or A/B Wipe)
   * onto a 2D canvas context for accurate Scopes, Take Reel, and AI frame capture.
   */
  drawCleanGradedFrame(ctx, width, height) {
    if (!this.gl || !this.program || this.state.lutMode === 0) return false;
    const gl = this.gl;

    gl.useProgram(this.program);
    gl.uniform1i(this.uniforms.lutMode, this.state.lutMode);
    gl.uniform1i(this.uniforms.falseColor, 0);
    gl.uniform1i(this.uniforms.zebras, 0);
    gl.uniform1i(this.uniforms.abCompare, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    ctx.drawImage(this.canvas, 0, 0, width, height);

    // Restore active monitoring overlays immediately
    if (this.state.falseColor || this.state.zebras || this.state.abCompare) {
      gl.uniform1i(this.uniforms.falseColor, this.state.falseColor ? 1 : 0);
      gl.uniform1i(this.uniforms.zebras, this.state.zebras ? 1 : 0);
      gl.uniform1f(this.uniforms.zebraThreshold, this.getAdaptiveZebraThreshold());
      gl.uniform1i(this.uniforms.abCompare, this.state.abCompare ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    return true;
  },

  startRenderLoop() {
    const gl = this.gl;
    if (!gl) return;

    const render = (timeMs) => {
      requestAnimationFrame(render);

      const snapshotOverlay = document.getElementById('mobileSnapshotOverlay');
      const hasSnapshot = Boolean(
        snapshotOverlay &&
        snapshotOverlay.src &&
        snapshotOverlay.style.display !== 'none' &&
        snapshotOverlay.complete &&
        snapshotOverlay.naturalWidth > 0
      );
      const hasVideo = Boolean(this.videoEl && this.videoEl.readyState >= 2);

      // Draw when either live video or mobile snapshot is active
      if (!hasVideo && !hasSnapshot) return;

      const sourceEl = hasSnapshot ? snapshotOverlay : this.videoEl;
      const srcW = hasSnapshot ? (snapshotOverlay.naturalWidth || 1280) : (this.videoEl.videoWidth || 640);
      const srcH = hasSnapshot ? (snapshotOverlay.naturalHeight || 720) : (this.videoEl.videoHeight || 480);

      if (this.canvas.width !== srcW || this.canvas.height !== srcH) {
        this.canvas.width = srcW;
        this.canvas.height = srcH;
        gl.viewport(0, 0, srcW, srcH);
      }

      gl.useProgram(this.program);

      // Upload current source frame to texture 0
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.textures.live);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceEl);

      // Set uniforms (wrap time to prevent float precision loss over long sessions)
      gl.uniform1i(this.uniforms.lutMode, this.state.lutMode);
      gl.uniform1i(this.uniforms.falseColor, this.state.falseColor ? 1 : 0);
      gl.uniform1i(this.uniforms.zebras, this.state.zebras ? 1 : 0);
      gl.uniform1f(this.uniforms.zebraThreshold, this.getAdaptiveZebraThreshold());
      gl.uniform1i(this.uniforms.abCompare, this.state.abCompare ? 1 : 0);
      gl.uniform1i(this.uniforms.hasRef, this.state.hasRef ? 1 : 0);
      gl.uniform1f(this.uniforms.wipePos, this.state.wipePos);
      gl.uniform1f(this.uniforms.time, (timeMs * 0.001) % 60.0);
      gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // Update Live Telemetry label in A/B split if active
      if (this.state.abCompare && this.abMetricB && ScopeEngine.lastMetrics) {
        const m = ScopeEngine.lastMetrics;
        this.abMetricB.textContent = `Sh:${m.shadow_clip_pct}% | Hl:${m.highlight_clip_pct}% | Lum:${m.mean_luminance}`;
      }
    };

    requestAnimationFrame(render);
  },
};

window.GradingEngine = GradingEngine;
