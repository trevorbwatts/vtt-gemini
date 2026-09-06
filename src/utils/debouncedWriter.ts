/**
 * A trailing debounce with a ceiling on how long a write can be deferred.
 *
 * Built for campaign autosave. Saving is expensive (re-serialising every
 * scenario and rewriting the whole saved-campaigns array) while the state it
 * saves can change 20x a second — every frame a player drags a token across
 * the table. Writing on each change wasted nearly all of that work.
 *
 * A plain debounce would fix the waste and introduce a worse problem: during a
 * long unbroken drag the quiet gap never arrives, so nothing is ever written.
 * `maxWaitMs` puts a ceiling on that — once the oldest unwritten change
 * reaches it, the next schedule() writes rather than deferring again. So the
 * most that can be lost to a crash is one maxWait window.
 */
export interface DebouncedWriter<T> {
  /** Record a new value and (re)arm the timer. */
  schedule(value: T): void;
  /** Write any pending value immediately. Safe to call when nothing is pending. */
  flush(): void;
  /** Drop any pending value without writing it. */
  cancel(): void;
  /** True while a value is waiting to be written. */
  hasPending(): boolean;
}

export interface DebouncedWriterOptions<T> {
  /** Quiet period after the last change before writing. */
  debounceMs: number;
  /** Longest the oldest unwritten change may wait. */
  maxWaitMs: number;
  /**
   * Whether a newly scheduled value targets the same destination as the
   * pending one. When it doesn't, the pending value is flushed first instead
   * of being replaced — otherwise switching campaigns mid-window would
   * silently discard the previous campaign's last edits.
   */
  sameTarget?: (pending: T, next: T) => boolean;
  /** Injectable for tests. Defaults to Date.now. */
  now?: () => number;
}

export function createDebouncedWriter<T>(
  write: (value: T) => void,
  { debounceMs, maxWaitMs, sameTarget, now = Date.now }: DebouncedWriterOptions<T>,
): DebouncedWriter<T> {
  let pending: T | null = null;
  let hasValue = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let oldestAt = 0;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const take = (): { value: T } | null => {
    if (!hasValue) return null;
    const value = pending as T;
    pending = null;
    hasValue = false;
    oldestAt = 0;
    return { value };
  };

  const flush = () => {
    clearTimer();
    const taken = take();
    if (taken) write(taken.value);
  };

  return {
    schedule(value: T) {
      if (hasValue && sameTarget && !sameTarget(pending as T, value)) {
        // Different destination — commit what's waiting before starting over.
        flush();
      }

      if (!hasValue) oldestAt = now();
      pending = value;
      hasValue = true;

      const waited = now() - oldestAt;
      if (waited >= maxWaitMs) {
        // Held long enough; stop deferring.
        flush();
        return;
      }

      clearTimer();
      const delay = Math.min(debounceMs, Math.max(0, maxWaitMs - waited));
      timer = setTimeout(() => {
        timer = null;
        const taken = take();
        if (taken) write(taken.value);
      }, delay);
    },
    flush,
    cancel() {
      clearTimer();
      take();
    },
    hasPending() {
      return hasValue;
    },
  };
}
