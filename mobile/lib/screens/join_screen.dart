import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'player_screen.dart';
import 'qr_scanner_screen.dart';
import '../services/signaling_service.dart';

class JoinScreen extends StatefulWidget {
  const JoinScreen({super.key});

  @override
  State<JoinScreen> createState() => _JoinScreenState();
}

class _JoinScreenState extends State<JoinScreen> {
  final TextEditingController _codeController = TextEditingController();
  final TextEditingController _serverController = TextEditingController(text: 'http://192.168.1.100:3001');
  final SignalingService _signaling = SignalingService();
  bool _isConnecting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _requestPermissions();
  }

  Future<void> _requestPermissions() async {
    await [
      Permission.camera,
      Permission.microphone,
    ].request();
  }

  Future<void> _joinRoom() async {
    final code = _codeController.text.trim().toUpperCase();
    if (code.isEmpty || code.length < 6) {
      setState(() => _error = 'Please enter a valid room code');
      return;
    }

    setState(() {
      _isConnecting = true;
      _error = null;
    });

    try {
      final serverUrl = _serverController.text.trim();
      final success = await _signaling.connect(code, serverUrl: serverUrl);
      if (!success) {
        setState(() {
          _error = 'Could not join room. Check the code and try again.';
          _isConnecting = false;
        });
        return;
      }

      if (!mounted) return;

      // Navigate to player screen
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (context) => PlayerScreen(
            signaling: _signaling,
            roomCode: code,
          ),
        ),
      );
    } catch (e) {
      setState(() {
        _error = 'Connection failed: ${e.toString()}';
        _isConnecting = false;
      });
    }
  }

  void _scanQR() async {
    final result = await Navigator.push<String>(
      context,
      MaterialPageRoute(
        builder: (context) => const QRScannerScreen(),
      ),
    );

    if (result != null && result.isNotEmpty) {
      // Extract code from QR data (format: screen-share:XXXX-XXXX)
      String code = result;
      if (code.startsWith('screen-share:')) {
        code = code.substring('screen-share:'.length);
      }
      _codeController.text = code;
      _joinRoom();
    }
  }

  @override
  void dispose() {
    _codeController.dispose();
    _signaling.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(30),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Title
              const Icon(
                Icons.tv,
                size: 64,
                color: Color(0xFF00D4FF),
              ),
              const SizedBox(height: 16),
              const Text(
                'ASSISTIR TRANSMISSÃO',
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF00D4FF),
                  letterSpacing: 1.5,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Digite o código da sala para assistir',
                style: TextStyle(
                  fontSize: 14,
                  color: Colors.grey[400],
                ),
              ),
              const SizedBox(height: 24),

              // Server URL input
              Container(
                decoration: BoxDecoration(
                  color: const Color(0xFF0F3460),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: const Color(0xFF1A4080),
                    width: 1.5,
                  ),
                ),
                child: TextField(
                  controller: _serverController,
                  style: const TextStyle(
                    fontSize: 13,
                  ),
                  decoration: InputDecoration(
                    hintText: 'http://IP_DO_PC:3001',
                    hintStyle: TextStyle(
                      color: Colors.grey[600],
                      fontSize: 13,
                    ),
                    prefixIcon: const Icon(
                      Icons.dns,
                      color: Color(0xFF00D4FF),
                      size: 20,
                    ),
                    border: InputBorder.none,
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 14,
                    ),
                  ),
                ),
              ),

              const SizedBox(height: 16),

              // Code input
              Container(
                decoration: BoxDecoration(
                  color: const Color(0xFF0F3460),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: _error != null
                        ? Colors.red
                        : const Color(0xFF1A4080),
                    width: 1.5,
                  ),
                ),
                child: TextField(
                  controller: _codeController,
                  textAlign: TextAlign.center,
                  textCapitalization: TextCapitalization.characters,
                  style: const TextStyle(
                    fontSize: 24,
                    letterSpacing: 4,
                    fontWeight: FontWeight.bold,
                  ),
                  decoration: InputDecoration(
                    hintText: 'XXXX-XXXX',
                    hintStyle: TextStyle(
                      color: Colors.grey[600],
                      fontSize: 24,
                      letterSpacing: 4,
                    ),
                    border: InputBorder.none,
                    contentPadding: const EdgeInsets.all(20),
                  ),
                  onSubmitted: (_) => _joinRoom(),
                ),
              ),

              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(
                  _error!,
                  style: const TextStyle(color: Colors.red, fontSize: 13),
                  textAlign: TextAlign.center,
                ),
              ],

              const SizedBox(height: 24),

              // Connect button
              SizedBox(
                width: double.infinity,
                height: 54,
                child: ElevatedButton(
                  onPressed: _isConnecting ? null : _joinRoom,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF00D4FF),
                    foregroundColor: const Color(0xFF1A1A2E),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    elevation: 0,
                  ),
                  child: _isConnecting
                      ? const SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.5,
                            color: Color(0xFF1A1A2E),
                          ),
                        )
                      : const Text(
                          'CONECTAR',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                ),
              ),

              const SizedBox(height: 16),

              // QR Code button
              SizedBox(
                width: double.infinity,
                height: 54,
                child: OutlinedButton.icon(
                  onPressed: _isConnecting ? null : _scanQR,
                  icon: const Icon(Icons.qr_code_scanner, size: 22),
                  label: const Text(
                    'ESCANEAR QR CODE',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFF00D4FF),
                    side: const BorderSide(
                      color: Color(0xFF00D4FF),
                      width: 1.5,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
