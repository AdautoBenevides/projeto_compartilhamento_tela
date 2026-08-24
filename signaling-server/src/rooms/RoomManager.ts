import { v4 as uuidv4 } from 'uuid';
import { Room, ViewerInfo, QualityPreset } from '../shared/types';
import { ROOM_CODE_LENGTH, ROOM_CODE_CHARS, MAX_VIEWERS_PER_ROOM } from '../shared/constants';

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private codeToRoomId: Map<string, string> = new Map();
  private socketToRoom: Map<string, string> = new Map();

  private generateCode(): string {
    let code: string;
    do {
      code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
      }
    } while (this.codeToRoomId.has(code));
    return code;
  }

  createRoom(hostSocketId: string, quality: QualityPreset, audioEnabled: boolean): Room {
    const id = uuidv4();
    const code = this.generateCode();
    const token = uuidv4();

    const room: Room = {
      id,
      code,
      hostId: hostSocketId,
      createdAt: Date.now(),
      viewers: new Map(),
      quality,
      audioEnabled,
      token,
    };

    this.rooms.set(id, room);
    this.codeToRoomId.set(code, id);
    this.socketToRoom.set(hostSocketId, id);

    console.log(`[Room] Created room ${code} (${id}) by ${hostSocketId}`);
    return room;
  }

  joinRoom(roomCode: string, viewerSocketId: string): { success: boolean; room?: Room; error?: string } {
    const roomId = this.codeToRoomId.get(roomCode);
    if (!roomId) {
      return { success: false, error: 'Room not found' };
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    if (room.viewers.size >= MAX_VIEWERS_PER_ROOM) {
      return { success: false, error: 'Room is full' };
    }

    const viewer: ViewerInfo = {
      socketId: viewerSocketId,
      joinedAt: Date.now(),
    };

    room.viewers.set(viewerSocketId, viewer);
    this.socketToRoom.set(viewerSocketId, roomId);

    console.log(`[Room] Viewer ${viewerSocketId} joined room ${roomCode}`);
    return { success: true, room };
  }

  removeSocket(socketId: string): { type: 'host' | 'viewer' | null; roomId?: string; room?: Room } {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) {
      return { type: null };
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      this.socketToRoom.delete(socketId);
      return { type: null };
    }

    if (room.hostId === socketId) {
      // Host disconnected - destroy room
      this.destroyRoom(roomId);
      console.log(`[Room] Host ${socketId} left, room ${room.code} destroyed`);
      return { type: 'host', roomId };
    }

    // Viewer left
    room.viewers.delete(socketId);
    this.socketToRoom.delete(socketId);
    console.log(`[Room] Viewer ${socketId} left room ${room.code}`);

    return { type: 'viewer', roomId, room };
  }

  private destroyRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      this.codeToRoomId.delete(room.code);
      // Remove all viewer socket mappings
      for (const [viewerId] of room.viewers) {
        this.socketToRoom.delete(viewerId);
      }
      this.rooms.delete(roomId);
    }
  }

  getRoomByCode(code: string): Room | undefined {
    const roomId = this.codeToRoomId.get(code);
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  getRoomBySocket(socketId: string): Room | undefined {
    const roomId = this.socketToRoom.get(socketId);
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  getViewerCount(roomCode: string): number {
    const room = this.getRoomByCode(roomCode);
    return room ? room.viewers.size : 0;
  }

  updateQuality(roomCode: string, quality: QualityPreset): void {
    const room = this.getRoomByCode(roomCode);
    if (room) {
      room.quality = quality;
    }
  }

  // Cleanup old rooms (called periodically)
  cleanup(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    for (const [roomId, room] of this.rooms) {
      if (now - room.createdAt > maxAgeMs) {
        this.destroyRoom(roomId);
        console.log(`[Room] Expired room ${room.code}`);
      }
    }
  }
}
