/**
 * Aperture — Framing Guides & Overlays Engine
 * Provides broadcast and cinema framing graticules:
 * - Rule of Thirds (3×3 grid with power intersection crosses)
 * - Center Crosshair (+ micro-dot)
 * - Golden Ratio (Phi grid at 38.2% and 61.8%)
 * - Safe Areas (90% Action Safe & 80% Title Safe)
 * - Cinema Scope Matte (2.39:1 theatrical anamorphic crop)
 *
 * Automatically tracks the active video frame rect inside .viewport (accounting
 * for letterboxing/pillarboxing) so guides always align with actual camera footage.
 */

const GuidesManager = {
  // State of active overlays
  state: {
    thirds: false,
    center: false,
    golden: false,
    safe: false,
    scope: false,
  },

  init() {
    this.viewportEl = document.querySelector('.viewport');
    this.videoEl = document.getElementById('monitor');
    this.overlayLayer = document.getElementById('guidesOverlayLayer');
    this.svgEl = document.getElementById('guidesSvg');

    this.controlWrapper = document.getElementById('guidesControl');
    this.menuBtn = document.getElementById('guidesMenuBtn');
    this.menuEl = document.getElementById('guidesMenu');
    this.badgeEl = document.getElementById('guidesBadge');

    this.checkboxes = {
      thirds: document.getElementById('guideThirds'),
      center: document.getElementById('guideCenter'),
      golden: document.getElementById('guideGolden'),
      safe: document.getElementById('guideSafeAreas'),
      scope: document.getElementById('guideCinemaScope'),
    };

    this.clearBtn = document.getElementById('guideClearBtn');
    this.defaultBtn = document.getElementById('guideDefaultBtn');

    // Load persisted state if available
    this.loadState();

    this.bindEvents();
    this.updateOverlayPosition();
    this.render();

    console.log('[GuidesManager] Initialized with camera frame alignment.');
  },

  loadState() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('demo_guides')) {
        this.state.thirds = true;
        this.state.center = true;
        this.syncCheckboxes();
        if (urlParams.has('demo_menu')) {
          this.openMenu();
        }
        return;
      }

      const saved = localStorage.getItem('aperture_guides_state');
      if (saved) {
        const parsed = JSON.parse(saved);
        Object.keys(this.state).forEach((k) => {
          if (typeof parsed[k] === 'boolean') {
            this.state[k] = parsed[k];
          }
        });
      }
    } catch (e) {
      // Storage unavailable or disabled
    }

    this.syncCheckboxes();
  },

  saveState() {
    try {
      localStorage.setItem('aperture_guides_state', JSON.stringify(this.state));
    } catch (e) {}
  },

  bindEvents() {
    // Menu open/close toggle
    if (this.menuBtn && this.menuEl) {
      this.menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleMenu();
      });

      // Close menu on click outside
      document.addEventListener('click', (e) => {
        if (!this.controlWrapper.contains(e.target)) {
          this.closeMenu();
        }
      });

      // Close menu on Escape
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !this.menuEl.classList.contains('hidden')) {
          this.closeMenu();
          this.menuBtn.focus();
          return;
        }

        const el = document.activeElement;
        const tag = (el && el.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el && el.isContentEditable)) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        if (e.key === 'g' || e.key === 'G') {
          e.preventDefault();
          this.quickToggle();
        }
      });
    }

    // Checkbox changes
    Object.keys(this.checkboxes).forEach((key) => {
      const cb = this.checkboxes[key];
      if (cb) {
        cb.addEventListener('change', (e) => {
          this.state[key] = e.target.checked;
          this.saveState();
          this.render();
        });
      }
    });

    // Preset buttons
    if (this.clearBtn) {
      this.clearBtn.addEventListener('click', () => {
        Object.keys(this.state).forEach((k) => (this.state[k] = false));
        this.syncCheckboxes();
        this.saveState();
        this.render();
      });
    }

    if (this.defaultBtn) {
      this.defaultBtn.addEventListener('click', () => {
        Object.keys(this.state).forEach((k) => (this.state[k] = k === 'thirds'));
        this.syncCheckboxes();
        this.saveState();
        this.render();
      });
    }

    // Video events & window resize to keep overlay aligned
    if (this.videoEl) {
      ['loadedmetadata', 'play', 'resize', 'playing'].forEach((evt) => {
        this.videoEl.addEventListener(evt, () => this.updateOverlayPosition());
      });
    }

    window.addEventListener('resize', () => this.updateOverlayPosition());

    if (window.ResizeObserver && this.viewportEl) {
      const ro = new ResizeObserver(() => this.updateOverlayPosition());
      ro.observe(this.viewportEl);
    }
  },

  syncCheckboxes() {
    Object.keys(this.checkboxes).forEach((key) => {
      const cb = this.checkboxes[key];
      if (cb) cb.checked = !!this.state[key];
    });
  },

  toggleMenu() {
    const isClosed = this.menuEl.classList.contains('hidden');
    if (isClosed) {
      this.openMenu();
    } else {
      this.closeMenu();
    }
  },

  openMenu() {
    this.menuEl.classList.remove('hidden');
    this.menuBtn.setAttribute('aria-expanded', 'true');
    this.menuBtn.classList.add('menu-open');
  },

  closeMenu() {
    this.menuEl.classList.add('hidden');
    this.menuBtn.setAttribute('aria-expanded', 'false');
    this.menuBtn.classList.remove('menu-open');
  },

  /** Quick toggle hotkey (G): toggles Rule of Thirds on/off or re-activates last state */
  quickToggle() {
    const activeCount = this.getActiveCount();
    if (activeCount > 0) {
      // Remember and turn all off
      this._lastActiveState = { ...this.state };
      Object.keys(this.state).forEach((k) => (this.state[k] = false));
    } else {
      // Restore previous or default to thirds
      if (this._lastActiveState && Object.values(this._lastActiveState).some(Boolean)) {
        this.state = { ...this._lastActiveState };
      } else {
        this.state.thirds = true;
      }
    }
    this.syncCheckboxes();
    this.saveState();
    this.render();
  },

  getActiveCount() {
    return Object.values(this.state).filter(Boolean).length;
  },

  /**
   * Calculates the exact bounding rect of the rendered video frame inside .viewport
   * taking into account object-fit: contain letterboxing/pillarboxing.
   */
  getVideoRect() {
    if (!this.viewportEl) return { left: 0, top: 0, width: 0, height: 0, aspect: 16 / 9 };

    const vW = this.viewportEl.clientWidth;
    const vH = this.viewportEl.clientHeight;

    if (!vW || !vH) return { left: 0, top: 0, width: 0, height: 0, aspect: 16 / 9 };

    let videoAR = 16 / 9; // Default fallback aspect ratio
    if (this.videoEl && this.videoEl.videoWidth && this.videoEl.videoHeight) {
      videoAR = this.videoEl.videoWidth / this.videoEl.videoHeight;
    }

    const containerAR = vW / vH;
    let w, h, left, top;

    if (containerAR > videoAR) {
      // Container is wider than video: pillarboxed (black bars left and right)
      h = vH;
      w = h * videoAR;
      left = (vW - w) / 2;
      top = 0;
    } else {
      // Container is taller than video: letterboxed (black bars top and bottom)
      w = vW;
      h = w / videoAR;
      left = 0;
      top = (vH - h) / 2;
    }

    return {
      left: Math.round(left),
      top: Math.round(top),
      width: Math.round(w),
      height: Math.round(h),
      aspect: videoAR,
    };
  },

  updateOverlayPosition() {
    if (!this.overlayLayer) return;

    const rect = this.getVideoRect();
    if (rect.width > 0 && rect.height > 0) {
      this.overlayLayer.style.left = `${rect.left}px`;
      this.overlayLayer.style.top = `${rect.top}px`;
      this.overlayLayer.style.width = `${rect.width}px`;
      this.overlayLayer.style.height = `${rect.height}px`;
    } else {
      this.overlayLayer.style.left = '0px';
      this.overlayLayer.style.top = '0px';
      this.overlayLayer.style.width = '100%';
      this.overlayLayer.style.height = '100%';
    }

    // Re-render aspect-sensitive guides (like Cinema Scope) if dimensions shifted
    if (this.state.scope) {
      this.render();
    }
  },

  render() {
    const activeCount = this.getActiveCount();

    // Update button badge & active styling
    if (this.badgeEl) {
      if (activeCount > 0) {
        this.badgeEl.textContent = activeCount;
        this.badgeEl.classList.remove('hidden');
        this.menuBtn.classList.add('has-active');
      } else {
        this.badgeEl.classList.add('hidden');
        this.menuBtn.classList.remove('has-active');
      }
    }

    if (!this.svgEl) return;

    if (activeCount === 0) {
      this.svgEl.innerHTML = '';
      return;
    }

    let elements = [];

    // Common filter for high contrast over any footage
    elements.push(`
      <defs>
        <filter id="guideShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#000" flood-opacity="0.95" />
        </filter>
      </defs>
    `);

    // 1. Cinema Scope Matte (2.39:1 Anamorphic)
    if (this.state.scope) {
      elements.push(this.renderCinemaScope());
    }

    // 2. Safe Areas (90% Action / 80% Title)
    if (this.state.safe) {
      elements.push(this.renderSafeAreas());
    }

    // 3. Golden Ratio (Phi Grid: 38.2% and 61.8%)
    if (this.state.golden) {
      elements.push(this.renderGoldenRatio());
    }

    // 4. Rule of Thirds (3×3 Grid)
    if (this.state.thirds) {
      elements.push(this.renderRuleOfThirds());
    }

    // 5. Center Crosshair
    if (this.state.center) {
      elements.push(this.renderCenterCrosshair());
    }

    this.svgEl.innerHTML = elements.join('\n');
  },

  /** Renders 3x3 grid with power intersection markers */
  renderRuleOfThirds() {
    return `
      <g class="guide-group guide-thirds" filter="url(#guideShadow)">
        <!-- Vertical third lines -->
        <line x1="33.333%" y1="0%" x2="33.333%" y2="100%" class="guide-line" />
        <line x1="66.667%" y1="0%" x2="66.667%" y2="100%" class="guide-line" />

        <!-- Horizontal third lines -->
        <line x1="0%" y1="33.333%" x2="100%" y2="33.333%" class="guide-line" />
        <line x1="0%" y1="66.667%" x2="100%" y2="66.667%" class="guide-line" />

        <!-- Intersection point crosses (power points) -->
        ${this.renderIntersectionCross('33.333%', '33.333%')}
        ${this.renderIntersectionCross('66.667%', '33.333%')}
        ${this.renderIntersectionCross('33.333%', '66.667%')}
        ${this.renderIntersectionCross('66.667%', '66.667%')}
      </g>
    `;
  },

  renderIntersectionCross(cx, cy) {
    return `
      <g class="guide-power-point" transform="translate(0, 0)">
        <circle cx="${cx}" cy="${cy}" r="3.5" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="1" />
        <circle cx="${cx}" cy="${cy}" r="1" fill="rgba(255,255,255,0.95)" />
      </g>
    `;
  },

  /** Renders precision center mark with subtle gap and micro-dot */
  renderCenterCrosshair() {
    return `
      <g class="guide-group guide-center" filter="url(#guideShadow)">
        <!-- Horizontal crosshair with center gap -->
        <line x1="calc(50% - 24px)" y1="50%" x2="calc(50% - 5px)" y2="50%" class="guide-line-accent" />
        <line x1="calc(50% + 5px)" y1="50%" x2="calc(50% + 24px)" y2="50%" class="guide-line-accent" />

        <!-- Vertical crosshair with center gap -->
        <line x1="50%" y1="calc(50% - 24px)" x2="50%" y2="calc(50% - 5px)" class="guide-line-accent" />
        <line x1="50%" y1="calc(50% + 5px)" x2="50%" y2="calc(50% + 24px)" class="guide-line-accent" />

        <!-- Center micro-dot -->
        <circle cx="50%" cy="50%" r="1.5" fill="var(--accent-amber)" />

        <!-- Subtle outer targeting ring -->
        <circle cx="50%" cy="50%" r="32" fill="none" stroke="var(--accent-amber)" stroke-width="0.75" stroke-dasharray="3 3" opacity="0.45" />
      </g>
    `;
  },

  /** Renders Golden Ratio (Phi Grid at 38.2% and 61.8%) */
  renderGoldenRatio() {
    return `
      <g class="guide-group guide-golden" filter="url(#guideShadow)">
        <line x1="38.2%" y1="0%" x2="38.2%" y2="100%" class="guide-line-phi" />
        <line x1="61.8%" y1="0%" x2="61.8%" y2="100%" class="guide-line-phi" />
        <line x1="0%" y1="38.2%" x2="100%" y2="38.2%" class="guide-line-phi" />
        <line x1="0%" y1="61.8%" x2="100%" y2="61.8%" class="guide-line-phi" />

        <text x="38.6%" y="14" class="guide-tag">PHI 0.618</text>
      </g>
    `;
  },

  /** Renders 90% Action Safe & 80% Title Safe rectangles */
  renderSafeAreas() {
    return `
      <g class="guide-group guide-safe" filter="url(#guideShadow)">
        <!-- 90% Action Safe -->
        <rect x="5%" y="5%" width="90%" height="90%" fill="none" class="guide-line-safe-action" />
        <text x="5.5%" y="7.5%" class="guide-tag">90% ACTION</text>

        <!-- 80% Title Safe -->
        <rect x="10%" y="10%" width="80%" height="80%" fill="none" class="guide-line-safe-title" />
        <text x="10.5%" y="12.5%" class="guide-tag">80% TITLE</text>

        <!-- Corner ticks -->
        <path d="M 5% 7% L 5% 5% L 7% 5%" fill="none" class="guide-line-safe-action" />
        <path d="M 93% 5% L 95% 5% L 95% 7%" fill="none" class="guide-line-safe-action" />
        <path d="M 5% 93% L 5% 95% L 7% 95%" fill="none" class="guide-line-safe-action" />
        <path d="M 93% 95% L 95% 95% L 95% 93%" fill="none" class="guide-line-safe-action" />
      </g>
    `;
  },

  /** Renders 2.39:1 widescreen cinema matte letterbox */
  renderCinemaScope() {
    const rect = this.getVideoRect();
    const currentAR = rect.aspect || (16 / 9);
    const targetAR = 2.39;

    let barPct = 0;
    if (currentAR < targetAR) {
      // Frame is taller than 2.39:1 (e.g. 16:9), so matte bars go on top & bottom
      const visibleHeightFraction = currentAR / targetAR;
      barPct = Math.max(0, ((1 - visibleHeightFraction) / 2) * 100);
    }

    if (barPct <= 0) return '';

    const barStr = barPct.toFixed(2);
    const bottomY = (100 - barPct).toFixed(2);

    return `
      <g class="guide-group guide-scope">
        <!-- Top letterbox matte -->
        <rect x="0" y="0" width="100%" height="${barStr}%" fill="rgba(0, 0, 0, 0.68)" />
        <line x1="0" y1="${barStr}%" x2="100%" y2="${barStr}%" class="guide-line-scope" filter="url(#guideShadow)" />

        <!-- Bottom letterbox matte -->
        <rect x="0" y="${bottomY}%" width="100%" height="${barStr}%" fill="rgba(0, 0, 0, 0.68)" />
        <line x1="0" y1="${bottomY}%" x2="100%" y2="${bottomY}%" class="guide-line-scope" filter="url(#guideShadow)" />

        <!-- Cinema scope badge -->
        <text x="12" y="16" class="guide-tag-scope" filter="url(#guideShadow)">2.39:1 CINEMASCOPE</text>
      </g>
    `;
  },
};

window.GuidesManager = GuidesManager;
