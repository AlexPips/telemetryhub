'use client';

import { useEffect, useRef, useState } from 'react';
import { Drawer } from 'vaul';

const OPTIONS = [
  { value: '1h', label: '1 Hour' },
  { value: '6h', label: '6 Hours' },
  { value: '24h', label: '24 Hours' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
] as const;

export function TimeRangeSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  function handleTriggerClick() {
    const mobile =
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 767px)').matches;
    if (mobile) {
      setDrawerOpen(true);
    } else {
      setOpen((v) => !v);
    }
  }

  function select(val: string) {
    onChange(val);
    setOpen(false);
    setDrawerOpen(false);
  }

  const currentLabel =
    OPTIONS.find((o) => o.value === value)?.label ?? value;

  return (
    <div className="time-range-selector">
      <button
        ref={triggerRef}
        type="button"
        className="time-range-trigger"
        onClick={handleTriggerClick}
        aria-expanded={open || drawerOpen}
      >
        <span>{currentLabel}</span>
        <span className="time-range-chevron">
          {open || drawerOpen ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="time-range-popover"
          role="dialog"
          aria-label="Select time range"
        >
          <div className="time-range-list">
            {OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={
                  'time-range-option' +
                  (opt.value === value ? ' selected' : '')
                }
                onClick={() => select(opt.value)}
              >
                <span className="time-range-option-label">{opt.label}</span>
                {opt.value === value && (
                  <span className="time-range-checkmark">&#10003;</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <Drawer.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="time-drawer-overlay" />
          <Drawer.Content className="time-drawer-content">
            <Drawer.Handle />
            <div className="time-drawer-header">
              <Drawer.Title asChild>
                <h3>Time Range</h3>
              </Drawer.Title>
            </div>
            <div className="time-drawer-list">
              {OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={
                    'time-range-option' +
                    (opt.value === value ? ' selected' : '')
                  }
                  onClick={() => select(opt.value)}
                >
                  <span className="time-range-option-label">{opt.label}</span>
                  {opt.value === value && (
                    <span className="time-range-checkmark">&#10003;</span>
                  )}
                </button>
              ))}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
}
