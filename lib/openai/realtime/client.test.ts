import { describe, expect, it, vi } from "vitest";
import { RealtimeInterviewClient } from "./client";

describe("RealtimeInterviewClient", () => {
  it("never commits a media-track audio buffer", () => {
    // Server VAD owns turn finalization over WebRTC media tracks. A client-side
    // input_audio_buffer.commit would target an empty manually-appended buffer
    // and can produce a duplicate response.
    const client = new RealtimeInterviewClient(() => undefined, () => undefined);
    const send = vi.fn();
    (client as unknown as { channel: { send: (message: string) => void } }).channel = { send };

    client.interrupt();

    const sent = send.mock.calls.map(([message]) => JSON.parse(message).type);
    expect(sent).toEqual(["response.cancel", "output_audio_buffer.clear"]);
    expect(sent).not.toContain("input_audio_buffer.commit");
    expect(sent).not.toContain("response.create");
  });
});
