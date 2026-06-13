#!/bin/bash
# ============================================================
# CricZodiac — Android Debug APK Build Script
# Run this on your Mac/PC after npm install
# ============================================================

set -e

GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'

echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   CricZodiac — Building Debug APK    ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"

# 1. Install npm dependencies
echo -e "\n${GREEN}[1/5] Installing npm dependencies...${NC}"
npm install

# 2. Install iOS pods (Mac only)
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -e "${GREEN}[2/5] Installing CocoaPods...${NC}"
    cd ios && pod install && cd ..
else
    echo -e "${GREEN}[2/5] Skipping CocoaPods (not macOS)${NC}"
fi

# 3. Clean Android build
echo -e "${GREEN}[3/5] Cleaning Android build...${NC}"
cd android
./gradlew clean
cd ..

# 4. Build debug APK
echo -e "${GREEN}[4/5] Building Debug APK...${NC}"
cd android
./gradlew assembleDebug --no-daemon
cd ..

# 5. Show result
APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"
if [[ -f "$APK_PATH" ]]; then
    SIZE=$(du -sh "$APK_PATH" | cut -f1)
    echo -e "\n${GREEN}╔══════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✅  APK BUILT SUCCESSFULLY!                 ║${NC}"
    echo -e "${GREEN}╠══════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║  Path: ${CYAN}$APK_PATH${GREEN}  ║${NC}"
    echo -e "${GREEN}║  Size: ${CYAN}$SIZE${GREEN}                               ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"

    # Install directly on connected device if available
    if command -v adb &>/dev/null; then
        DEVICES=$(adb devices | grep -v "List" | grep "device$" | wc -l)
        if [[ "$DEVICES" -gt 0 ]]; then
            echo -e "\n${GREEN}Installing on connected Android device...${NC}"
            adb install -r "$APK_PATH"
            echo -e "${GREEN}✅ Installed on device!${NC}"
        fi
    fi
else
    echo "❌ APK build failed. Check logs above."
    exit 1
fi
