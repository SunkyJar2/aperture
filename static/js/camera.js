/**
 * Aperture — Camera Manager
 * Implements prd.md > Features and Behavior > Camera Source Selection
 */

const CameraManager = {
  currentStream: null,
  activeDeviceId: null,

  async init() {
    this.selectEl = document.getElementById('cameraSelect');
    this.videoEl = document.getElementById('monitor');
    this.placeholderEl = document.getElementById('viewportPlaceholder');
    this.permissionAlertEl = document.getElementById('permissionAlert');
    this.statusTextEl = document.getElementById('statusText');
    this.requestBtn = document.getElementById('requestPermBtn');
    this.retryBtn = document.getElementById('retryCameraBtn');

    this.bindEvents();
    await this.refreshDeviceList();
  },

  bindEvents() {
    this.selectEl.addEventListener('change', (e) => {
      if (e.target.value) {
        this.startCamera(e.target.value);
      }
    });

    if (this.requestBtn) {
      this.requestBtn.addEventListener('click', () => this.requestAccess());
    }
    if (this.retryBtn) {
      this.retryBtn.addEventListener('click', () => this.requestAccess());
    }
  },

  async requestAccess() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      // Stop temp stream
      stream.getTracks().forEach(t => t.stop());
      this.permissionAlertEl.classList.add('hidden');
      await this.refreshDeviceList();
    } catch (err) {
      console.error('Camera permission denied:', err);
      this.permissionAlertEl.classList.remove('hidden');
    }
  },

  async refreshDeviceList() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      this.statusTextEl.textContent = 'NO WEBCAM API';
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');

      this.selectEl.innerHTML = '';
      if (videoDevices.length === 0) {
        const opt = document.createElement('option');
        opt.textContent = 'No camera devices detected';
        this.selectEl.appendChild(opt);
        return;
      }

      videoDevices.forEach((device, index) => {
        const opt = document.createElement('option');
        opt.value = device.deviceId;
        opt.textContent = device.label || `Camera ${index + 1} (Default)`;
        this.selectEl.appendChild(opt);
      });

      // Auto-start first available camera
      if (videoDevices.length > 0 && !this.currentStream) {
        await this.startCamera(videoDevices[0].deviceId);
      }
    } catch (err) {
      console.warn('Could not enumerate devices:', err);
    }
  },

  async startCamera(deviceId) {
    if (this.currentStream) {
      this.currentStream.getTracks().forEach(t => t.stop());
    }

    this.activeDeviceId = deviceId;
    const constraints = {
      video: deviceId ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } : true,
      audio: false
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.currentStream = stream;
      this.videoEl.srcObject = stream;
      this.placeholderEl.classList.add('hidden');
      this.permissionAlertEl.classList.add('hidden');
      this.statusTextEl.textContent = 'CAMERA LIVE';

      // Re-query device list to get full labels if permission was just granted
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasLabels = devices.some(d => d.kind === 'videoinput' && d.label);
      if (hasLabels && this.selectEl.options.length > 0 && !this.selectEl.options[0].textContent.includes('Default')) {
        // already labeled
      } else {
        await this.refreshDeviceList();
      }
    } catch (err) {
      console.error('Failed to start camera:', err);
      this.permissionAlertEl.classList.remove('hidden');
      this.statusTextEl.textContent = 'CAMERA ERROR';
    }
  },

  captureCurrentFrameBase64(scale = 1.0) {
    if (!this.videoEl || this.videoEl.readyState < 2) return null;
    const canvas = document.getElementById('captureCanvas');
    const width = (this.videoEl.videoWidth || 640) * scale;
    const height = (this.videoEl.videoHeight || 480) * scale;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(this.videoEl, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.85);
  }
};
