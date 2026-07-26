export function userSafeRealtimeError(message: string) {
  if (message.toLowerCase().includes("audio playback")) return "Audio playback was blocked. Interact with the page, then retry voice.";
  if (message.toLowerCase().includes("microphone") || message.toLowerCase().includes("permission")) return "We could not access your microphone. Check browser permissions and try again.";
  return "Voice connection had a problem. Your interview is preserved; retry voice or continue in text mode.";
}
