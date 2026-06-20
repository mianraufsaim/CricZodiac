package com.criczodiac;

import android.media.Image;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import com.mrousavy.camera.frameprocessor.Frame;
import com.mrousavy.camera.frameprocessor.FrameProcessorPlugin;
import java.nio.ByteBuffer;
import java.util.HashMap;
import java.util.Map;

/**
 * Lightweight motion detector for the live ball-tracking test screen.
 * It deliberately does not persist camera frames or video.
 */
public class BallTrackerFrameProcessorPlugin extends FrameProcessorPlugin {
  private static final int SAMPLE_STEP = 4;
  private byte[] previousLuma;
  private int previousWidth;
  private int previousHeight;

  @Override
  public @Nullable Object callback(@NonNull Frame frame, @Nullable Map<String, Object> params) {
    Image image = frame.getImage();
    if (image.getPlanes().length == 0) return result(false, "invalid-frame", 0, 0, 0, frame);

    final int width = image.getWidth();
    final int height = image.getHeight();
    final int sampleWidth = Math.max(1, (width + SAMPLE_STEP - 1) / SAMPLE_STEP);
    final int sampleHeight = Math.max(1, (height + SAMPLE_STEP - 1) / SAMPLE_STEP);
    final int sampleCount = sampleWidth * sampleHeight;
    final byte[] currentLuma = new byte[sampleCount];
    final Image.Plane lumaPlane = image.getPlanes()[0];
    final ByteBuffer buffer = lumaPlane.getBuffer().duplicate();
    final int rowStride = lumaPlane.getRowStride();
    final int pixelStride = lumaPlane.getPixelStride();

    for (int sy = 0; sy < sampleHeight; sy++) {
      final int y = Math.min(height - 1, sy * SAMPLE_STEP);
      for (int sx = 0; sx < sampleWidth; sx++) {
        final int x = Math.min(width - 1, sx * SAMPLE_STEP);
        final int offset = y * rowStride + x * pixelStride;
        currentLuma[sy * sampleWidth + sx] = offset < buffer.limit() ? buffer.get(offset) : 0;
      }
    }

    if (previousLuma == null || previousWidth != sampleWidth || previousHeight != sampleHeight) {
      previousLuma = currentLuma;
      previousWidth = sampleWidth;
      previousHeight = sampleHeight;
      return result(false, "warming-up", 0, 0, 0, frame);
    }

    final float roiLeft = option(params, "roiLeft", 0.08f);
    final float roiTop = option(params, "roiTop", 0.04f);
    final float roiRight = option(params, "roiRight", 0.92f);
    final float roiBottom = option(params, "roiBottom", 0.96f);
    final int minMotion = Math.max(8, Math.round(option(params, "minMotion", 18f)));
    final int left = clamp(Math.round(sampleWidth * roiLeft), 0, sampleWidth - 1);
    final int right = clamp(Math.round(sampleWidth * roiRight), left + 1, sampleWidth);
    final int top = clamp(Math.round(sampleHeight * roiTop), 0, sampleHeight - 1);
    final int bottom = clamp(Math.round(sampleHeight * roiBottom), top + 1, sampleHeight);

    long weightedX = 0;
    long weightedY = 0;
    long weightTotal = 0;
    int candidates = 0;
    for (int sy = top; sy < bottom; sy++) {
      for (int sx = left; sx < right; sx++) {
        final int index = sy * sampleWidth + sx;
        final int motion = Math.abs((currentLuma[index] & 0xFF) - (previousLuma[index] & 0xFF));
        if (motion >= minMotion) {
          weightedX += (long) sx * motion;
          weightedY += (long) sy * motion;
          weightTotal += motion;
          candidates++;
        }
      }
    }

    previousLuma = currentLuma;
    if (candidates < 4 || weightTotal == 0) return result(false, "searching", 0, 0, 0, frame);

    final float x = ((float) weightedX / weightTotal + 0.5f) / sampleWidth;
    final float y = ((float) weightedY / weightTotal + 0.5f) / sampleHeight;
    final float confidence = Math.min(1f, candidates / 48f);
    return result(true, "detected", x, y, confidence, frame);
  }

  private static float option(@Nullable Map<String, Object> params, String key, float fallback) {
    if (params == null || !(params.get(key) instanceof Number)) return fallback;
    return ((Number) params.get(key)).floatValue();
  }

  private static int clamp(int value, int min, int max) {
    return Math.max(min, Math.min(max, value));
  }

  private static Map<String, Object> result(boolean detected, String reason, float x, float y, float confidence, Frame frame) {
    Map<String, Object> result = new HashMap<>();
    result.put("detected", detected);
    result.put("reason", reason);
    result.put("x", x);
    result.put("y", y);
    result.put("confidence", confidence);
    try {
      result.put("timestamp", frame.getTimestamp());
      result.put("frameWidth", frame.getWidth());
      result.put("frameHeight", frame.getHeight());
    } catch (Throwable ignored) {
      // VisionCamera can invalidate a frame while the pipeline is shutting down.
      result.put("timestamp", System.currentTimeMillis());
      result.put("frameWidth", 0);
      result.put("frameHeight", 0);
    }
    return result;
  }
}
