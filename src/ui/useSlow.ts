import { useEffect, useState } from 'react';

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
