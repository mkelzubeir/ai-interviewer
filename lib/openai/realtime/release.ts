/** Anything holding a closable realtime client. */
export type ClosableRef<T extends { close(): void }> = { current: T | null };

/**
 * Release a realtime client exactly once.
 *
 * The ref is cleared *before* `close()` runs. Closing emits a "closed"
 * connection-state event, whose handler also releases the client — so closing
 * first and clearing after recurses until the stack overflows, and the thrown
 * RangeError takes out whatever called it (which is how ending an interview
 * stopped producing a report).
 */
export function releaseRealtimeClient<T extends { close(): void }>(ref: ClosableRef<T>) {
  const active = ref.current;
  ref.current = null;
  active?.close();
}
