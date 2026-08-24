// Shared types for screen-share project

// Room & Connection
export interface Room {
  id: string;
  code: string;
  hostId: string;
  createdAt: number;
  viewers: Map<string, ViewerInfo>;
  quality: QualityPreset;
  audioEnabled: boolean;
  token: string;
}

export interface ViewerInfo {
  socketId: string;
  joinedAt: number;
}

export type QualityPreset = 'economy' | 'standard' | 'high';

export interface QualitySettings {
  width: number;
  height: number;
  fps: number;
  maxBitrate: number;
  minBitrate: number;
}

// Signaling Messages
export interface CreateRoomPayload {
  quality: QualityPreset;
  audioEnabled: boolean;
}

export interface CreateRoomResponse {
  roomId: string;
  roomCode: string;
  token: string;
}

export interface JoinRoomPayload {
  roomCode: string;
}

export interface JoinRoomResponse {
  success: boolean;
  roomId?: string;
  error?: string;
}

export interface WebRTCOfferPayload {
  targetSocketId: string;
  offer: RTCSessionDescriptionInit;
}

export interface WebRTCAnswerPayload {
  targetSocketId: string;
  answer: RTCSessionDescriptionInit;
}

export interface ICECandidatePayload {
  targetSocketId: string;
  candidate: RTCIceCandidateInit;
}

export interface StreamStatusPayload {
  isStreaming: boolean;
  quality: QualityPreset;
  audioEnabled: boolean;
}

export interface ConnectionStatusPayload {
  status: 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
  ping?: number;
  jitter?: number;
  packetLoss?: number;
}

export interface QualityAdaptPayload {
  quality: QualityPreset;
  reason: string;
}

// Socket Event Names
export const SOCKET_EVENTS = {
  // Room management
  CREATE_ROOM: 'create_room',
  ROOM_CREATED: 'room_created',
  JOIN_ROOM: 'join_room',
  ROOM_JOINED: 'room_joined',
  LEAVE_ROOM: 'leave_room',
  ROOM_LEFT: 'room_left',
  ROOM_ERROR: 'room_error',
  VIEWER_COUNT: 'viewer_count',
  VIEWER_JOINED: 'viewer_joined',
  VIEWER_LEFT: 'viewer_left',

  // WebRTC signaling
  WEBRTC_OFFER: 'webrtc_offer',
  WEBRTC_ANSWER: 'webrtc_answer',
  ICE_CANDIDATE: 'ice_candidate',

  // Stream control
  STREAM_STARTED: 'stream_started',
  STREAM_STOPPED: 'stream_stopped',
  QUALITY_CHANGED: 'quality_changed',

  // Connection
  CONNECTION_STATUS: 'connection_status',
  PING: 'ping',
  PONG: 'pong',

  // Host control
  HOST_DISCONNECTED: 'host_disconnected',
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
