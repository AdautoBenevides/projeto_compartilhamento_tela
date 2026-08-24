// Dart models matching shared TypeScript types

enum QualityPreset { economy, standard, high }

class QualitySettings {
  final int width;
  final int height;
  final int fps;
  final int maxBitrate;
  final int minBitrate;

  const QualitySettings({
    required this.width,
    required this.height,
    required this.fps,
    required this.maxBitrate,
    required this.minBitrate,
  });
}

const Map<QualityPreset, QualitySettings> qualityPresets = {
  QualityPreset.economy: QualitySettings(
    width: 1280,
    height: 720,
    fps: 30,
    maxBitrate: 1500000,
    minBitrate: 300000,
  ),
  QualityPreset.standard: QualitySettings(
    width: 1280,
    height: 720,
    fps: 30,
    maxBitrate: 2500000,
    minBitrate: 500000,
  ),
  QualityPreset.high: QualitySettings(
    width: 1920,
    height: 1080,
    fps: 30,
    maxBitrate: 5000000,
    minBitrate: 1000000,
  ),
};

class ConnectionStatus {
  final String status;
  final double? ping;
  final double? jitter;
  final double? packetLoss;

  const ConnectionStatus({
    required this.status,
    this.ping,
    this.jitter,
    this.packetLoss,
  });
}

class RoomInfo {
  final String roomId;
  final String roomCode;
  final String hostSocketId;
  final QualityPreset quality;
  final bool audioEnabled;
  final int viewerCount;

  const RoomInfo({
    required this.roomId,
    required this.roomCode,
    required this.hostSocketId,
    required this.quality,
    required this.audioEnabled,
    required this.viewerCount,
  });
}
