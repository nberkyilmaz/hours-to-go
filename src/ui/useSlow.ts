import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';

/**
 * True once `busy` has lasted 4 seconds: long enough that the server is probably waking (the
 * free plan sleeps), and the pilot should be told rather than left looking at "One moment…".
 */
export function useSlow(busy: boolean): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!busy) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(timer);
  }, [busy]);
  return slow;
}

/**
 * Starts a sleeping server waking, once: for a form's first focus, so the server is up by the
 * time the pilot has typed. Not on sight: a visitor who only looks shouldn't wake it.
 */
export function useWake(): () => void {
  const woken = useRef(false);
  return useCallback(() => {
    if (woken.current) return;
    woken.current = true;
    api.health().catch(() => {});
  }, []);
}
