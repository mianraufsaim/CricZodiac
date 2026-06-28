const fs = require('fs');
const path = require('path');

const screenStackPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-screens',
  'android',
  'src',
  'main',
  'java',
  'com',
  'swmansion',
  'rnscreens',
  'ScreenStack.kt',
);

const original = 'if (drawingOpPool.isEmpty()) DrawingOp() else drawingOpPool.removeLast()';
const patched = 'if (drawingOpPool.isEmpty()) DrawingOp() else drawingOpPool.removeAt(drawingOpPool.lastIndex)';

if (!fs.existsSync(screenStackPath)) {
  console.warn(`[patch-react-native-screens-android] Missing ${screenStackPath}; skipping.`);
  process.exit(0);
}

const source = fs.readFileSync(screenStackPath, 'utf8');

if (source.includes(patched)) {
  console.log('[patch-react-native-screens-android] Patch already applied.');
  process.exit(0);
}

if (!source.includes(original)) {
  console.warn('[patch-react-native-screens-android] Expected ScreenStack removeLast call was not found; skipping.');
  process.exit(0);
}

fs.writeFileSync(screenStackPath, source.replace(original, patched));
console.log('[patch-react-native-screens-android] Patched Android 15 removeLast compatibility issue.');
