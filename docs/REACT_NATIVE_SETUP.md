# CricZodiac — React Native CLI Setup Guide

## Prerequisites

```bash
# Install Node.js 18+
node --version  # must be 18+

# Install React Native CLI
npm install -g react-native-cli

# Android: Install Android Studio + SDK
# iOS: Install Xcode + CocoaPods (Mac only)
brew install cocoapods
```

## Project Setup

```bash
# Navigate to project
cd "CricZodiac-App"

# Install dependencies
npm install

# iOS: Install pods
cd ios && pod install && cd ..

# Link vector icons (required)
# Android: Already in android/app/build.gradle
# iOS: pod install handles it

# Android: Add fonts to android/app/build.gradle
# Add: apply from: "../../node_modules/react-native-vector-icons/fonts.gradle"
```

## Run the App

```bash
# Start Metro bundler
npm start

# Run on Android
npm run android

# Run on iOS (Mac only)
npm run ios
```

## Android Permissions (add to AndroidManifest.xml)

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.CAMERA" />
```

## Building Release APK

```bash
cd android
./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```

## Building Release iOS IPA

```bash
# Open Xcode
open ios/CricZodiac.xcworkspace
# Product → Archive → Distribute App
```

## Key Files

| File | Purpose |
|------|---------|
| `src/config/api.js` | API base URL — change for production |
| `src/database/DatabaseHelper.js` | SQLite setup |
| `src/services/SyncService.js` | Background sync engine |
| `App.js` | Entry point |
