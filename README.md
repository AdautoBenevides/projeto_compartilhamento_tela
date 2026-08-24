# Screen Share - PC to Mobile Screen Sharing

Lightweight, real-time screen sharing from PC to mobile using WebRTC.

## Architecture

```
screen-share/
├── desktop/          # Electron app (Windows) - captures and streams screen
├── mobile/           # Flutter app (Android) - receives and displays stream
├── signaling-server/ # Node.js server - WebRTC signaling
└── shared/           # TypeScript types and constants
```

## Quick Start

### 1. Start Signaling Server

```bash
cd signaling-server
npm install
npm run dev
```

Server runs on `http://localhost:3001`

### 2. Start Desktop App

```bash
cd desktop
npm install
npm run dev
```

### 3. Run Mobile App

```bash
cd mobile
flutter pub get
flutter run
```

## How It Works

1. Open desktop app → Select monitor → Start transmission
2. A room code is generated (e.g., `ABCD-1234`)
3. Open mobile app → Enter the code → Connect
4. Watch the screen in real-time

## Features

- **WebRTC P2P** - Direct connection, low latency
- **Adaptive Quality** - Auto-adjusts to network conditions
- **Audio Support** - System audio transmission
- **Auto-Reconnect** - Handles temporary disconnections
- **Multiple Viewers** - Up to 10 viewers per room
- **STUN/TURN** - Works across different networks

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Desktop | Electron + TypeScript |
| Mobile | Flutter + Dart |
| Signaling | Node.js + Socket.IO |
| Streaming | WebRTC |
| Audio Codec | Opus |
| Video Codec | H.264 / VP8 |

## Quality Modes

| Mode | Resolution | FPS | Bitrate |
|------|-----------|-----|---------|
| Economy | 720p | 30 | 300K-1.5M |
| Standard | 720p | 30 | 500K-2.5M |
| High | 1080p | 30 | 1M-5M |

## Development

### Phase 1 (MVP) ✅
- [x] Signaling server
- [x] Screen capture
- [x] WebRTC streaming
- [x] Basic mobile receiver
- [x] Audio transmission

### Phase 2
- [ ] QR Code scanning
- [ ] Quality selection on mobile
- [ ] Multiple viewer optimization
- [ ] Adaptive bitrate
- [ ] Connection statistics

### Phase 3
- [ ] Hardware acceleration (NVENC, Quick Sync)
- [ ] TURN server setup
- [ ] Battery optimization
- [ ] Network performance testing
