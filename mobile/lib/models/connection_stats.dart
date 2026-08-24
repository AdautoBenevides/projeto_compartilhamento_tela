// Connection statistics model

class ConnectionStats {
  final double? roundTripTime; // ms
  final double? jitter; // ms
  final double? packetLoss; // percentage 0-100
  final int? bitrate; // bits per second
  final int? framesPerSecond;
  final int? width;
  final int? height;
  final String? codec;
  final String? iceConnectionState;
  final String? connectionState;

  const ConnectionStats({
    this.roundTripTime,
    this.jitter,
    this.packetLoss,
    this.bitrate,
    this.framesPerSecond,
    this.width,
    this.height,
    this.codec,
    this.iceConnectionState,
    this.connectionState,
  });

  factory ConnectionStats.empty() => const ConnectionStats();

  String get bitrateFormatted {
    if (bitrate == null) return '--';
    if (bitrate! >= 1000000) {
      return '${(bitrate! / 1000000).toStringAsFixed(1)} Mbps';
    } else if (bitrate! >= 1000) {
      return '${(bitrate! / 1000).toStringAsFixed(0)} Kbps';
    }
    return '$bitrate bps';
  }

  String get rttFormatted {
    if (roundTripTime == null) return '--';
    return '${roundTripTime!.toStringAsFixed(0)} ms';
  }

  String get jitterFormatted {
    if (jitter == null) return '--';
    return '${jitter!.toStringAsFixed(1)} ms';
  }

  String get packetLossFormatted {
    if (packetLoss == null) return '--';
    return '${packetLoss!.toStringAsFixed(1)}%';
  }

  String get resolutionFormatted {
    if (width == null || height == null) return '--';
    return '${width}x$height';
  }

  String get fpsFormatted {
    if (framesPerSecond == null) return '--';
    return '$framesPerSecond FPS';
  }

  ConnectionQuality get quality {
    if (roundTripTime == null) return ConnectionQuality.unknown;
    if (roundTripTime! < 50 && (packetLoss ?? 0) < 1) {
      return ConnectionQuality.excellent;
    } else if (roundTripTime! < 100 && (packetLoss ?? 0) < 3) {
      return ConnectionQuality.good;
    } else if (roundTripTime! < 200 && (packetLoss ?? 0) < 5) {
      return ConnectionQuality.fair;
    }
    return ConnectionQuality.poor;
  }
}

enum ConnectionQuality {
  excellent,
  good,
  fair,
  poor,
  unknown,
}

extension ConnectionQualityExtension on ConnectionQuality {
  String get label {
    switch (this) {
      case ConnectionQuality.excellent:
        return 'Excelente';
      case ConnectionQuality.good:
        return 'Boa';
      case ConnectionQuality.fair:
        return 'Regular';
      case ConnectionQuality.poor:
        return 'Ruim';
      case ConnectionQuality.unknown:
        return 'Desconhecido';
    }
  }

  int get colorValue {
    switch (this) {
      case ConnectionQuality.excellent:
        return 0xFF2ECC71; // Green
      case ConnectionQuality.good:
        return 0xFF27AE60; // Dark green
      case ConnectionQuality.fair:
        return 0xFFF39C12; // Orange
      case ConnectionQuality.poor:
        return 0xFFE74C3C; // Red
      case ConnectionQuality.unknown:
        return 0xFF95A5A6; // Gray
    }
  }
}
