// Shared constants for screen-share project

import { QualityPreset, QualitySettings } from '../types';

// Room configuration
export const ROOM_CODE_LENGTH = 8;
export const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed I, O, 0, 1 for clarity
export const ROOM_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
export const MAX_VIEWERS_PER_ROOM = 10;

// Quality presets
export const QUALITY_PRESETS: Record<QualityPreset, QualitySettings> = {
  economy: {
    width: 1280,
    height: 720,
    fps: 30,
    maxBitrate: 1_500_000,
    minBitrate: 300_000,
  },
  standard: {
    width: 1280,
    height: 720,
    fps: 30,
    maxBitrate: 2_500_000,
    minBitrate: 500_000,
  },
  high: {
    width: 1920,
    height: 1080,
    fps: 30,
    maxBitrate: 5_000_000,
    minBitrate: 1_000_000,
  },
};

// Default quality
export const DEFAULT_QUALITY: QualityPreset = 'standard';

// WebRTC ICE servers
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

// Adaptive bitrate thresholds
export const ADAPTIVE_THRESHOLDS = {
  excellent: { minBitrate: 2_000_000, maxRtt: 50, maxPacketLoss: 1 },
  good: { minBitrate: 1_000_000, maxRtt: 100, maxPacketLoss: 3 },
  fair: { minBitrate: 500_000, maxRtt: 200, maxPacketLoss: 5 },
  poor: { minBitrate: 300_000, maxRtt: 500, maxPacketLoss: 10 },
};

// Reconnection settings
export const RECONNECTION = {
  maxAttempts: 10,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 1.5,
};
