import { useCallback, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

/** Max undo steps kept. Snapshots are shared object references (state updates
 *  are immutable), so this costs almost no memory. */
const MAX_HISTORY = 50;

/** Changes landing within this window of the previous change merge into the
 *  same undo step, so one gesture that commits several writes (a drag end
 *  syncing tokens + combatants) undoes as one action. */
const BURST_GAP_MS = 200;

/** Hard cap on how much time a single undo step can absorb. Without this,
 *  a chain of quick-but-distinct actions (or a long paint stroke) would merge
 *  into one giant step and Ctrl+Z would jump way too far back. */
const MAX_STEP_MS = 500;

export interface UndoHistory {
  undo: () => boolean;
  redo: () => boolean;
  clear: () => void;
}

/**
 * Drop-in useState replacement that keeps an undo/redo history of the value.
 * Returns the same [state, setState] pair plus undo/redo/clear controls —
 * existing setState call sites (including functional updaters) keep working
 * unchanged, and every change they make becomes undoable.
 */
export function useUndoableState<T>(
  initialValue: T | (() => T)
): [T, Dispatch<SetStateAction<T>>, UndoHistory] {
  const [state, setState] = useState<T>(initialValue);
  const undoStack = useRef<T[]>([]);
  const redoStack = useRef<T[]>([]);
  const lastChangeTime = useRef(0);
  const stepStartTime = useRef(0);

  const set = useCallback((action: SetStateAction<T>) => {
    setState(prev => {
      const next = typeof action === 'function' ? (action as (p: T) => T)(prev) : action;
      if (next === prev) return prev;
      const stack = undoStack.current;
      const now = Date.now();
      const withinBurst = now - lastChangeTime.current < BURST_GAP_MS;
      const stepMaxedOut = now - stepStartTime.current >= MAX_STEP_MS;
      // Record a new step unless this change is part of the current burst and
      // the step hasn't hit its time cap. The top-of-stack check keeps this
      // idempotent when React StrictMode re-runs the updater.
      if (
        (stack.length === 0 || !withinBurst || stepMaxedOut) &&
        stack[stack.length - 1] !== prev
      ) {
        stack.push(prev);
        if (stack.length > MAX_HISTORY) stack.shift();
        stepStartTime.current = now;
      }
      lastChangeTime.current = now;
      if (redoStack.current.length > 0) redoStack.current = [];
      return next;
    });
  }, []);

  const undo = useCallback((): boolean => {
    const stack = undoStack.current;
    if (stack.length === 0) return false;
    const target = stack[stack.length - 1];
    setState(current => {
      if (current === target) return current;
      // Pop exactly once even if StrictMode re-runs this updater.
      if (stack[stack.length - 1] === target) {
        stack.pop();
        redoStack.current.push(current);
        if (redoStack.current.length > MAX_HISTORY) redoStack.current.shift();
        // Next recorded change starts a fresh step rather than coalescing.
        lastChangeTime.current = 0;
        stepStartTime.current = 0;
      }
      return target;
    });
    return true;
  }, []);

  const redo = useCallback((): boolean => {
    const stack = redoStack.current;
    if (stack.length === 0) return false;
    const target = stack[stack.length - 1];
    setState(current => {
      if (current === target) return current;
      if (stack[stack.length - 1] === target) {
        stack.pop();
        undoStack.current.push(current);
        if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
        lastChangeTime.current = 0;
        stepStartTime.current = 0;
      }
      return target;
    });
    return true;
  }, []);

  const clear = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    lastChangeTime.current = 0;
    stepStartTime.current = 0;
  }, []);

  const history = useMemo<UndoHistory>(() => ({ undo, redo, clear }), [undo, redo, clear]);

  return [state, set, history];
}
