const fs = require('fs');
const path = require('path');

const orchestratorPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-gesture-handler',
  'android',
  'src',
  'main',
  'java',
  'com',
  'swmansion',
  'gesturehandler',
  'core',
  'GestureHandlerOrchestrator.kt',
);

const replacements = [
  ['awaitingHandlers.reversed()', 'awaitingHandlers.asReversed()'],
  ['gestureHandlers.reversed()', 'gestureHandlers.asReversed()'],
];

if (!fs.existsSync(orchestratorPath)) {
  console.warn(`[patch-react-native-gesture-handler-android] Missing ${orchestratorPath}; skipping.`);
  process.exit(0);
}

let source = fs.readFileSync(orchestratorPath, 'utf8');
let changed = false;

for (const [original, patched] of replacements) {
  if (source.includes(original)) {
    source = source.split(original).join(patched);
    changed = true;
  }
}

if (!changed) {
  console.log('[patch-react-native-gesture-handler-android] Patch already applied.');
  process.exit(0);
}

fs.writeFileSync(orchestratorPath, source);
console.log('[patch-react-native-gesture-handler-android] Patched Android List.reversed compatibility issue.');
