import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { SocketHandler } from './socket/SocketHandler';
import { spawn } from 'child_process';
import path from 'path';

const PORT = process.env.PORT || 3001;

// TURN server configuration (coturn runs alongside on TURN_PORT)
const TURN_PORT = process.env.TURN_PORT || '3478';
const TURN_SECRET = process.env.TURN_SECRET || 'screen-share-secret';
const TURN_USERNAME = process.env.TURN_USERNAME || 'screenshare';
const TURN_CREDENTIAL = process.env.TURN_CREDENTIAL || 'screenshare123';
const PUBLIC_IP = process.env.PUBLIC_IP || 'localhost';

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

// ICE servers endpoint - clients fetch TURN/STUN config from here
app.get('/ice-servers', (_req, res) => {
  const iceServers: Array<{ urls: string; username?: string; credential?: string }> = [
    // Google STUN servers
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ];

  // Add TURN server if configured (coturn runs on the same host)
  if (PUBLIC_IP !== 'localhost') {
    iceServers.push(
      {
        urls: `turn:${PUBLIC_IP}:${TURN_PORT}`,
        username: TURN_USERNAME,
        credential: TURN_CREDENTIAL,
      },
      {
        urls: `turns:${PUBLIC_IP}:5349?transport=tcp`,
        username: TURN_USERNAME,
        credential: TURN_CREDENTIAL,
      }
    );
  }

  res.json({ iceServers });
});

// Start coturn TURN server if coturn binary exists
function startCoturn() {
  const coturnPath = process.env.COTURN_PATH || '/usr/bin/turnserver';
  const coturnConf = path.join(__dirname, '..', 'coturn.conf');

  try {
    const coturn = spawn(coturnPath, ['-c', coturnConf], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    coturn.stdout?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.log(`[coturn] ${msg}`);
    });
    coturn.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.log(`[coturn] ${msg}`);
    });
    coturn.on('error', (err) => {
      console.log(`[coturn] Not found or failed to start: ${err.message}`);
      console.log('[coturn] TURN relay will not be available. Only STUN will work.');
    });
    coturn.on('close', (code) => {
      console.log(`[coturn] Process exited with code ${code}`);
    });
    console.log('[coturn] Starting TURN server...');
  } catch (e) {
    console.log('[coturn] Could not start TURN server:', e);
  }
}

startCoturn();

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
