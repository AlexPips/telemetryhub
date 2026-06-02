'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const WRITE_DEBOUNCE_MS = 200;

export function useLocalStorage<T>(key: string, initial: T): [T, (next: T) => void, boolean] {
  const [value, setValueState] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialRef = useRef(initial);

  useEffect(() => {
    setHydrated(false);
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        setValueState(JSON.parse(raw) as T);
      }
    } catch (err) {
      console.warn(`[useLocalStorage] failed to parse "${key}":`, err);
    }
    setHydrated(true);

    function onStorage(e: StorageEvent) {
      if (e.storageArea !== window.localStorage) return;
      if (e.key !== key) return;
      if (e.newValue === null) {
        setValueState(initialRef.current);
        return;
      }
      try {
        setValueState(JSON.parse(e.newValue) as T);
      } catch (err) {
        console.warn(`[useLocalStorage] storage event parse failed for "${key}":`, err);
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key]);

  const setValue = useCallback(
    (next: T) => {
      setValueState(next);
      if (typeof window === 'undefined') return;
      if (writeTimer.current) clearTimeout(writeTimer.current);
      writeTimer.current = setTimeout(() => {
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch (err) {
          console.warn(`[useLocalStorage] failed to write "${key}":`, err);
        }
      }, WRITE_DEBOUNCE_MS);
    },
    [key]
  );

  useEffect(() => {
    return () => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
    };
  }, []);

  return [value, setValue, hydrated];
}
