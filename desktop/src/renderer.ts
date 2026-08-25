import { io, Socket } from 'socket.io-client';
import { SOCKET_EVENTS, QualityPreset } from './shared/types';
import { ICE_SERVERS, QUALITY_PRESETS } from './shared/constants';

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
let peerConnections: Map<string, RTCPeerConnection> = new Map();
let localStream: MediaStream | null = null;
let audioStream: MediaStream | null = null;
let currentRoomCode: string = '';
let currentQuality: QualityPreset = 'standard';

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

async function startTransmission(): Promise<void> {
  updateStatus('connecting');
  startBtn.disabled = true;
  startBtn.textContent = '⏳ Capturando tela...';

  try {
    log('Starting screen capture...');

    // Use getDisplayMedia (the modern Electron approach).
    // The main process has setDisplayMediaRequestHandler which auto-grants
    // the screen capture via desktopCapturer.
    // NOTE: getUserMedia + chromeMediaSource: 'desktop' is broken in Electron 28+
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
      log('First attempt failed: ' + err1.message + ', trying simpler constraints...');
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

    // Audio is already captured via getDisplayMedia if enabled.
    // If loopback audio wasn't captured, try separately.
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

    // Pre-warm: wake up Render free tier before connecting
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
      const timeout = setTimeout(() => reject(new Error('Timeout - server may be starting up. Try again in 30 seconds.')), 45000);
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

      socket!.on(SOCKET_EVENTS.VIEWER_JOINED, (data: any) => {
        log(`★ Viewer joined: ${data.viewerSocketId}`, '#2ecc71');
        handleNewViewer(data.viewerSocketId);
        viewerCountDisplay.textContent = data.viewerCount.toString();
      });

      socket!.on(SOCKET_EVENTS.VIEWER_LEFT, (data: any) => {
        log(`Viewer left: ${data.viewerSocketId}`);
        viewerCountDisplay.textContent = data.viewerCount.toString();
        closePeerConnection(data.viewerSocketId);
      });

      socket!.on(SOCKET_EVENTS.VIEWER_COUNT, (data: any) => {
        viewerCountDisplay.textContent = data.count.toString();
      });

      socket!.on(SOCKET_EVENTS.HOST_DISCONNECTED, () => stopTransmission());

      socket!.on(SOCKET_EVENTS.WEBRTC_ANSWER, async (data: any) => {
        log(`★ Answer from ${data.senderSocketId}`);
        const pc = peerConnections.get(data.senderSocketId);
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            log('Remote description set OK');
          } catch (err) {
            log('Remote desc error: ' + err, '#e74c3c');
          }
        }
      });

      socket!.on(SOCKET_EVENTS.ICE_CANDIDATE, async (data: any) => {
        const pc = peerConnections.get(data.senderSocketId);
        if (pc && data.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (err) {
            log('ICE error: ' + err, '#e74c3c');
          }
        }
      });

      socket!.on(SOCKET_EVENTS.QUALITY_CHANGED, (data: any) => {
        currentQuality = data.quality;
        adaptQuality();
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

async function handleNewViewer(viewerSocketId: string): Promise<void> {
  if (!localStream) return;

  log(`Peer connection for ${viewerSocketId}`);
  const pc = createPeerConnection(viewerSocketId);
  peerConnections.set(viewerSocketId, pc);

  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream!);
  });

  if (audioStream) {
    audioStream.getTracks().forEach((track) => pc.addTrack(track, audioStream!));
  }

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket!.emit(SOCKET_EVENTS.WEBRTC_OFFER, {
      targetSocketId: viewerSocketId,
      offer: pc.localDescription,
    });
    log(`★ Offer sent to ${viewerSocketId}`);
  } catch (err) {
    log('Offer error: ' + err, '#e74c3c');
  }
}

function createPeerConnection(targetSocketId: string): RTCPeerConnection {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  pc.onicecandidate = (event) => {
    if (event.candidate && socket) {
      socket.emit(SOCKET_EVENTS.ICE_CANDIDATE, {
        targetSocketId,
        candidate: event.candidate,
      });
    }
  };

  pc.onconnectionstatechange = () => {
    log(`Connection [${targetSocketId}]: ${pc.connectionState}`,
      pc.connectionState === 'connected' ? '#2ecc71' : '#f1c40f');
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      closePeerConnection(targetSocketId);
    }
  };

  pc.oniceconnectionstatechange = () => {
    log(`ICE [${targetSocketId}]: ${pc.iceConnectionState}`);
  };

  return pc;
}

function closePeerConnection(targetSocketId: string): void {
  const pc = peerConnections.get(targetSocketId);
  if (pc) { pc.close(); peerConnections.delete(targetSocketId); }
}

function adaptQuality(): void {
  const settings = QUALITY_PRESETS[currentQuality];
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (!videoTrack) return;
  for (const [, pc] of peerConnections) {
    const sender = pc.getSenders().find((s) => s.track === videoTrack);
    if (sender) {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      params.encodings[0].maxBitrate = settings.maxBitrate;
      sender.setParameters(params);
      break;
    }
  }
}

async function stopTransmission(): Promise<void> {
  for (const [, pc] of peerConnections) pc.close();
  peerConnections.clear();
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
