/**
 * Aperture — Studio Mobile Camera Link Controller
 * Handles pairing modal, dynamic IP selection, QR code generation,
 * WebRTC P2P receiver with ICE queuing, direct snapshot fallback,
 * and remote camera telemetry/controls from laptop to smartphone.
 */

const MobileLinkStudio = {
  sessionId: '',
  pairingUrl: '',
  networkInfo: null,
  signalingWs: null,
  peerConnection: null,
  pendingCandidates: [],
  remoteStream: null,
  isConnected: false,

  // UI Elements
  linkBtn: null,
  modal: null,
  closeBtn: null,
  qrBox: null,
  urlInput: null,
  copyBtn: null,
  ipSelect: null,
  protocolSelect: null,
  testTabLink: null,
  statusBadge: null,
  remoteIsoSelect: null,
  remoteEvSlider: null,
  remoteEvVal: null,
  remoteTorchBtn: null,
  usbDirectBox: null,
  usbDeviceTitle: null,
  usbDeviceSubtitle: null,
  adbLaunchBtn: null,
  isTorchOn: false,

  init() {
    if (this._initialized) return;
    this._initialized = true;

    this.linkBtn = document.getElementById('mobileLinkBtn');
    this.modal = document.getElementById('mobileLinkModal');
    this.closeBtn = document.getElementById('closeMobileModalBtn');
    this.qrBox = document.getElementById('qrCodeCanvasBox');
    this.urlInput = document.getElementById('mobilePairingUrl');
    this.copyBtn = document.getElementById('copyPairingUrlBtn');
    this.ipSelect = document.getElementById('mobileIpSelect');
    this.protocolSelect = document.getElementById('mobileProtocolSelect');
    this.testTabLink = document.getElementById('mobileTestTabLink');
    this.statusBadge = document.getElementById('remoteStatusBadge');
    this.remoteIsoSelect = document.getElementById('remoteIso');
    this.remoteEvSlider = document.getElementById('remoteEv');
    this.remoteEvVal = document.getElementById('remoteEvVal');
    this.remoteTorchBtn = document.getElementById('remoteTorchBtn');
    this.usbDirectBox = document.getElementById('usbDirectBox');
    this.usbDeviceTitle = document.getElementById('usbDeviceTitle');
    this.usbDeviceSubtitle = document.getElementById('usbDeviceSubtitle');
    this.adbLaunchBtn = document.getElementById('adbLaunchBtn');

    // Generate or restore persistent session ID with cryptographic randomness
    let storedSession = localStorage.getItem('aperture_mobile_session');
    if (!storedSession) {
      const randBytes = new Uint8Array(4);
      window.crypto.getRandomValues(randBytes);
      const randHex = Array.from(randBytes, b => b.toString(16).padStart(2, '0')).join('');
      storedSession = `studio_${randHex}`;
      localStorage.setItem('aperture_mobile_session', storedSession);
    }
    this.sessionId = storedSession;

    this.bindEvents();
    this.initSignaling();

    console.log('[MobileLinkStudio] Initialized for session:', this.sessionId);
  },

  bindEvents() {
    if (this.linkBtn) {
      this.linkBtn.addEventListener('click', () => this.openModal());
    }

    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.closeModal());
    }

    if (this.modal) {
      this.modal.addEventListener('close', () => {
        this.modal.classList.add('hidden');
        const target = (this._triggerElement && this._triggerElement !== document.body) ? this._triggerElement : this.linkBtn;
        if (target && typeof target.focus === 'function') {
          target.focus();
        }
        this._triggerElement = null;
      });
      const backdrop = this.modal.querySelector('.modal-backdrop');
      if (backdrop) backdrop.addEventListener('click', () => this.closeModal());
    }

    // Keyboard shortcut M for Mobile Link, and Escape to close modal
    document.addEventListener('keydown', (e) => {
      const el = document.activeElement;
      const tag = (el && el.tagName) || '';
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el && el.isContentEditable);

      if (e.key === 'Escape' && this.isModalOpen()) {
        e.preventDefault();
        this.closeModal();
        return;
      }

      if (e.key === 'Tab' && this.isModalOpen()) {
        const focusable = this.modal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])');
        const visibleFocusable = Array.from(focusable).filter(el => {
          return !el.closest('.hidden') && el.offsetParent !== null && getComputedStyle(el).display !== 'none';
        });
        if (visibleFocusable.length > 0) {
          const first = visibleFocusable[0];
          const last = visibleFocusable[visibleFocusable.length - 1];
          if (e.shiftKey) {
            if (document.activeElement === first || !this.modal.contains(document.activeElement)) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (document.activeElement === last || !this.modal.contains(document.activeElement)) {
              e.preventDefault();
              first.focus();
            }
          }
        }
        return;
      }

      if (isInput || e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        if (this.isModalOpen()) {
          this.closeModal();
        } else {
          this.openModal();
        }
      }
    });

    if (this.copyBtn && this.urlInput) {
      this.copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(this.urlInput.value).then(() => {
          this.copyBtn.textContent = 'COPIED!';
          setTimeout(() => { this.copyBtn.textContent = 'COPY'; }, 1500);
        });
      });
    }

    // IP and Protocol dropdown changes
    if (this.ipSelect) {
      this.ipSelect.addEventListener('change', () => this.recalculatePairingUrl());
    }

    if (this.protocolSelect) {
      this.protocolSelect.addEventListener('change', () => this.recalculatePairingUrl());
    }

    // Remote Camera Controls from Laptop DP
    if (this.remoteIsoSelect) {
      this.remoteIsoSelect.addEventListener('change', (e) => {
        const val = e.target.value === 'auto' ? undefined : Number(e.target.value);
        this.sendRemoteControl({ iso: val });
      });
    }

    if (this.remoteEvSlider && this.remoteEvVal) {
      this.remoteEvSlider.addEventListener('input', (e) => {
        const val = Number(e.target.value);
        this.remoteEvVal.textContent = `${val > 0 ? '+' : ''}${val.toFixed(1)} EV`;
        this.sendRemoteControl({ exposureCompensation: val });
      });
    }

    if (this.remoteTorchBtn) {
      this.remoteTorchBtn.addEventListener('click', () => {
        this.isTorchOn = !this.isTorchOn;
        this.remoteTorchBtn.classList.toggle('active', this.isTorchOn);
        this.remoteTorchBtn.textContent = this.isTorchOn ? 'TORCH ON' : 'TORCH OFF';
        this.sendRemoteControl({ torch: this.isTorchOn });
      });
    }

    if (this.adbLaunchBtn) {
      this.adbLaunchBtn.addEventListener('click', () => this.launchOnPhone());
    }
  },

  async launchOnPhone() {
    if (!this.adbLaunchBtn) return;
    this.adbLaunchBtn.disabled = true;
    const origText = this.adbLaunchBtn.textContent;
    this.adbLaunchBtn.textContent = 'LAUNCHING ON PHONE...';
    try {
      const res = await fetch('/api/adb-launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: this.sessionId, port: 8000 })
      });
      const data = await res.json();
      if (data.status === 'launched') {
        this.adbLaunchBtn.textContent = 'OPENED ON PHONE! ✓';
        setTimeout(() => {
          if (this.adbLaunchBtn) {
            this.adbLaunchBtn.disabled = false;
            this.adbLaunchBtn.textContent = origText;
          }
        }, 3000);
      } else {
        alert(data.message || 'Could not launch on phone via ADB');
        this.adbLaunchBtn.disabled = false;
        this.adbLaunchBtn.textContent = origText;
      }
    } catch (e) {
      console.error('[MobileLinkStudio] ADB launch failed:', e);
      this.adbLaunchBtn.disabled = false;
      this.adbLaunchBtn.textContent = origText;
    }
  },

  isModalOpen() {
    if (!this.modal) return false;
    if (typeof this.modal.open === 'boolean') {
      return this.modal.open && !this.modal.classList.contains('hidden');
    }
    return !this.modal.classList.contains('hidden');
  },

  async openModal() {
    if (!this.modal) return;
    this._triggerElement = (document.activeElement && document.activeElement !== document.body) ? document.activeElement : this.linkBtn;

    if (typeof this.modal.showModal === 'function') {
      try {
        if (!this.modal.open) this.modal.showModal();
      } catch (e) {
        this.modal.classList.remove('hidden');
      }
    } else {
      this.modal.classList.remove('hidden');
    }
    this.modal.classList.remove('hidden');

    try {
      const res = await fetch('/api/network-info');
      if (res.ok) {
        this.networkInfo = await res.json();
        this.populateNetworkInterfaces(this.networkInfo);
      }
    } catch (e) {
      console.warn('[MobileLinkStudio] Could not fetch network info:', e);
    }

    this.recalculatePairingUrl();

    // Focus the first interactive element or close button for a11y
    if (this.closeBtn) {
      this.closeBtn.focus();
    }
  },

  populateNetworkInterfaces(info) {
    if (!this.ipSelect) return;
    this.ipSelect.innerHTML = '';

    // Handle ADB USB device status
    if (this.usbDirectBox) {
      if (info.adb_connected) {
        this.usbDirectBox.classList.remove('hidden');
        const dev = (info.adb_devices && info.adb_devices[0]) || {};
        if (this.usbDeviceTitle) {
          this.usbDeviceTitle.textContent = `🔌 ${dev.model || 'Android Phone'} Connected via USB`;
        }
        if (this.usbDeviceSubtitle) {
          this.usbDeviceSubtitle.textContent = `USB reverse port forwarding active (${dev.serial || 'ADB'}). Low latency.`;
        }
      } else {
        this.usbDirectBox.classList.add('hidden');
      }
    }

    const list = info.available_ips || [];
    if (list.length === 0) {
      const opt = document.createElement('option');
      opt.value = info.local_ip || '127.0.0.1';
      opt.textContent = `Default IP (${opt.value})`;
      this.ipSelect.appendChild(opt);
    } else {
      list.forEach((item, index) => {
        const opt = document.createElement('option');
        opt.value = item.ip;
        opt.textContent = item.label || item.ip;
        // Prioritize USB if connected, otherwise local IP
        if (info.adb_connected && item.iface === 'usb') {
          opt.selected = true;
        } else if (!info.adb_connected && (item.ip === info.local_ip || index === 0)) {
          opt.selected = true;
        }
        this.ipSelect.appendChild(opt);
      });
    }

    if (this.protocolSelect && !info.https_available) {
      this.protocolSelect.value = 'http';
      const httpsOpt = this.protocolSelect.querySelector('option[value="https"]');
      if (httpsOpt) httpsOpt.disabled = true;
    }
  },

  recalculatePairingUrl() {
    const selectedIp = (this.ipSelect && this.ipSelect.value) ||
      (this.networkInfo && this.networkInfo.local_ip) ||
      window.location.hostname;

    const isUsbLocal = selectedIp === 'localhost' || selectedIp === '127.0.0.1';

    let protocol = (this.protocolSelect && this.protocolSelect.value) ||
      (this.networkInfo && this.networkInfo.https_available ? 'https' : 'http');

    // Over USB reverse, localhost HTTP is secure context and avoids self-signed SSL warnings
    if (isUsbLocal && (!this.protocolSelect || this.protocolSelect.value === 'https')) {
      if (this.protocolSelect) this.protocolSelect.value = 'http';
      protocol = 'http';
    }

    const port = protocol === 'https' ?
      (this.networkInfo ? this.networkInfo.https_port : 8443) :
      (this.networkInfo ? this.networkInfo.port : 8000);

    this.pairingUrl = `${protocol}://${selectedIp}:${port}/mobile?session=${this.sessionId}`;

    if (this.urlInput) {
      this.urlInput.value = this.pairingUrl;
    }

    if (this.testTabLink) {
      this.testTabLink.href = this.pairingUrl;
    }

    // Render QR Code with high error correction
    if (this.qrBox && typeof QRCodeLib !== 'undefined') {
      QRCodeLib.renderCanvas(this.qrBox, this.pairingUrl, 170);
    }
  },

  closeModal() {
    if (!this.modal) return;
    if (typeof this.modal.close === 'function') {
      try {
        if (this.modal.open) this.modal.close();
      } catch (e) {
        this.modal.classList.add('hidden');
      }
    }
    this.modal.classList.add('hidden');

    const target = (this._triggerElement && this._triggerElement !== document.body) ? this._triggerElement : this.linkBtn;
    if (target && typeof target.focus === 'function') {
      target.focus();
    }
    this._triggerElement = null;
  },

  initSignaling() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/link/${this.sessionId}`;

    this.signalingWs = new WebSocket(wsUrl);

    this.signalingWs.onopen = () => {
      console.log('[MobileLinkStudio] Signaling connected for session:', this.sessionId);
    };

    this.signalingWs.onmessage = async (e) => {
      try {
        const msg = JSON.parse(e.data);
        await this.handleSignalingMessage(msg);
      } catch (err) {
        console.error('[MobileLinkStudio] Message error:', err);
      }
    };

    this.signalingWs.onclose = () => {
      setTimeout(() => this.initSignaling(), 2500);
    };
  },

  async handleSignalingMessage(msg) {
    if (msg.type === 'offer') {
      console.log('[MobileLinkStudio] Received WebRTC offer from mobile camera.');
      if (this.statusBadge) {
        this.statusBadge.textContent = 'CONNECTING TO PHONE...';
        this.statusBadge.style.color = 'var(--accent-amber)';
      }
      await this.handleOffer(msg.sdp);
    } else if (msg.type === 'ice_candidate') {
      if (this.peerConnection && this.peerConnection.remoteDescription) {
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate));
        } catch (e) {
          console.warn('[MobileLinkStudio] addIceCandidate error:', e);
        }
      } else {
        this.pendingCandidates.push(msg.candidate);
      }
    } else if (msg.type === 'camera_telemetry') {
      console.log('[MobileLinkStudio] Mobile Telemetry:', msg.settings);
    } else if (msg.type === 'mobile_frame_snapshot') {
      this.onPhoneSnapshotReceived(msg.image);
    } else if (msg.type === 'peer_disconnected') {
      console.log('[MobileLinkStudio] Mobile peer disconnected.');
      this.onPhoneDisconnected();
    }
  },

  async handleOffer(sdp) {
    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    this.peerConnection = new RTCPeerConnection(config);
    this.pendingCandidates = [];

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.signalingWs) {
        this.signalingWs.send(JSON.stringify({
          type: 'ice_candidate',
          candidate: event.candidate
        }));
      }
    };

    this.peerConnection.ontrack = (event) => {
      console.log('[MobileLinkStudio] Received video track from mobile device!');
      const stream = event.streams[0] || new MediaStream([event.track]);
      this.onPhoneStreamReceived(stream);
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      console.log('[MobileLinkStudio] WebRTC state:', state);
      if (state === 'connected') {
        this.onPhoneConnected();
      } else if (state === 'disconnected' || state === 'failed') {
        this.onPhoneDisconnected();
      }
    };

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription({
      type: 'offer',
      sdp: sdp
    }));

    // Drain queued ICE candidates
    while (this.pendingCandidates.length > 0) {
      const cand = this.pendingCandidates.shift();
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(cand));
      } catch (e) {
        console.warn('[MobileLinkStudio] Drain candidate error:', e);
      }
    }

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    this.signalingWs.send(JSON.stringify({
      type: 'answer',
      sdp: answer.sdp
    }));
  },

  onPhoneStreamReceived(stream) {
    this.remoteStream = stream;

    // Attach stream to CameraManager and viewport
    if (window.CameraManager && typeof window.CameraManager.setRemoteStream === 'function') {
      window.CameraManager.setRemoteStream(stream);
    } else {
      const monitor = document.getElementById('monitor');
      if (monitor) {
        monitor.srcObject = stream;
        monitor.play().catch(e => console.warn('Autoplay prevented:', e));
      }
    }

    // Hide any previous snapshot overlay
    const overlayImg = document.getElementById('mobileSnapshotOverlay');
    if (overlayImg) overlayImg.style.display = 'none';

    // Hide placeholder
    const placeholder = document.getElementById('viewportPlaceholder');
    if (placeholder) placeholder.classList.add('hidden');

    // Register mobile source in top bar camera picker
    const cameraSelect = document.getElementById('cameraSelect');
    if (cameraSelect) {
      let opt = cameraSelect.querySelector('option[value="webrtc_mobile"]');
      if (!opt) {
        opt = document.createElement('option');
        opt.value = 'webrtc_mobile';
        opt.textContent = '📱 Wireless Mobile Camera (WebRTC)';
        cameraSelect.prepend(opt);
      }
      cameraSelect.value = 'webrtc_mobile';
    }

    if (window.AnalyzerManager) {
      window.AnalyzerManager.setButtonEnabled(true);
    }
  },

  onPhoneSnapshotReceived(imageUrl) {
    console.log('[MobileLinkStudio] Received mobile snapshot frame from phone.');
    let overlayImg = document.getElementById('mobileSnapshotOverlay');
    if (!overlayImg) {
      overlayImg = document.createElement('img');
      overlayImg.id = 'mobileSnapshotOverlay';
      overlayImg.style.position = 'absolute';
      overlayImg.style.inset = '0';
      overlayImg.style.width = '100%';
      overlayImg.style.height = '100%';
      overlayImg.style.objectFit = 'contain';
      overlayImg.style.zIndex = '4';
      const viewport = document.querySelector('.viewport');
      if (viewport) viewport.appendChild(overlayImg);
    }
    overlayImg.src = imageUrl;
    overlayImg.style.display = 'block';

    const placeholder = document.getElementById('viewportPlaceholder');
    if (placeholder) placeholder.classList.add('hidden');

    if (this.statusBadge) {
      this.statusBadge.textContent = 'SNAPSHOT READY (1080p)';
      this.statusBadge.style.color = 'var(--status-live)';
    }

    const topStatus = document.getElementById('statusText');
    if (topStatus) {
      topStatus.textContent = 'MOBILE SNAPSHOT LOADED';
    }

    if (this.linkBtn) {
      this.linkBtn.classList.add('btn-amber');
      this.linkBtn.title = 'Wireless Mobile Camera connected';
    }

    // Draw to captureCanvas for instant histogram updates
    const canvas = document.getElementById('captureCanvas');
    if (canvas) {
      const img = new Image();
      img.onload = () => {
        canvas.width = img.naturalWidth || 1280;
        canvas.height = img.naturalHeight || 720;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        if (window.ScopeEngine && typeof window.ScopeEngine.fetchAndRender === 'function') {
          window.ScopeEngine.fetchAndRender();
        }
      };
      img.src = imageUrl;
    }

    if (window.AnalyzerManager) {
      window.AnalyzerManager.setButtonEnabled(true);
    }
  },

  onPhoneConnected() {
    this.isConnected = true;
    if (this.statusBadge) {
      this.statusBadge.textContent = 'ONLINE (1080p P2P)';
      this.statusBadge.style.color = 'var(--status-live)';
    }

    const topStatus = document.getElementById('statusText');
    if (topStatus) {
      topStatus.textContent = 'MOBILE LINKED (P2P)';
    }

    if (this.linkBtn) {
      this.linkBtn.classList.add('btn-amber');
      this.linkBtn.title = 'Wireless Mobile Camera connected';
    }

    // Enable remote controls
    if (this.remoteIsoSelect) this.remoteIsoSelect.disabled = false;
    if (this.remoteEvSlider) this.remoteEvSlider.disabled = false;
    if (this.remoteTorchBtn) this.remoteTorchBtn.disabled = false;
  },

  onPhoneDisconnected() {
    this.isConnected = false;
    if (this.statusBadge) {
      this.statusBadge.textContent = 'DISCONNECTED';
      this.statusBadge.style.color = 'var(--status-error)';
    }

    if (this.linkBtn) {
      this.linkBtn.classList.remove('btn-amber');
    }

    if (this.remoteIsoSelect) this.remoteIsoSelect.disabled = true;
    if (this.remoteEvSlider) this.remoteEvSlider.disabled = true;
    if (this.remoteTorchBtn) this.remoteTorchBtn.disabled = true;
  },

  sendRemoteControl(params) {
    if (this.signalingWs && this.signalingWs.readyState === WebSocket.OPEN) {
      this.signalingWs.send(JSON.stringify({
        type: 'camera_control',
        ...params
      }));
      console.log('[MobileLinkStudio] Sent remote camera control:', params);
    }
  }
};

window.MobileLinkStudio = MobileLinkStudio;
