package com.criczodiac

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule

class AppInfoModule(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "AppInfo"

  override fun getConstants(): Map<String, Any> = mapOf(
    "versionName" to BuildConfig.VERSION_NAME,
    "versionCode" to BuildConfig.VERSION_CODE
  )
}
