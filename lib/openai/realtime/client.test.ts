import { describe, expect, it, vi } from "vitest";
import { RealtimeInterviewClient } from "./client";

describe("RealtimeInterviewClient", () => {
  it("never commits a media-track audio buffer or creates a response from Finish answer", () => {
    const client = new RealtimeInterviewClient(() => undefined, () => undefined);
    const send = vi.fn();
    (client as unknown as { channel: { send: (message: string) => void } }).channel = { send };

    expect(client.doneAnswering()).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});
