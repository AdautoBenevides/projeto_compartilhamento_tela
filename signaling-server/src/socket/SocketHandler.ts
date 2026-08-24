import { Server, Socket } from 'socket.io';
import { RoomManager } from '../rooms/RoomManager';
import {
  CreateRoomPayload,
  JoinRoomPayload,
  WebRTCOfferPayload,
  WebRTCAnswerPayload,
  ICECandidatePayload,
} from '../shared/types';
import { SOCKET_EVENTS } from '../shared/types';
import { DEFAULT_QUALITY } from '../shared/constants';

export class SocketHandler {
  private io: Server;
  private roomManager: RoomManager;

  constructor(io: Server) {
    this.io = io;
    this.roomManager = new RoomManager();

    // Cleanup old rooms every hour
    setInterval(() => this.roomManager.cleanup(), 60 * 60 * 1000);
  }

  handleConnection(socket: Socket): void {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Room management
    socket.on(SOCKET_EVENTS.CREATE_ROOM, (payload: CreateRoomPayload) =>
      this.handleCreateRoom(socket, payload)
    );

    socket.on(SOCKET_EVENTS.JOIN_ROOM, (payload: JoinRoomPayload) =>
      this.handleJoinRoom(socket, payload)
    );

    socket.on(SOCKET_EVENTS.LEAVE_ROOM, () =>
      this.handleLeaveRoom(socket)
    );

    // WebRTC signaling
    socket.on(SOCKET_EVENTS.WEBRTC_OFFER, (payload: WebRTCOfferPayload) =>
      this.handleOffer(socket, payload)
    );

    socket.on(SOCKET_EVENTS.WEBRTC_ANSWER, (payload: WebRTCAnswerPayload) =>
      this.handleAnswer(socket, payload)
    );

    socket.on(SOCKET_EVENTS.ICE_CANDIDATE, (payload: ICECandidatePayload) =>
      this.handleICECandidate(socket, payload)
    );

    // Stream control
    socket.on(SOCKET_EVENTS.QUALITY_CHANGED, (payload: { quality: typeof DEFAULT_QUALITY }) =>
      this.handleQualityChanged(socket, payload)
    );

    // Disconnect
    socket.on('disconnect', () =>
      this.handleDisconnect(socket)
    );
  }

  private handleCreateRoom(socket: Socket, payload: CreateRoomPayload): void {
    const quality = payload.quality || DEFAULT_QUALITY;
    const audioEnabled = payload.audioEnabled ?? true;

    const room = this.roomManager.createRoom(socket.id, quality, audioEnabled);

    socket.emit(SOCKET_EVENTS.ROOM_CREATED, {
      roomId: room.id,
      roomCode: room.code,
      token: room.token,
    });

    console.log(`[Room] Created room ${room.code} (${room.id}) by ${socket.id}`);
  }

  private handleJoinRoom(socket: Socket, payload: JoinRoomPayload): void {
    const roomCode = payload.roomCode?.toUpperCase();
    console.log(`[Room] Socket ${socket.id} trying to join room: ${roomCode}`);

    const result = this.roomManager.joinRoom(roomCode, socket.id);

    if (!result.success || !result.room) {
      console.log(`[Room] Socket ${socket.id} FAILED to join: ${result.error}`);
      socket.emit(SOCKET_EVENTS.ROOM_ERROR, { error: result.error });
      return;
    }

    // Notify the host that a viewer joined
    console.log(`[Room] Notifying host ${result.room.hostId} about new viewer ${socket.id}`);
    this.io.to(result.room.hostId).emit(SOCKET_EVENTS.VIEWER_JOINED, {
      viewerSocketId: socket.id,
      viewerCount: result.room.viewers.size,
    });

    // Notify the viewer they joined
    socket.emit(SOCKET_EVENTS.ROOM_JOINED, {
      roomId: result.room.id,
      hostSocketId: result.room.hostId,
      quality: result.room.quality,
      audioEnabled: result.room.audioEnabled,
      viewerCount: result.room.viewers.size,
    });

    // Broadcast updated viewer count
    this.io.to(result.room.hostId).emit(SOCKET_EVENTS.VIEWER_COUNT, {
      count: result.room.viewers.size,
    });

    console.log(`[Room] Viewer ${socket.id} joined room ${roomCode}. Host: ${result.room.hostId}`);
  }

  private handleLeaveRoom(socket: Socket): void {
    this.removeSocketAndNotify(socket);
  }

  private handleOffer(socket: Socket, payload: WebRTCOfferPayload): void {
    console.log(`[WebRTC] Forwarding offer from ${socket.id} to ${payload.targetSocketId}`);
    // Forward SDP offer to the target (usually viewer)
    this.io.to(payload.targetSocketId).emit(SOCKET_EVENTS.WEBRTC_OFFER, {
      offer: payload.offer,
      senderSocketId: socket.id,
    });
  }

  private handleAnswer(socket: Socket, payload: WebRTCAnswerPayload): void {
    console.log(`[WebRTC] Forwarding answer from ${socket.id} to ${payload.targetSocketId}`);
    // Forward SDP answer to the target (usually host)
    this.io.to(payload.targetSocketId).emit(SOCKET_EVENTS.WEBRTC_ANSWER, {
      answer: payload.answer,
      senderSocketId: socket.id,
    });
  }

  private handleICECandidate(socket: Socket, payload: ICECandidatePayload): void {
    // Forward ICE candidate to the target
    this.io.to(payload.targetSocketId).emit(SOCKET_EVENTS.ICE_CANDIDATE, {
      candidate: payload.candidate,
      senderSocketId: socket.id,
    });
  }

  private handleQualityChanged(socket: Socket, payload: { quality: typeof DEFAULT_QUALITY }): void {
    const room = this.roomManager.getRoomBySocket(socket.id);
    if (room && room.hostId === socket.id) {
      this.roomManager.updateQuality(room.code, payload.quality);

      // Notify all viewers
      for (const [viewerId] of room.viewers) {
        this.io.to(viewerId).emit(SOCKET_EVENTS.QUALITY_CHANGED, {
          quality: payload.quality,
        });
      }
    }
  }

  private handleDisconnect(socket: Socket): void {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
    this.removeSocketAndNotify(socket);
  }

  private removeSocketAndNotify(socket: Socket): void {
    const result = this.roomManager.removeSocket(socket.id);

    if (result.type === 'host' && result.roomId) {
      console.log(`[Room] Host ${socket.id} disconnected, notifying viewers`);
      // Notify all viewers that host disconnected
      this.io.to(result.roomId).emit(SOCKET_EVENTS.HOST_DISCONNECTED);
    } else if (result.type === 'viewer' && result.room) {
      console.log(`[Room] Viewer ${socket.id} left room ${result.room.code}`);
      // Notify host that viewer left
      this.io.to(result.room.hostId).emit(SOCKET_EVENTS.VIEWER_LEFT, {
        viewerSocketId: socket.id,
        viewerCount: result.room.viewers.size,
      });

      this.io.to(result.room.hostId).emit(SOCKET_EVENTS.VIEWER_COUNT, {
        count: result.room.viewers.size,
      });
    }
  }
}
