const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src', 'ui');
const destDir = path.join(__dirname, '..', 'dist', 'ui');

// Create dest directory
fs.mkdirSync(destDir, { recursive: true });

// Copy all files from src/ui to dist/ui
const files = fs.readdirSync(srcDir);
for (const file of files) {
  const srcPath = path.join(srcDir, file);
  const destPath = path.join(destDir, file);
  fs.copyFileSync(srcPath, destPath);
  console.log(`  Copied: ${file}`);
}

console.log('✅ UI files copied to dist/ui');
