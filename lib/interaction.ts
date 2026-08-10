/** Small, optional device feedback. Browsers without Vibration API simply no-op. */
export function haptic(pattern: number | number[] = 8): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}
