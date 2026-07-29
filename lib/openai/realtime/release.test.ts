import { describe, expect, it, vi } from "vitest";
import { releaseRealtimeClient, type ClosableRef } from "./release";
import { RealtimeInterviewClient } from "./client";

describe("releasing a realtime client", () => {
  it("closes the client and clears the ref", () => {
    const close = vi.fn();
    const ref: ClosableRef<{ close: () => void }> = { current: { close } };
    releaseRealtimeClient(ref);
    expect(close).toHaveBeenCalledTimes(1);
    expect(ref.current).toBeNull();
  });

  it("tolerates an already-released ref", () => {
    const ref: ClosableRef<{ close: () => void }> = { current: null };
    expect(() => releaseRealtimeClient(ref)).not.toThrow();
  });

  it("does not recurse when closing triggers another release", () => {
    // This is the real shape of the bug: close() emits a "closed" connection
    // state, and the handler for that state releases the client again. Closing
    // before clearing the ref recursed until the stack overflowed, and the
    // RangeError killed the click handler that was meant to build the report.
    const ref: ClosableRef<{ close: () => void }> = { current: null };
    const close = vi.fn(() => releaseRealtimeClient(ref));
    ref.current = { close };

    expect(() => releaseRealtimeClient(ref)).not.toThrow();
    expect(close).toHaveBeenCalledTimes(1);
    expect(ref.current).toBeNull();
  });

  it("still runs the caller's next step after releasing", () => {
    const ref: ClosableRef<{ close: () => void }> = { current: null };
    ref.current = { close: () => releaseRealtimeClient(ref) };
    const onEnd = vi.fn();

    releaseRealtimeClient(ref);
    onEnd();

    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

describe("RealtimeInterviewClient.close", () => {
  it("emits the closed state exactly once however often it is called", () => {
    const onState = vi.fn();
    const client = new RealtimeInterviewClient(() => undefined, onState);

    client.close();
    client.close();
    client.close();

    expect(onState.mock.calls.filter(([state]) => state === "closed")).toHaveLength(1);
  });

  it("does not re-enter when its own state handler closes it again", () => {
    const holder: { client: RealtimeInterviewClient | null } = { client: null };
    const onState = vi.fn((state: string) => {
      if (state === "closed") holder.client?.close();
    });
    holder.client = new RealtimeInterviewClient(() => undefined, onState);

    expect(() => holder.client?.close()).not.toThrow();
    expect(onState).toHaveBeenCalledTimes(1);
  });
});
