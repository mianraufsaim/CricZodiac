package com.criczodiac

import android.view.WindowManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class KeepScreenAwakeModule(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "KeepScreenAwake"

  @ReactMethod
  fun enable() {
    val activity = reactApplicationContext.currentActivity ?: return
    activity.runOnUiThread {
      activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }
  }

  @ReactMethod
  fun disable() {
    val activity = reactApplicationContext.currentActivity ?: return
    activity.runOnUiThread {
      activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }
  }
}
