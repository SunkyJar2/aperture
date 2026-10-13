/**
 * Aperture — Director Chat Dialogue (Laptop 2 Workstream)
 * Implements prd.md > Features and Behavior > Director Chat
 */

const ChatManager = {
  history: [],

  init() {
    this.formEl = document.getElementById('chatForm');
    this.inputEl = document.getElementById('chatInput');
    this.logEl = document.getElementById('chatLog');

    this.bindEvents();
  },

  bindEvents() {
    this.formEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = this.inputEl.value.trim();
      if (!text) return;

      this.inputEl.value = '';
      this.appendMessage('user', text);

      // Show typing indicator
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
        } else {
          this.appendMessage('model', "I understand your vision. Let's frame the shot and analyze the lighting balance.");
        }
      } catch (err) {
        this.removeTypingIndicator(typingId);
        this.appendMessage('model', "Understood. Frame your shot and hit Analyze Frame to check your composition.");
      }
    });
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
    const p = document.createElement('p');
    p.textContent = text;
    content.appendChild(p);

    msgDiv.appendChild(avatar);
    msgDiv.appendChild(content);

    this.logEl.appendChild(msgDiv);
    this.logEl.scrollTop = this.logEl.scrollHeight;
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
    content.innerHTML = '<span style="color:var(--text-muted);font-style:italic;">Evaluating creative vision...</span>';

    msgDiv.appendChild(avatar);
    msgDiv.appendChild(content);
    this.logEl.appendChild(msgDiv);
    this.logEl.scrollTop = this.logEl.scrollHeight;
    return id;
  },

  removeTypingIndicator(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  },

  getHistory() {
    return this.history;
  }
};
