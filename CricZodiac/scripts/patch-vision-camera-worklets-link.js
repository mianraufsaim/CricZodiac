const fs = require('fs');
const path = require('path');

const cmakePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-vision-camera',
  'android',
  'CMakeLists.txt'
);

const originalBlock = `if (ENABLE_FRAME_PROCESSORS)
    message("VisionCamera: Linking react-native-worklets...")
    find_package(react-native-worklets-core REQUIRED CONFIG)
    target_link_libraries(
            \${PACKAGE_NAME}
            react-native-worklets-core::rnworklets
    )
endif()`;

const patchedBlock = `if (ENABLE_FRAME_PROCESSORS)
    message("VisionCamera: Linking react-native-worklets...")
    find_package(react-native-worklets-core REQUIRED CONFIG)

    # react-native-worklets-core 1.3.x can export a header-only prefab target to
    # project consumers, leaving VisionCamera without RNWorklet symbols at link
    # time. Link the actual native library Gradle builds for the variant.
    set(WORKLETS_BUILD_VARIANT "release")
    if (CMAKE_BUILD_TYPE STREQUAL "Debug")
        set(WORKLETS_BUILD_VARIANT "debug")
    endif()
    set(RNWORKLETS_LIB "\${NODE_MODULES_DIR}/react-native-worklets-core/android/build/intermediates/cmake/\${WORKLETS_BUILD_VARIANT}/obj/\${ANDROID_ABI}/librnworklets.so")
    message("VisionCamera: Linking rnworklets library at \${RNWORKLETS_LIB}")

    target_link_libraries(
            \${PACKAGE_NAME}
            react-native-worklets-core::rnworklets
            \${RNWORKLETS_LIB}
    )
endif()`;

if (!fs.existsSync(cmakePath)) {
  console.warn(`[patch-vision-camera-worklets-link] Missing ${cmakePath}; skipping.`);
  process.exit(0);
}

const source = fs.readFileSync(cmakePath, 'utf8');

if (source.includes('RNWORKLETS_LIB')) {
  console.log('[patch-vision-camera-worklets-link] Patch already applied.');
  process.exit(0);
}

if (!source.includes(originalBlock)) {
  console.warn('[patch-vision-camera-worklets-link] Expected VisionCamera CMake block was not found; skipping.');
  process.exit(0);
}

fs.writeFileSync(cmakePath, source.replace(originalBlock, patchedBlock));
console.log('[patch-vision-camera-worklets-link] Patched VisionCamera Worklets native link.');
