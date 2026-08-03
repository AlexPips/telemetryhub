'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { Calendar as CalendarIcon, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

interface TimeDropdownProps {
  value: number;
  options: number[];
  onSelect: (value: number) => void;
  ariaLabel: string;
}

/**
 * Custom dropdown for hour/minute selection. Native `<select>` popups are
 * OS-rendered (square corners, unthemeable), so this renders its own
 * rounded popover list inside the picker instead.
 */
function TimeDropdown({ value, options, onSelect, ariaLabel }: TimeDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
      >
        <span className="tabular-nums">{String(value).padStart(2, '0')}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 right-0 z-10 mb-1.5 max-h-48 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          <div className="max-h-48 overflow-y-auto p-1 [scrollbar-width:thin]">
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  onSelect(opt);
                  setOpen(false);
                }}
                className={
                  'block w-full rounded-md px-2 py-1 text-left text-xs tabular-nums transition-colors cursor-pointer ' +
                  (opt === value
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-popover-foreground hover:bg-muted')
                }
              >
                {String(opt).padStart(2, '0')}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface DateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  'aria-label'?: string;
}

/**
 * Theme-aware date + time picker replacing the unstylable native
 * `<input type="datetime-local">` popup. The calendar renders in a portal
 * because the settings dialog clips overflow. Value format matches the native
 * input: "YYYY-MM-DDTHH:mm" in local time.
 */
export function DateTimePicker({ value, onChange, placeholder, 'aria-label': ariaLabel }: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => (value ? parseLocal(value) : new Date()));
  const [time, setTime] = useState(() => extractTime(value));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // Parse "YYYY-MM-DDTHH:mm" (local) into a Date without UTC shifting.
  function parseLocal(v: string): Date {
    const [datePart, timePart = '00:00'] = v.split('T');
    const [y, m, d] = datePart.split('-').map(Number);
    const [hh, mm] = timePart.split(':').map(Number);
    return new Date(y, m - 1, d, hh || 0, mm || 0);
  }

  function extractTime(v: string): { hour: number; minute: number } {
    if (!v) return { hour: 0, minute: 0 };
    const timePart = v.includes('T') ? v.split('T')[1] : '00:00';
    const [hh, mm] = timePart.split(':').map(Number);
    return { hour: hh || 0, minute: mm || 0 };
  }

  const emit = useCallback(
    (date: Date, t: { hour: number; minute: number }) => {
      const local = new Date(date.getFullYear(), date.getMonth(), date.getDate(), t.hour, t.minute);
      const pad = (n: number) => String(n).padStart(2, '0');
      onChange(
        `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(t.hour)}:${pad(t.minute)}`
      );
    },
    [onChange]
  );

  const openPopover = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, left: 0, width: 288 });
    setOpen(true);
  }, []);

  // Position the popover, flipping above the trigger when it would
  // overflow the viewport bottom (common when the modal scrolls the
  // trigger near the fold).
  useLayoutEffect(() => {
    if (!open || !pos || !popoverRef.current) return;
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const popup = popoverRef.current.getBoundingClientRect();
    const width = 288;
    const left = Math.min(rect.left, Math.max(8, window.innerWidth - width - 8));
    const gap = 6;
    let top = rect.bottom + gap;
    if (top + popup.height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - popup.height - gap);
    }
    setPos((prev) => (prev && prev.top === top && prev.left === left ? prev : { top, left, width }));
  }, [open, pos]);

  // Close on outside click, Escape, scroll, or resize.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (
        popoverRef.current?.contains(e.target as Node) ||
        triggerRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onReposition = () => {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const width = 288;
      const left = Math.min(rect.left, Math.max(8, window.innerWidth - width - 8));
      setPos({ top: rect.bottom + 6, left, width });
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [open]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [viewMonth]);

  const selectedDate = useMemo(
    () => (value ? parseLocal(value) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value]
  );

  const weekdayHeaders = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  const selectDay = (day: Date) => {
    setViewMonth(day);
    emit(day, time);
  };

  const selectHour = (h: number) => {
    const next = { ...time, hour: h };
    setTime(next);
    if (selectedDate) emit(selectedDate, next);
  };

  const selectMinute = (m: number) => {
    const next = { ...time, minute: m };
    setTime(next);
    if (selectedDate) emit(selectedDate, next);
  };

  const hourOptions = Array.from({ length: 24 }, (_, i) => i);
  const minuteOptions = Array.from({ length: 60 }, (_, i) => i);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        onClick={openPopover}
        className="flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 text-left cursor-pointer"
      >
        <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className={value ? 'truncate' : 'text-muted-foreground'}>
          {value
            ? format(parseLocal(value), 'yyyy-MM-dd HH:mm')
            : (placeholder ?? 'Select date & time')}
        </span>
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label={ariaLabel}
            style={{ top: pos.top, left: pos.left, width: pos.width }}
            className="fixed z-[100] rounded-lg border border-border bg-popover text-popover-foreground shadow-lg p-3 space-y-3"
          >
            {/* Month nav */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => setViewMonth((m) => subMonths(m, 1))}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-medium text-foreground">
                {format(viewMonth, 'MMMM yyyy')}
              </span>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => setViewMonth((m) => addMonths(m, 1))}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Weekday header */}
            <div className="grid grid-cols-7 gap-1">
              {weekdayHeaders.map((d) => (
                <span
                  key={d}
                  className="text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {d}
                </span>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-1">
              {days.map((day) => {
                const inMonth = isSameMonth(day, viewMonth);
                const selected = selectedDate != null && isSameDay(day, selectedDate);
                const today = isToday(day);
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => selectDay(day)}
                    className={
                      'flex h-8 w-8 items-center justify-center rounded-md text-xs transition-colors cursor-pointer ' +
                      (selected
                        ? 'bg-primary text-primary-foreground font-medium'
                        : today
                          ? 'bg-muted text-foreground font-medium'
                          : inMonth
                            ? 'text-foreground hover:bg-muted'
                            : 'text-muted-foreground/40 hover:bg-muted/50')
                    }
                  >
                    {format(day, 'd')}
                  </button>
                );
              })}
            </div>

            {/* Time selects */}
            <div className="flex items-center gap-2 border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">Time</span>
              <TimeDropdown
                ariaLabel="Hour"
                value={time.hour}
                options={hourOptions}
                onSelect={selectHour}
              />
              <span className="text-xs text-muted-foreground">:</span>
              <TimeDropdown
                ariaLabel="Minute"
                value={time.minute}
                options={minuteOptions}
                onSelect={selectMinute}
              />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
