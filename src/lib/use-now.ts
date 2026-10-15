import { useEffect, useState } from "react";

/**
 * The current time in milliseconds. It changes after each interval, so a time gate
 * (for example "the session ended") opens without a page reload.
 */
export const useNow = (intervalMs: number) => {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, intervalMs);
    return () => {
      clearInterval(timer);
    };
  }, [intervalMs]);
  return now;
};
