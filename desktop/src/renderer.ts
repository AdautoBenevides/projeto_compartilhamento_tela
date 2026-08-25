import { io, Socket } from 'socket.io-client';
import { SOCKET_EVENTS, QualityPreset } from './shared/types';
import { QUALITY_PRESETS } from './shared/constants';

// DOM Elements
const screenSelect = document.getElementById('screen-select') as HTMLSelectElement;
const qualitySelect = document.getElementById('quality-select') as HTMLSelectElement;
const audioToggle = document.getElementById('audio-toggle') as HTMLInputElement;
const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement;
const roomCodeDisplay = document.getElementById('room-code') as HTMLElement;
const viewerCountDisplay = document.getElementById('viewer-count') as HTMLElement;
const statusDisplay = document.getElementById('status') as HTMLElement;
const startSection = document.getElementById('start-section') as HTMLElement;
const activeSection = document.getElementById('active-section') as HTMLElement;
const qrCodeImg = document.getElementById('qr-code') as HTMLImageElement;
const debugLog = document.getElementById('debug-log') as HTMLElement;

function log(msg: string, color?: string): void {
  console.log('[Renderer]', msg);
  if (debugLog) {
    const div = document.createElement('div');
    div.style.color = color || '#666';
    div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    debugLog.appendChild(div);
    debugLog.scrollTop = debugLog.scrollHeight;
  }
}

// State
let socket: Socket | null = null;
let localStream: MediaStream | null = null;
let audioStream: MediaStream | null = null;
let currentRoomCode: string = '';
let currentQuality: QualityPreset = 'standard';
let frameInterval: ReturnType<typeof setInterval> | null = null;
let captureCanvas: HTMLCanvasElement | null = null;
let captureCtx: CanvasRenderingContext2D | null = null;

async function init(): Promise<void> {
  log('Initializing...');
  await loadScreens();
  setupEventListeners();
  log('Ready!', '#2ecc71');
}

async function loadScreens(): Promise<void> {
  try {
    const sources = await (window as any).electronAPI.getSources();
    screenSelect.innerHTML = '';
    if (sources && sources.length > 0) {
      sources.forEach((source: any) => {
        const option = document.createElement('option');
        option.value = source.id;
        option.textContent = source.name || `Monitor ${source.id}`;
        screenSelect.appendChild(option);
      });
      log(`Found ${sources.length} screens: ${sources.map((s: any) => s.name).join(', ')}`, '#2ecc71');
    } else {
      screenSelect.innerHTML = '<option value="screen:0:0">Monitor Principal</option>';
      log('Using default screen');
    }
  } catch (error: any) {
    log('Error loading screens: ' + error.message, '#e74c3c');
    screenSelect.innerHTML = '<option value="screen:0:0">Monitor Principal</option>';
  }
}

function setupEventListeners(): void {
  startBtn.addEventListener('click', startTransmission);
  stopBtn.addEventListener('click', stopTransmission);
  qualitySelect.addEventListener('change', (e) => {
    currentQuality = (e.target as HTMLSelectElement).value as QualityPreset;
  });
}

function showError(msg: string): void {
  log('ERROR: ' + msg, '#e74c3c');
  let banner = document.getElementById('error-banner');
  if (banner) {
    banner.textContent = msg;
    banner.style.display = 'block';
    setTimeout(() => { banner!.style.display = 'none'; }, 10000);
  }
}

function getFrameInterval(): number {
  switch (currentQuality) {
    case 'economy': return 150;  // ~7 fps
    case 'standard': return 100; // ~10 fps
    case 'high': return 66;      // ~15 fps
    default: return 100;
  }
}

function getJpegQuality(): number {
  switch (currentQuality) {
    case 'economy': return 0.5;
    case 'standard': return 0.65;
    case 'high': return 0.8;
    default: return 0.65;
  }
}

function getTargetWidth(): number {
  switch (currentQuality) {
    case 'economy': return 960;
    case 'standard': return 1280;
    case 'high': return 1920;
    default: return 1280;
  }
}

function startFrameCapture(): void {
  if (!localStream) return;

  const videoTrack = localStream.getVideoTracks()[0];
  // @ts-ignore - getSettings exists on MediaStreamTrack
  const settings = videoTrack.getSettings();
  const srcWidth = settings.width || 1280;
  const srcHeight = settings.height || 720;

  const targetWidth = getTargetWidth();
  const targetHeight = Math.round((srcHeight / srcWidth) * targetWidth);

  captureCanvas = document.createElement('canvas');
  captureCanvas.width = targetWidth;
  captureCanvas.height = targetHeight;
  captureCtx = captureCanvas.getContext('2d');

  const video = document.createElement('video');
  video.srcObject = localStream;
  video.play();

  let sending = false;

  frameInterval = setInterval(() => {
    if (sending || !captureCtx || !captureCanvas || !socket) return;
    sending = true;

    captureCtx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
    const dataUrl = captureCanvas.toDataURL('image/jpeg', getJpegQuality());

    socket.emit('screen_frame', { frame: dataUrl }, () => {
      sending = false;
    });

    // Fallback: if callback never fires, reset after 500ms
    setTimeout(() => { sending = false; }, 500);
  }, getFrameInterval());

  log(`Frame capture started (${targetWidth}x${targetHeight} @ ~${Math.round(1000 / getFrameInterval())}fps)`, '#2ecc71');
}

function stopFrameCapture(): void {
  if (frameInterval) {
    clearInterval(frameInterval);
    frameInterval = null;
  }
  captureCanvas = null;
  captureCtx = null;
}

