import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as IO;

class SignalingService {
  IO.Socket? _socket;
  String? _roomCode;
  String _serverUrl = 'http://localhost:3001';

  // Callbacks
  Function(Uint8List frameBytes)? onFrame;
  Function()? onDisconnected;
  Function()? onReconnected;
  Function()? onHostDisconnected;

  // Reconnection state
  bool _isReconnecting = false;
  bool _hasJoinedRoom = false;

  Future<bool> connect(String roomCode, {String serverUrl = 'http://localhost:3001'}) async {
    _roomCode = roomCode;
    _serverUrl = serverUrl;
    _hasJoinedRoom = false;

    try {
      debugPrint('[Signaling] Connecting to $serverUrl');
      _socket = IO.io(serverUrl, IO.OptionBuilder()
          .setTransports(['websocket', 'polling'])
          .enableAutoConnect()
          .enableReconnection()
          .setReconnectionAttempts(10)
          .setReconnectionDelay(1000)
          .build());

      final completer = Completer<bool>();

      _socket!.onConnect((_) async {
        debugPrint('[Signaling] Connected to server');
        _socket!.emit('join_room', {'roomCode': roomCode});
      });

      _socket!.onConnectError((error) {
        debugPrint('[Signaling] Connection error: $error');
        if (!completer.isCompleted) {
          completer.complete(false);
        }
      });

      _socket!.onConnectTimeout((_) {
        debugPrint('[Signaling] Connection timeout');
        if (!completer.isCompleted) {
          completer.complete(false);
        }
      });

      _socket!.on('room_joined', (data) async {
        debugPrint('[Signaling] Joined room: ${data['roomId']}');
        _hasJoinedRoom = true;
        if (!completer.isCompleted) {
          completer.complete(true);
        }
      });

      _socket!.on('room_error', (data) {
        debugPrint('[Signaling] Room error: ${data['error']}');
        if (!completer.isCompleted) {
          completer.complete(false);
        }
      });

      // Screen frame reception
      _socket!.on('screen_frame', (data) {
        try {
          final frameStr = data['frame'] as String;
          // Remove data URL prefix: "data:image/jpeg;base64,"
          final base64Data = frameStr.contains(',')
              ? frameStr.split(',').last
              : frameStr;
          final bytes = base64Decode(base64Data);
          onFrame?.call(bytes);
        } catch (e) {
          debugPrint('[Signaling] Error decoding frame: $e');
        }
      });

      // Host events
      _socket!.on('host_disconnected', (_) {
        debugPrint('[Signaling] Host disconnected');
        onHostDisconnected?.call();
      });

      _socket!.on('quality_changed', (data) {
        debugPrint('[Signaling] Quality changed: ${data['quality']}');
      });

      // Reconnection handling
      _socket!.onReconnect((_) async {
        debugPrint('[Signaling] Reconnected to server');
        _isReconnecting = false;
        onReconnected?.call();

        if (_roomCode != null && _hasJoinedRoom) {
          debugPrint('[Signaling] Rejoining room: $_roomCode');
          _socket!.emit('join_room', {'roomCode': _roomCode});
        }
      });

      _socket!.onDisconnect((_) {
        debugPrint('[Signaling] Disconnected from server');
        if (_hasJoinedRoom && !_isReconnecting) {
          _isReconnecting = true;
          onDisconnected?.call();
        }
      });

      return completer.future;
    } catch (e) {
      debugPrint('[Signaling] Failed to connect: $e');
      return false;
    }
  }

  Future<void> reconnect() async {
    if (_roomCode == null) return;
    _isReconnecting = true;
    debugPrint('[Signaling] Reconnecting...');
    try {
      if (_socket != null && !_socket!.connected) {
        _socket!.connect();
      }
    } catch (e) {
      debugPrint('[Signaling] Reconnect failed: $e');
    }
  }

  void disconnect() {
    _isReconnecting = false;
    _hasJoinedRoom = false;

    _socket?.emit('leave_room');
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _roomCode = null;
  }

  void dispose() {
    disconnect();
  }
}
