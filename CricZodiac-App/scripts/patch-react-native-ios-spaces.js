const fs = require('fs');
const path = require('path');

const scriptPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native',
  'scripts',
  'react_native_pods_utils',
  'script_phases.sh',
);

if (!fs.existsSync(scriptPath)) {
  console.warn('[postinstall] React Native iOS codegen helper not found; skipping path-space patch.');
  process.exit(0);
}

const original = `    if [ "$SRCS_PATTERN" ]; then
        JS_SRCS=$(find "$PODS_TARGET_SRCROOT/$SRCS_DIR" -type f -name "$SRCS_PATTERN" -print0 | xargs -0)
        echo "$RCT_SCRIPT_FILE_LIST" >> "\${SCRIPT_OUTPUT_FILE_0}" 2>&1
    else
        JS_SRCS="$PODS_TARGET_SRCROOT/$SRCS_DIR"
        echo "$RCT_SCRIPT_JS_SRCS_DIR" >> "\${SCRIPT_OUTPUT_FILE_0}" 2>&1
    fi

    # shellcheck disable=SC2086
    # $JS_SRCS not having double quotations is intentional
    "$NODE_BINARY" "$CODEGEN_CLI_PATH/lib/cli/combine/combine-js-to-schema-cli.js" "$GENERATED_SCHEMA_FILE" $JS_SRCS`;

const patched = `    JS_SRCS=()
    if [ "$SRCS_PATTERN" ]; then
        while IFS= read -r -d '' source_file; do
            JS_SRCS+=("$source_file")
        done < <(find "$PODS_TARGET_SRCROOT/$SRCS_DIR" -type f -name "$SRCS_PATTERN" -print0)
        echo "$RCT_SCRIPT_FILE_LIST" >> "\${SCRIPT_OUTPUT_FILE_0}" 2>&1
    else
        JS_SRCS=("$PODS_TARGET_SRCROOT/$SRCS_DIR")
        echo "$RCT_SCRIPT_JS_SRCS_DIR" >> "\${SCRIPT_OUTPUT_FILE_0}" 2>&1
    fi

    "$NODE_BINARY" "$CODEGEN_CLI_PATH/lib/cli/combine/combine-js-to-schema-cli.js" "$GENERATED_SCHEMA_FILE" "\${JS_SRCS[@]}"`;

const contents = fs.readFileSync(scriptPath, 'utf8');

if (contents.includes(patched)) {
  process.exit(0);
}

if (!contents.includes(original)) {
  console.warn('[postinstall] React Native iOS codegen helper has changed; skipping path-space patch.');
  process.exit(0);
}

fs.writeFileSync(scriptPath, contents.replace(original, patched));
console.log('[postinstall] Patched React Native iOS codegen helper for project paths with spaces.');
