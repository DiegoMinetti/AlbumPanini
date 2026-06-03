/**
 * Lightweight haptic feedback helper. Uses the Vibration API where supported
 * and silently no-ops elsewhere. Respects a runtime enable flag.
 */
let enabled = true;

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

function vibrate(pattern: number | number[]): void {
  if (!enabled) return;
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* ignore unsupported */
    }
  }
}

export const haptics = {
  light: () => vibrate(10),
  medium: () => vibrate(20),
  success: () => vibrate([15, 40, 15]),
  warning: () => vibrate([30, 50, 30]),
  error: () => vibrate([50, 60, 50]),
};