async function startTransmission(): Promise<void> {
  updateStatus('connecting');
  startBtn.disabled = true;
  startBtn.textContent = '⏳ Capturando tela...';

  try {
    log('Starting screen capture...');

    try {
      localStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
        audio: audioToggle.checked ? ('loopback' as any) : false,
      });
      log('✅ Screen captured!', '#2ecc71');
    } catch (err1: any) {
      log('First attempt failed: ' + err1.message + ', trying simpler...');
      try {
        localStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: audioToggle.checked ? ('loopback' as any) : false,
        });
        log('✅ Screen captured (fallback)!', '#2ecc71');
      } catch (err2: any) {
        throw new Error('Falha ao capturar tela: ' + err2.message);
      }
    }

    if (!localStream || localStream.getVideoTracks().length === 0) {
      throw new Error('Nenhum vídeo foi capturado');
    }

    const track = localStream.getVideoTracks()[0];
    log(`Video: ${track.label}`, '#2ecc71');
    startBtn.textContent = '⏳ Conectando...';

    if (audioToggle.checked && localStream.getAudioTracks().length === 0) {
      try {
        audioStream = await navigator.mediaDevices.getDisplayMedia({
          video: false,
          audio: 'loopback' as any,
        });
        log('Desktop audio captured separately', '#2ecc71');
      } catch (e) {
        log('Audio failed (continuing)', '#f1c40f');
      }
    }

    // Connect to server
    const serverUrl = await (window as any).electronAPI.getServerUrl();
    log(`Connecting to ${serverUrl}...`);

    // Pre-warm: wake up Render free tier
    log('Warming up server...');
    for (let i = 0; i < 3; i++) {
      try {
        await fetch(serverUrl.replace(/\/socket\.io.*$/, '') + '/health');
        log('Server is awake!');
        break;
      } catch (e) {
        log(`Waiting for server... (${i + 1})`);
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout - try again in 30s')), 45000);
      socket!.on('connect', () => { clearTimeout(timeout); resolve(); });
      socket!.on('connect_error', (err) => { clearTimeout(timeout); reject(err); });
    });

    log('✅ Connected to server', '#2ecc71');
    startBtn.textContent = '⏳ Criando sala...';

    socket.emit(SOCKET_EVENTS.CREATE_ROOM, {
      quality: currentQuality,
      audioEnabled: audioToggle.checked,
    });

    socket.once(SOCKET_EVENTS.ROOM_CREATED, (data: any) => {
      currentRoomCode = data.roomCode;
      roomCodeDisplay.textContent = currentRoomCode;
      log(`✅ Room: ${currentRoomCode}`, '#2ecc71');
      generateQRCode(data.roomCode);

      startSection.style.display = 'none';
      activeSection.style.display = 'block';
      updateStatus('connected');

      // Start sending frames
      startFrameCapture();

      socket!.on(SOCKET_EVENTS.VIEWER_JOINED, (data: any) => {
        log(`★ Viewer joined: ${data.viewerSocketId}`, '#2ecc71');
        viewerCountDisplay.textContent = data.viewerCount.toString();
      });

      socket!.on(SOCKET_EVENTS.VIEWER_LEFT, (data: any) => {
        log(`Viewer left: ${data.viewerSocketId}`);
        viewerCountDisplay.textContent = data.viewerCount.toString();
      });

      socket!.on(SOCKET_EVENTS.VIEWER_COUNT, (data: any) => {
        viewerCountDisplay.textContent = data.count.toString();
      });

      socket!.on(SOCKET_EVENTS.HOST_DISCONNECTED, () => stopTransmission());

      socket!.on(SOCKET_EVENTS.QUALITY_CHANGED, (data: any) => {
        currentQuality = data.quality;
        // Restart frame capture with new quality settings
        stopFrameCapture();
        startFrameCapture();
      });
    });

    socket!.on(SOCKET_EVENTS.ROOM_ERROR, (data: any) => {
      showError(`Erro: ${data.error}`);
      updateStatus('disconnected');
      startBtn.disabled = false;
      startBtn.textContent = '▶ INICIAR TRANSMISSÃO';
    });
  } catch (error: any) {
    log('FATAL: ' + error.message, '#e74c3c');
    showError(error.message);
    updateStatus('disconnected');
    startBtn.disabled = false;
    startBtn.textContent = '▶ INICIAR TRANSMISSÃO';
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      localStream = null;
    }
  }
}

async function stopTransmission(): Promise<void> {
  stopFrameCapture();
  if (localStream) { localStream.getTracks().forEach((t) => t.stop()); localStream = null; }
  if (audioStream) { audioStream.getTracks().forEach((t) => t.stop()); audioStream = null; }
  if (socket) { socket.emit(SOCKET_EVENTS.LEAVE_ROOM); socket.disconnect(); socket = null; }

  currentRoomCode = '';
  roomCodeDisplay.textContent = '----';
  viewerCountDisplay.textContent = '0';
  startSection.style.display = 'block';
  activeSection.style.display = 'none';
  startBtn.disabled = false;
  startBtn.textContent = '▶ INICIAR TRANSMISSÃO';
  updateStatus('disconnected');
}

function updateStatus(status: string): void {
  statusDisplay.textContent = status.charAt(0).toUpperCase() + status.slice(1);
  statusDisplay.className = `status status-${status}`;
}

function generateQRCode(code: string): void {
  qrCodeImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=screen-share:${code}`;
}

init();
