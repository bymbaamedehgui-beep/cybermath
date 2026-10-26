import { useEffect, useState } from 'react';

/** Re-renders every `interval` ms with the game clock's time while `active`. */
export function useNow(getNow: () => number, active: boolean, interval = 100): number {
  const [now, setNow] = useState(() => getNow());
  useEffect(() => {
    if (!active) return;
    setNow(getNow());
    const id = setInterval(() => setNow(getNow()), interval);
    return () => clearInterval(id);
  }, [active, interval, getNow]);
  return active ? now : getNow();
}
