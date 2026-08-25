import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { SocketHandler } from './socket/SocketHandler';

const PORT = process.env.PORT || 3001;

// Metered/Open Relay TURN server configuration
const METERED_API_KEY = process.env.METERED_API_KEY || '';
const METERED_APP_NAME = process.env.METERED_APP_NAME || '';
let cachedIceServers: any[] | null = null;
let lastFetchTime = 0;
const CACHE_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  // Optimize for low latency
  pingInterval: 10000,
  pingTimeout: 5000,
  transports: ['websocket', 'polling'],
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Fetch TURN credentials from Metered/Open Relay REST API
async function fetchTurnCredentials(): Promise<any[]> {
  if (!METERED_API_KEY) {
    console.log('[ICE] No METERED_API_KEY set, using STUN only');
    return getDefaultIceServers();
  }

  const now = Date.now();
  if (cachedIceServers && now - lastFetchTime < CACHE_DURATION_MS) {
    console.log('[ICE] Using cached TURN credentials');
    return cachedIceServers;
  }

  try {
    const url = METERED_APP_NAME
      ? `https://${METERED_APP_NAME}.metered.live/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`
      : `https://global.turn.metered.live/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`;
    console.log(`[ICE] Fetching TURN credentials from Metered...`);
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        cachedIceServers = data;
        lastFetchTime = now;
        console.log(`[ICE] Loaded ${data.length} ICE servers (STUN + TURN)`);
        return data;
      }
    }
    console.log(`[ICE] Metered API returned ${response.status}, using defaults`);
  } catch (err) {
    console.error(`[ICE] Failed to fetch TURN credentials:`, err);
  }

  return getDefaultIceServers();
}

function getDefaultIceServers() {
  return [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ];
}

// ICE servers endpoint - clients fetch TURN/STUN config from here
app.get('/ice-servers', async (_req, res) => {
  const iceServers = await fetchTurnCredentials();
  res.json({ iceServers });
});

// Initialize socket handler
const socketHandler = new SocketHandler(io);

// Handle connections
io.on('connection', (socket) => {
  console.log(`[Server] New connection: ${socket.id} from ${socket.handshake.address}`);
  socketHandler.handleConnection(socket);
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Signaling server running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Waiting for connections...`);
});
