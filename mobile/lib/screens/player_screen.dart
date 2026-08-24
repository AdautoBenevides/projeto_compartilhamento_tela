import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:wakelock_plus/wakelock_plus.dart';
import '../services/signaling_service.dart';
import '../models/connection_stats.dart';

class PlayerScreen extends StatefulWidget {
  final SignalingService signaling;
  final String roomCode;

  const PlayerScreen({
    super.key,
    required this.signaling,
    required this.roomCode,
  });

  @override
  State<PlayerScreen> createState() => _PlayerScreenState();
}

class _PlayerScreenState extends State<PlayerScreen> {
  final RTCVideoRenderer _remoteRenderer = RTCVideoRenderer();
  bool _isConnected = false;
  bool _isReconnecting = false;
  bool _showControls = true;
  bool _isFullscreen = true;
  Timer? _hideControlsTimer;

  // Stats
  bool _showStats = false;
  ConnectionStats _stats = ConnectionStats.empty();
  Timer? _statsTimer;

  @override
  void initState() {
    super.initState();
    _initRenderer();
    _listenToStream();
    WakelockPlus.enable();
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    _startHideControlsTimer();
    _startStatsTimer();
  }

  Future<void> _initRenderer() async {
    await _remoteRenderer.initialize();
    setState(() {});
  }

  void _listenToStream() {
    // Listen for remote stream
    widget.signaling.onRemoteStream = (stream) {
      _remoteRenderer.srcObject = stream;
      setState(() {
        _isConnected = true;
        _isReconnecting = false;
      });
    };

    // Listen for disconnection
    widget.signaling.onDisconnected = () {
      setState(() {
        _isConnected = false;
        _isReconnecting = true;
      });
      _attemptReconnect();
    };

    // Listen for reconnection
    widget.signaling.onReconnected = () {
      setState(() {
        _isReconnecting = false;
      });
    };

    // Listen for host disconnect
    widget.signaling.onHostDisconnected = () {
      _showHostDisconnected();
    };
  }

  Future<void> _attemptReconnect() async {
    // Auto-reconnect logic handled by signaling service
    int attempts = 0;
    const maxAttempts = 10;

    while (_isReconnecting && attempts < maxAttempts && mounted) {
      attempts++;
      await Future.delayed(Duration(seconds: attempts));

      if (mounted && _isReconnecting) {
        try {
          await widget.signaling.reconnect();
          break;
        } catch (e) {
          continue;
        }
      }
    }

    if (_isReconnecting && mounted) {
      _showReconnectFailed();
    }
  }

