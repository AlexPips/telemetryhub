'use client';

import { useEffect, useRef, useState } from 'react';
import { Drawer } from 'vaul';
import { Button } from '@/components/ui/button';

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

  const optBase = 'flex items-center gap-2 px-3.5 py-2.5 text-sm text-foreground bg-transparent border-none rounded-md cursor-pointer text-left w-full min-h-0 hover:bg-accent';
  const optSelected = ' bg-primary/10 text-primary font-semibold';

  return (
    <div className="relative inline-block">
      <Button
        variant="outline"
        onClick={handleTriggerClick}
        aria-expanded={open || drawerOpen}
        className="min-w-[120px] justify-between font-medium"
      >
        <span className="text-foreground">{currentLabel}</span>
      </Button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute top-full left-0 min-w-[180px] bg-popover border border-border rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.4)] z-50 flex flex-col overflow-hidden max-md:!hidden"
          role="dialog"
          aria-label="Select time range"
        >
          <div className="flex flex-col p-1">
            {OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={optBase + (opt.value === value ? optSelected : '')}
                onClick={() => select(opt.value)}
              >
                <span className="flex-1">{opt.label}</span>
                {opt.value === value && (
                  <span className="text-sm text-primary font-bold">&#10003;</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <Drawer.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="bg-black/60 fixed inset-0 z-[80] md:hidden" />
          <Drawer.Content className="bg-card rounded-t-2xl fixed bottom-0 left-0 right-0 max-h-[85vh] z-[90] flex flex-col pb-[env(safe-area-inset-bottom,16px)] md:hidden">
            <Drawer.Handle />
            <div className="px-5 pt-4 pb-2 text-center">
              <Drawer.Title asChild>
                <h3 className="text-lg font-semibold text-foreground">Time Range</h3>
              </Drawer.Title>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2">
              {OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`px-4 py-3.5 text-base rounded-xl w-full text-left flex items-center gap-2 ${optBase} ${opt.value === value ? 'bg-primary/12 text-primary font-semibold' : ''}`}
                  onClick={() => select(opt.value)}
                >
                  <span className="flex-1">{opt.label}</span>
                  {opt.value === value && (
                    <span className="text-sm text-primary font-bold">&#10003;</span>
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