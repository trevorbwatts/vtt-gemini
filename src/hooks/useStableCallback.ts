import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Returns a callback whose identity never changes but which always runs the
 * latest closure it was given.
 *
 * Memoized layer subtrees in MapView only stay memoized if every value in
 * their dependency array is stable. Plain inline handlers get a new identity
 * on every render, so listing one as a dependency defeats the memo entirely —
 * and leaving it out captures a stale closure. This gives both: a constant
 * identity that is safe to depend on, reading current props/state at call time.
 *
 * Only safe for event handlers and other callbacks invoked after commit —
 * never call the returned function during render.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useStableCallback<T extends (...args: any[]) => any>(fn: T): T {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback(((...args: Parameters<T>) => ref.current(...args)) as T, []);
}
