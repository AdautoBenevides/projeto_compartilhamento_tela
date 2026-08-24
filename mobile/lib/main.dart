import 'package:flutter/material.dart';
import 'screens/join_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ScreenShareApp());
}

class ScreenShareApp extends StatelessWidget {
  const ScreenShareApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Screen Share',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        primaryColor: const Color(0xFF00D4FF),
        scaffoldBackgroundColor: const Color(0xFF1A1A2E),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF00D4FF),
          secondary: Color(0xFF00D4FF),
          surface: Color(0xFF16213E),
        ),
        useMaterial3: true,
      ),
      home: const JoinScreen(),
    );
  }
}
