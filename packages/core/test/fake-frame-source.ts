import type { FrameSource } from "../src/scheduler";

export function createFakeSource() {
  let nextHandle = 1;
  let requests = 0;
  let cancels = 0;
  const queue = new Map<number, (timestamp: number) => void>();
  const source: FrameSource = {
    request(callback) {
      const handle = nextHandle++;
      queue.set(handle, callback);
      requests++;
      return handle;
    },
    cancel(handle) {
      cancels++;
      queue.delete(handle);
    },
  };
  return {
    source,
    get pending() {
      return queue.size;
    },
    get requests() {
      return requests;
    },
    get cancels() {
      return cancels;
    },
    flush(timestamp: number) {
      const callbacks = [...queue.values()];
      queue.clear();
      for (const callback of callbacks) callback(timestamp);
    },
  };
}
