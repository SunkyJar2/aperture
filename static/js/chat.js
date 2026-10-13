/**
 * Aperture — Director Chat Dialogue (Laptop 2 Workstream)
 * Implements prd.md > Features and Behavior > Director Chat
 * Spec ref: Component 3. Director Chat
 */

const ChatManager = {
  history: [],
  isSubmitting: false,

  // Curated scene preset recommendations
  presets: [
    { label: '🎬 Noir Interrogation', prompt: 'tense noir interrogation with heavy shadows and high-contrast desk lamp' },
    { label: '🌅 Golden Hour', prompt: 'warm nostalgic golden hour reunion with soft lens flare and rim lighting' },
    { label: '⚡ Cyberpunk Neon', prompt: 'gritty neo-tokyo cyberpunk street with cyan practicals and magenta kickers' },
    { label: '🔦 Claustrophobic Thriller', prompt: 'claustrophobic psychological thriller with suffocating negative fill' },
    { label: '☕ Indie Melancholy', prompt: 'subdued, naturalistic indie drama with soft window bounce and muted midtones' },
    { label: '👻 Eerie Horror', prompt: 'slow-burn eerie horror with deep unexposed shadows and ominous negative space' }
  ],

  // Common directorial responses to DP clarifying probes
  followUpChips: [
    'Subject holds quiet emotional leverage',
    'Subject feels cornered and powerless',
    'Single harsh unshielded overhead light',
    'Soft diffused wrap-around bounce',
    'Off-axis negative fill with heavy falloff',
    'Claustrophobic low-angle perspective'
  ],

  init() {
    this.panelEl = document.querySelector('.chat-panel');
    this.formEl = document.getElementById('chatForm');
    this.inputEl = document.getElementById('chatInput');
    this.logEl = document.getElementById('chatLog');

    this.injectStyles();
    this.renderHeaderControls();
    this.renderPresetChips();
    this.bindEvents();

    console.log('[ChatManager] Initialized with scene presets and quick-replies.');
  },

  injectStyles() {
    if (document.getElementById('director-chat-styles')) return;

    const styleEl = document.createElement('style');
    styleEl.id = 'director-chat-styles';
    styleEl.textContent = `
      /* Director Chat Enhanced Styles (Laptop 2) */
      .chat-presets-bar {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        background: #14161a;
        border-top: 1px solid var(--border-subtle);
        overflow-x: auto;
        white-space: nowrap;
        scrollbar-width: thin;
        scrollbar-color: var(--border-muted) transparent;
      }
      .chat-presets-bar::-webkit-scrollbar {
        height: 4px;
      }
      .chat-presets-bar::-webkit-scrollbar-thumb {
        background: var(--border-muted);
        border-radius: 2px;
      }
      .preset-chip-label {
        font-family: var(--font-mono);
        font-size: 9px;
        color: var(--accent-amber);
        letter-spacing: 0.5px;
        text-transform: uppercase;
        flex-shrink: 0;
        font-weight: 600;
      }
      .preset-chip {
        background: var(--bg-surface);
        border: 1px solid var(--border-muted);
        color: var(--text-secondary);
        font-size: 11px;
        padding: 3px 8px;
        border-radius: 12px;
        cursor: pointer;
        flex-shrink: 0;
        transition: all 0.15s ease;
        font-family: var(--font-sans);
      }
      .preset-chip:hover {
        background: var(--bg-card);
        border-color: var(--accent-amber);
        color: var(--text-primary);
        box-shadow: 0 0 6px rgba(245, 158, 11, 0.2);
        transform: translateY(-1px);
      }

      /* Quick-reply follow-up suggestions */
      .quick-replies-wrap {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 6px;
        padding-left: 32px;
        animation: chatFadeIn 0.2s ease-out;
      }
      .quick-reply-pill {
        background: rgba(245, 158, 11, 0.08);
        border: 1px dashed var(--accent-amber);
        color: var(--accent-amber);
        font-size: 11px;
        padding: 3px 9px;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.15s ease;
        font-family: var(--font-mono);
      }
      .quick-reply-pill:hover {
        background: var(--accent-amber);
        color: #0e1013;
        border-style: solid;
        box-shadow: 0 0 8px var(--accent-amber-glow);
      }

      /* Message animations & timestamps */
      @keyframes chatFadeIn {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .chat-msg {
        animation: chatFadeIn 0.2s ease-out;
      }
      .msg-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 2px;
      }
      .msg-sender {
        font-family: var(--font-mono);
        font-size: 10px;
        font-weight: 700;
        color: var(--accent-amber);
        letter-spacing: 0.5px;
      }
      .chat-msg.user .msg-sender {
        color: var(--text-secondary);
      }
      .msg-time {
        font-family: var(--font-mono);
        font-size: 9px;
        color: var(--text-muted);
      }

      /* Animated typing indicator */
      .typing-wave {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 6px;
      }
      .typing-dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background-color: var(--accent-amber);
        animation: typingBlink 1.2s infinite ease-in-out;
      }
      .typing-dot:nth-child(2) { animation-delay: 0.2s; }
      .typing-dot:nth-child(3) { animation-delay: 0.4s; }
      @keyframes typingBlink {
        0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
        40% { opacity: 1; transform: scale(1.15); box-shadow: 0 0 4px var(--accent-amber); }
      }
      .typing-status {
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--text-muted);
        margin-left: 6px;
        font-style: italic;
      }

      /* Reset button in panel header */
      .btn-chat-reset {
        background: transparent;
        border: 1px solid var(--border-subtle);
        color: var(--text-muted);
        font-family: var(--font-mono);
        font-size: 9.5px;
        padding: 2px 7px;
        border-radius: 3px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        transition: all 0.15s ease;
      }
      .btn-chat-reset:hover {
        border-color: var(--accent-amber);
        color: var(--accent-amber);
        background: rgba(245, 158, 11, 0.08);
      }
    `;
    document.head.appendChild(styleEl);
  },

  renderHeaderControls() {
    const headerEl = this.panelEl.querySelector('.panel-header');
    if (!headerEl || headerEl.querySelector('.btn-chat-reset')) return;

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'btn-chat-reset';
    resetBtn.title = 'Reset dialogue session for a fresh scene';
    resetBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" stroke-width="2" fill="none">
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
        <path d="M21 3v5h-5"></path>
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
        <path d="M3 21v-5h5"></path>
      </svg>
      <span>RESET</span>
    `;

    resetBtn.addEventListener('click', () => this.resetSession());
    headerEl.appendChild(resetBtn);
  },

  renderPresetChips() {
    if (this.panelEl.querySelector('.chat-presets-bar')) return;

    const presetsBar = document.createElement('div');
    presetsBar.className = 'chat-presets-bar';

    const label = document.createElement('span');
    label.className = 'preset-chip-label';
    label.textContent = 'SCENE PRESETS:';
    presetsBar.appendChild(label);

    this.presets.forEach(p => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'preset-chip';
      chip.textContent = p.label;
      chip.title = `Click to load: "${p.prompt}"`;
      chip.addEventListener('click', () => {
        this.inputEl.value = p.prompt;
        this.inputEl.focus();
        this.submitMessage(p.prompt);
      });
      presetsBar.appendChild(chip);
    });

    // Insert presets bar right before chatForm
    this.panelEl.insertBefore(presetsBar, this.formEl);
  },

  bindEvents() {
    this.formEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = this.inputEl.value.trim();
      if (!text || this.isSubmitting) return;

      this.submitMessage(text);
    });

    // Keyboard support: Enter to send, Esc to clear
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.inputEl.value = '';
      }
    });
  },

  async submitMessage(text) {
    if (this.isSubmitting) return;
    this.isSubmitting = true;

    this.inputEl.value = '';
    this.removeQuickReplies();

    // Append user message with timestamp
    this.appendMessage('user', text);

    // Show animated typing indicator
    const typingId = this.showTypingIndicator();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: this.history
        })
      });

      this.removeTypingIndicator(typingId);

      if (res.ok) {
        const data = await res.json();
        this.appendMessage('model', data.reply);
        this.showQuickReplies();
      } else {
        const fallbackReply = "Understood. Let's frame your shot in the monitor and evaluate your lighting balance with Analyze Frame.";
        this.appendMessage('model', fallbackReply);
        this.showQuickReplies();
      }
    } catch (err) {
      console.error('[ChatManager] Message failed:', err);
      this.removeTypingIndicator(typingId);
      const fallbackReply = "Connected to co-director. Frame your shot and click 'Analyze Frame' to check your exposure telemetry.";
      this.appendMessage('model', fallbackReply);
      this.showQuickReplies();
    } finally {
      this.isSubmitting = false;
      this.inputEl.focus();
    }
  },

  appendMessage(role, text) {
    this.history.push({ role, text });

    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-msg ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.textContent = role === 'user' ? 'DIR' : 'DP';

    const content = document.createElement('div');
    content.className = 'msg-content';

    // Meta row with sender & timestamp
    const metaDiv = document.createElement('div');
    metaDiv.className = 'msg-meta';

    const sender = document.createElement('span');
    sender.className = 'msg-sender';
    sender.textContent = role === 'user' ? 'DIRECTOR' : 'CO-DIRECTOR (DP)';

    const time = document.createElement('span');
    time.className = 'msg-time';
    const now = new Date();
    time.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    metaDiv.appendChild(sender);
    metaDiv.appendChild(time);

    const p = document.createElement('p');
    p.textContent = text;

    content.appendChild(metaDiv);
    content.appendChild(p);

    msgDiv.appendChild(avatar);
    msgDiv.appendChild(content);

    this.logEl.appendChild(msgDiv);
    this.scrollToBottom();
  },

  showQuickReplies() {
    this.removeQuickReplies();

    const wrap = document.createElement('div');
    wrap.className = 'quick-replies-wrap';
    wrap.id = 'chatQuickReplies';

    // Pick 3-4 contextually helpful responses
    const chipsToShow = this.followUpChips.slice(0, 4);
    chipsToShow.forEach(replyText => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'quick-reply-pill';
      pill.textContent = `↳ ${replyText}`;
      pill.addEventListener('click', () => {
        this.submitMessage(replyText);
      });
      wrap.appendChild(pill);
    });

    this.logEl.appendChild(wrap);
    this.scrollToBottom();
  },

  removeQuickReplies() {
    const existing = document.getElementById('chatQuickReplies');
    if (existing) existing.remove();
  },

  showTypingIndicator() {
    const id = `typing-${Date.now()}`;
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-msg model typing';
    msgDiv.id = id;

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.textContent = 'DP';

    const content = document.createElement('div');
    content.className = 'msg-content';

    const wave = document.createElement('div');
    wave.className = 'typing-wave';
    wave.innerHTML = `
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
      <span class="typing-status">Evaluating lighting mood & framing...</span>
    `;

    content.appendChild(wave);
    msgDiv.appendChild(avatar);
    msgDiv.appendChild(content);

    this.logEl.appendChild(msgDiv);
    this.scrollToBottom();
    return id;
  },

  removeTypingIndicator(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  },

  scrollToBottom() {
    this.logEl.scrollTo({
      top: this.logEl.scrollHeight,
      behavior: 'smooth'
    });
  },

  resetSession() {
    if (this.history.length === 0) return;
    this.history = [];
    this.removeQuickReplies();

    this.logEl.innerHTML = `
      <div class="chat-msg model">
        <div class="msg-avatar">DP</div>
        <div class="msg-content">
          <div class="msg-meta">
            <span class="msg-sender">CO-DIRECTOR (DP)</span>
            <span class="msg-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <p>Session reset. Describe the scene you're framing (e.g. <em>"moody noir interrogation"</em> or <em>"warm golden-hour reunion"</em>) or click a preset below to begin.</p>
        </div>
      </div>
    `;
    this.inputEl.value = '';
    this.inputEl.focus();
    this.scrollToBottom();
    console.log('[ChatManager] Dialogue session reset.');
  },

  getHistory() {
    return this.history;
  }
};