  void _showHostDisconnected() {
    if (!mounted) return;
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF16213E),
        title: const Text(
          'Transmission Ended',
          style: TextStyle(color: Colors.white),
        ),
        content: const Text(
          'The host has stopped sharing their screen.',
          style: TextStyle(color: Colors.grey),
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(context).pop();
              _leave();
            },
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  void _showReconnectFailed() {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Could not reconnect. Returning to home.'),
        backgroundColor: Colors.red,
      ),
    );
    _leave();
  }

  void _leave() {
    WakelockPlus.disable();
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
      DeviceOrientation.portraitDown,
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);
    widget.signaling.disconnect();
    Navigator.of(context).pop();
  }

  void _toggleControls() {
    setState(() => _showControls = !_showControls);
    if (_showControls) {
      _startHideControlsTimer();
    }
  }

  void _startHideControlsTimer() {
    _hideControlsTimer?.cancel();
    _hideControlsTimer = Timer(const Duration(seconds: 5), () {
      if (mounted && _isConnected) {
        setState(() => _showControls = false);
      }
    });
  }

  void _toggleFullscreen() {
    setState(() => _isFullscreen = !_isFullscreen);
    if (_isFullscreen) {
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    } else {
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    }
  }

  void _toggleOrientation() {
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);
  }

  @override
  void dispose() {
    _hideControlsTimer?.cancel();
    _statsTimer?.cancel();
    _remoteRenderer.dispose();
    WakelockPlus.disable();
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    super.dispose();
  }

  void _startStatsTimer() {
    _statsTimer = Timer.periodic(const Duration(seconds: 2), (_) => _updateStats());
  }

  Future<void> _updateStats() async {
    if (!mounted || !_isConnected) return;
    final stats = await widget.signaling.getStats();
    if (mounted) {
      setState(() => _stats = stats);
    }
  }

  void _toggleStats() {
    setState(() => _showStats = !_showStats);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: GestureDetector(
        onTap: _toggleControls,
        child: Stack(
          fit: StackFit.expand,
          children: [
            // Video render
            Center(
              child: _isConnected
                  ? RTCVideoView(
                      _remoteRenderer,
                      objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                    )
                  : _buildLoadingWidget(),
            ),

            // Overlay controls
            if (_showControls)
              AnimatedOpacity(
                opacity: _showControls ? 1.0 : 0.0,
                duration: const Duration(milliseconds: 300),
                child: _buildOverlayControls(),
              ),

            // Stats overlay
            if (_showStats && _isConnected)
              Positioned(
                top: MediaQuery.of(context).padding.top + 60,
                right: 16,
                child: _buildStatsOverlay(),
              ),

            // Reconnecting indicator
            if (_isReconnecting)
              Positioned(
                top: MediaQuery.of(context).padding.top + 16,
                left: 0,
                right: 0,
                child: Center(
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 20,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.orange.withOpacity(0.9),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        ),
                        SizedBox(width: 10),
                        Text(
                          'Reconectando...',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildLoadingWidget() {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const CircularProgressIndicator(
          color: Color(0xFF00D4FF),
          strokeWidth: 3,
        ),
        const SizedBox(height: 20),
        Text(
          _isReconnecting ? 'Reconectando...' : 'Conectando...',
          style: const TextStyle(
            color: Colors.white70,
            fontSize: 16,
          ),
        ),
      ],
    );
  }

  Widget _buildOverlayControls() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Colors.black54,
            Colors.transparent,
            Colors.transparent,
            Colors.black54,
          ],
          stops: [0, 0.2, 0.8, 1],
        ),
      ),
      child: SafeArea(
        child: Column(
          children: [
            // Top bar
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  // Back button
                  IconButton(
                    onPressed: _leave,
                    icon: const Icon(
                      Icons.arrow_back,
                      color: Colors.white,
                      size: 28,
                    ),
                  ),
                  // Room code
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      widget.roomCode,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 2,
                      ),
                    ),
                  ),
                  const Spacer(),
                  // Connection status
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: _isConnected
                          ? Colors.green.withOpacity(0.2)
                          : Colors.red.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            color: _isConnected ? Colors.green : Colors.red,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          _isConnected ? 'Conectado' : 'Desconectado',
                          style: TextStyle(
                            color: _isConnected ? Colors.green : Colors.red,
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            const Spacer(),

            // Bottom controls
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // Fullscreen toggle
                  _buildControlButton(
                    icon: _isFullscreen
                        ? Icons.fullscreen_exit
                        : Icons.fullscreen,
                    label: _isFullscreen ? 'Sair Tela Cheia' : 'Tela Cheia',
                    onTap: _toggleFullscreen,
                  ),
                  const SizedBox(width: 30),
                  // Orientation lock
                  _buildControlButton(
                    icon: Icons.screen_lock_rotation,
                    label: 'Rotação',
                    onTap: _toggleOrientation,
                  ),
                  const SizedBox(width: 30),
                  // Stats toggle
                  _buildControlButton(
                    icon: Icons.analytics,
                    label: 'Stats',
                    onTap: _toggleStats,
                    isActive: _showStats,
                  ),
                  const SizedBox(width: 30),
                  // Leave button
                  _buildControlButton(
                    icon: Icons.stop_circle,
                    label: 'Sair',
                    color: Colors.red,
                    onTap: _leave,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildControlButton({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
    Color color = Colors.white,
    bool isActive = false,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 50,
            height: 50,
            decoration: BoxDecoration(
              color: isActive
                  ? const Color(0xFF00D4FF).withOpacity(0.3)
                  : Colors.white.withOpacity(0.15),
              shape: BoxShape.circle,
              border: isActive
                  ? Border.all(color: const Color(0xFF00D4FF), width: 1.5)
                  : null,
            ),
            child: Icon(icon, color: color, size: 26),
          ),
          const SizedBox(height: 6),
          Text(
            label,
            style: TextStyle(
              color: color.withOpacity(0.8),
              fontSize: 11,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatsOverlay() {
    final qualityColor = Color(_stats.quality.colorValue);

    return Container(
      width: 220,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.85),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: qualityColor.withOpacity(0.5),
          width: 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // Header
          Row(
            children: [
              const Icon(
                Icons.analytics,
                color: Color(0xFF00D4FF),
                size: 16,
              ),
              const SizedBox(width: 6),
              const Text(
                'STATS',
                style: TextStyle(
                  color: Color(0xFF00D4FF),
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 1,
                ),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 8,
                  vertical: 2,
                ),
                decoration: BoxDecoration(
                  color: qualityColor.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  _stats.quality.label,
                  style: TextStyle(
                    color: qualityColor,
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          // Stats rows
          _buildStatRow('Resolução', _stats.resolutionFormatted),
          _buildStatRow('FPS', _stats.fpsFormatted),
          _buildStatRow('Bitrate', _stats.bitrateFormatted),
          _buildStatRow('RTT', _stats.rttFormatted),
          _buildStatRow('Jitter', _stats.jitterFormatted),
          _buildStatRow('Perda', _stats.packetLossFormatted),
          _buildStatRow('Codec', _stats.codec ?? '--'),
        ],
      ),
    );
  }

  Widget _buildStatRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              color: Colors.grey[400],
              fontSize: 11,
            ),
          ),
          Text(
            value,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 11,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
