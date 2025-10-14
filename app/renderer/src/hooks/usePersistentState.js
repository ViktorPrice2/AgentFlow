import { useEffect, useRef, useState } from 'react';

const isBrowser = typeof window !== 'undefined';

export function usePersistentState(key, defaultValue) {
  const initializedRef = useRef(false);
  const [value, setValue] = useState(() => {
    if (!isBrowser) {
      return defaultValue;
    }

    try {
      const stored = window.localStorage.getItem(key);

      if (stored !== null) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.warn(`Failed to read localStorage key ${key}`, error);
    }

    return defaultValue;
  });

  useEffect(() => {
    if (!isBrowser) {
      return;
    }

    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }

    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`Failed to persist state for key ${key}`, error);
    }
  }, [key, value]);

  return [value, setValue];
}
