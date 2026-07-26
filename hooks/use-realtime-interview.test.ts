import { describe, expect, it } from "vitest";
import { userSafeRealtimeError } from "../lib/openai/realtime/error";

describe("userSafeRealtimeError", () => {
  it("does not expose a raw Realtime protocol error to the candidate", () => {
    expect(userSafeRealtimeError("Error committing input audio buffer: buffer too small")).toBe(
      "Voice connection had a problem. Your interview is preserved; retry voice or continue in text mode.",
    );
  });

  it("gives an actionable microphone-permission message", () => {
    expect(userSafeRealtimeError("NotAllowedError: microphone permission denied")).toContain("microphone");
  });
});
