import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:socket_io_client/socket_io_client.dart' as IO;
import '../models/connection_stats.dart';

class SignalingService {
  IO.Socket? _socket;
  RTCPeerConnection? _peerConnection;
  String? _roomCode;
  String? _hostSocketId;
  String _serverUrl = 'http://localhost:3001';

  // Callbacks
  Function(MediaStream)? onRemoteStream;
  Function()? onDisconnected;
  Function()? onReconnected;
  Function()? onHostDisconnected;

  // Reconnection state
  bool _isReconnecting = false;
  int _reconnectAttempts = 0;
  static const int _maxReconnectAttempts = 10;
  bool _hasJoinedRoom = false;

  // Stats tracking
  int? _lastBytesReceived;
  int? _lastTimestamp;

  // Buffered offer (received before peer connection is ready)
  dynamic _pendingOffer;
  // Buffered ICE candidates (received before peer connection is ready)
  List<dynamic> _pendingIceCandidates = [];

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

      // Wait for connection
      final completer = Completer<bool>();

      _socket!.onConnect((_) async {
        debugPrint('[Signaling] Connected to server');
        // Join room
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
        _hostSocketId = data['hostSocketId'];
        _hasJoinedRoom = true;

        // Setup WebRTC
        await _setupPeerConnection();

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

      // WebRTC signaling
      _socket!.on('webrtc_offer', (data) async {
        debugPrint('[Signaling] Received offer from ${data['senderSocketId']}');
        if (_peerConnection == null) {
          debugPrint('[WebRTC] Peer connection not ready yet, buffering offer');
          _pendingOffer = data;
          return;
        }
        await _handleOffer(data);
      });

      _socket!.on('ice_candidate', (data) async {
        if (data['candidate'] != null) {
          if (_peerConnection == null) {
            debugPrint('[Signaling] Buffering ICE candidate (peer not ready)');
            _pendingIceCandidates.add(data);
            return;
          }
          debugPrint('[Signaling] Received ICE candidate');
          final candidate = RTCIceCandidate(
            data['candidate']['candidate'],
            data['candidate']['sdpMid'],
            data['candidate']['sdpMLineIndex'],
          );
          try {
            await _peerConnection!.addCandidate(candidate);
          } catch (e) {
            debugPrint('[Signaling] Error adding ICE candidate: $e');
          }
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
        _reconnectAttempts = 0;
        onReconnected?.call();

        // Rejoin room if we were in one
        if (_roomCode != null && _hasJoinedRoom) {
          debugPrint('[Signaling] Rejoining room: $_roomCode');
          _socket!.emit('join_room', {'roomCode': _roomCode});
        }
      });

      _socket!.onDisconnect((_) {
        debugPrint('[Signaling] Disconnected from server');
        // Only trigger disconnect callback if we actually had a connection
        // and are not in the middle of reconnecting
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

  Future<List<Map<String, dynamic>>> _fetchIceServers() async {
    // Default STUN-only servers
    final defaultServers = [
      {'urls': 'stun:stun.l.google.com:19302'},
      {'urls': 'stun:stun1.l.google.com:19302'},
      {'urls': 'stun:stun2.l.google.com:19302'},
      {'urls': 'stun:stun3.l.google.com:19302'},
      {'urls': 'stun:stun4.l.google.com:19302'},
    ];

    try {
      final uri = Uri.parse(_serverUrl);
      final iceUrl = Uri.parse('${uri.scheme}://${uri.host}:${uri.port}/ice-servers');
      debugPrint('[Signaling] Fetching ICE servers from $iceUrl');
      final client = HttpClient();
      client.connectionTimeout = const Duration(seconds: 5);
      final request = await client.getUrl(iceUrl);
      final response = await request.close();
      final body = await response.transform(const Utf8Decoder()).join();
      client.close();
      final data = jsonDecode(body);
      if (data['iceServers'] != null && (data['iceServers'] as List).isNotEmpty) {
        debugPrint('[Signaling] Loaded ${(data['iceServers'] as List).length} ICE servers from server');
        return List<Map<String, dynamic>>.from(data['iceServers']);
      }
    } catch (e) {
      debugPrint('[Signaling] Could not fetch ICE servers: $e');
    }
    return defaultServers;
  }

  Future<void> _setupPeerConnection() async {
    final iceServers = await _fetchIceServers();
    _peerConnection = await createPeerConnection({
      'iceServers': iceServers,
      'sdpSemantics': 'unified-plan',
    });

    _peerConnection!.onIceCandidate = (RTCIceCandidate candidate) {
      debugPrint('[WebRTC] Sending ICE candidate: ${candidate.candidate?.substring(0, 30)}...');
      if (_hostSocketId != null && _socket != null) {
        _socket!.emit('ice_candidate', {
          'targetSocketId': _hostSocketId,
          'candidate': {
            'candidate': candidate.candidate,
            'sdpMid': candidate.sdpMid,
            'sdpMLineIndex': candidate.sdpMLineIndex,
          },
        });
      }
    };

    _peerConnection!.onTrack = (RTCTrackEvent event) {
      debugPrint('[WebRTC] Received track: ${event.track.kind}, streams: ${event.streams.length}');
      if (event.streams.isNotEmpty) {
        debugPrint('[WebRTC] Stream ID: ${event.streams[0].id}');
        onRemoteStream?.call(event.streams[0]);
      }
    };

    _peerConnection!.onConnectionState = (state) {
      debugPrint('[WebRTC] Connection state: $state');
    };

    _peerConnection!.onIceConnectionState = (state) {
      debugPrint('[WebRTC] ICE connection state: $state');
      if (state == RTCIceConnectionState.RTCIceConnectionStateFailed) {
        debugPrint('[WebRTC] ICE connection FAILED - attempting restart');
        _restartIce();
      }
    };

    _peerConnection!.onIceGatheringState = (state) {
      debugPrint('[WebRTC] ICE gathering state: $state');
    };

    _peerConnection!.onSignalingState = (state) {
      debugPrint('[WebRTC] Signaling state: $state');
    };

    // Process buffered ICE candidates
    if (_pendingIceCandidates.isNotEmpty) {
      debugPrint('[WebRTC] Processing ${_pendingIceCandidates.length} buffered ICE candidates');
      for (final data in _pendingIceCandidates) {
        if (data['candidate'] != null) {
          final candidate = RTCIceCandidate(
            data['candidate']['candidate'],
            data['candidate']['sdpMid'],
            data['candidate']['sdpMLineIndex'],
          );
          try {
            await _peerConnection!.addCandidate(candidate);
          } catch (e) {
            debugPrint('[WebRTC] Error adding buffered ICE candidate: $e');
          }
        }
      }
      _pendingIceCandidates.clear();
    }

    // Process buffered offer if one arrived while peer connection was being set up
    if (_pendingOffer != null) {
      debugPrint('[WebRTC] Processing buffered offer');
      final offer = _pendingOffer;
      _pendingOffer = null;
      await _handleOffer(offer);
    }
  }

  Future<void> _restartIce() async {
    if (_peerConnection != null) {
      try {
        debugPrint('[WebRTC] Restarting ICE...');
        await _peerConnection!.restartIce();
      } catch (e) {
        debugPrint('[WebRTC] Error restarting ICE: $e');
      }
    }
  }

  Future<void> _handleOffer(dynamic data) async {
    if (_peerConnection == null) {
      debugPrint('[WebRTC] ERROR: Peer connection is null when handling offer');
      return;
    }

    try {
      final offer = data['offer'];
      debugPrint('[WebRTC] Setting remote description, type: ${offer['type']}');

      await _peerConnection!.setRemoteDescription(
        RTCSessionDescription(offer['type'], offer['sdp']),
      );

      debugPrint('[WebRTC] Creating answer...');
      // Create answer
      final answer = await _peerConnection!.createAnswer();
      await _peerConnection!.setLocalDescription(answer);

      debugPrint('[WebRTC] Sending answer to ${data['senderSocketId']}');
      // Send answer back
      _socket!.emit('webrtc_answer', {
        'targetSocketId': data['senderSocketId'],
        'answer': {
          'type': answer.type,
          'sdp': answer.sdp,
        },
      });
    } catch (e) {
      debugPrint('[WebRTC] Error handling offer: $e');
    }
  }

  Future<void> reconnect() async {
    if (_roomCode == null) return;

    _isReconnecting = true;
    _reconnectAttempts++;

    debugPrint('[Signaling] Reconnect attempt $_reconnectAttempts');

    try {
      if (_socket != null && !_socket!.connected) {
        _socket!.connect();
      }
    } catch (e) {
      debugPrint('[Signaling] Reconnect attempt $_reconnectAttempts failed: $e');
    }
  }

  /// Get current WebRTC connection statistics
  Future<ConnectionStats> getStats() async {
    if (_peerConnection == null) return ConnectionStats.empty();

    try {
      final statsReport = await _peerConnection!.getStats();
      double? rtt;
      double? jitter;
      double? packetLoss;
      int? bitrate;
      int? fps;
      int? width;
      int? height;
      String? codec;

      // Handle both List<StatsReport> and StatsReport types
      final reports = statsReport is List ? statsReport : [];

      for (final report in reports) {
        // Inbound video stats
        if (report.type == 'inbound-rtp' && report.values['kind'] == 'video') {
          fps = report.values['framesPerSecond'] as int?;
          width = report.values['frameWidth'] as int?;
          height = report.values['frameHeight'] as int?;

          final bytesReceived = report.values['bytesReceived'] as int? ?? 0;
          final timestamp = report.values['timestamp'] as int? ?? 0;

          // Calculate bitrate from bytes received
          if (_lastBytesReceived != null && _lastTimestamp != null) {
            final bytesDiff = bytesReceived - _lastBytesReceived!;
            final timeDiff = (timestamp - _lastTimestamp!) / 1000; // ms to seconds
            if (timeDiff > 0) {
              bitrate = ((bytesDiff * 8) / timeDiff).round();
            }
          }
          _lastBytesReceived = bytesReceived;
          _lastTimestamp = timestamp;

          // Packet loss
          final packetsLost = report.values['packetsLost'] as int? ?? 0;
          final packetsReceived = report.values['packetsReceived'] as int? ?? 0;
          final totalPackets = packetsLost + packetsReceived;
          if (totalPackets > 0) {
            packetLoss = (packetsLost / totalPackets) * 100;
          }

          // Codec
          codec = report.values['codecId'] as String?;
        }

        // Candidate pair stats (for RTT and jitter)
        if (report.type == 'candidate-pair' && report.values['state'] == 'succeeded') {
          rtt = (report.values['currentRoundTripTime'] as num?)?.toDouble();
          if (rtt != null) rtt *= 1000; // Convert to ms

          jitter = (report.values['jitter'] as num?)?.toDouble();
          if (jitter != null) jitter *= 1000; // Convert to ms
        }
      }

      return ConnectionStats(
        roundTripTime: rtt,
        jitter: jitter,
        packetLoss: packetLoss,
        bitrate: bitrate,
        framesPerSecond: fps,
        width: width,
        height: height,
        codec: codec,
        iceConnectionState: _peerConnection?.iceConnectionState?.toString(),
        connectionState: _peerConnection?.connectionState?.toString(),
      );
    } catch (e) {
      debugPrint('[WebRTC] Error getting stats: $e');
      return ConnectionStats.empty();
    }
  }

  void disconnect() {
    _isReconnecting = false;
    _reconnectAttempts = 0;
    _hasJoinedRoom = false;
    _lastBytesReceived = null;
    _lastTimestamp = null;

    _peerConnection?.close();
    _peerConnection = null;
    _pendingOffer = null;
    _pendingIceCandidates.clear();

    _socket?.emit('leave_room');
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;

    _hostSocketId = null;
    _roomCode = null;
  }

  void dispose() {
    disconnect();
  }
}
