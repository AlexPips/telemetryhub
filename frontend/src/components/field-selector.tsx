'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

export type FieldLabel = {
  field: string;
  displayName?: string;
  unit?: string;
};

export type FieldSelectorProps = {
  fields: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  labelFor?: (field: string) => FieldLabel;
};

export function FieldSelector({ fields, selected, onChange, labelFor }: FieldSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
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

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const filteredFields = useMemo(() => {
    if (!search.trim()) return fields;
    const q = search.toLowerCase();
    return fields.filter((f) =>
      f.toLowerCase().includes(q) ||
      labelFor?.(f).displayName?.toLowerCase().includes(q)
    );
  }, [fields, search, labelFor]);

  function toggle(field: string) {
    if (selectedSet.has(field)) {
      onChange(selected.filter((f) => f !== field));
    } else {
      onChange([...selected, field]);
    }
  }

  function selectAll() { onChange([...fields]); }
  function clearAll() { onChange([]); }
  function selectCommon() { onChange(fields.slice(0, 5)); }

  function labelOf(field: string): string {
    const label = labelFor?.(field);
    if (label?.displayName) {
      return label.unit ? `${label.displayName} (${label.unit})` : label.displayName;
    }
    return field;
  }

  const total = fields.length;
  const count = selected.length;

  return (
    <div className="field-selector">
      <button
        ref={triggerRef}
        type="button"
        className="field-selector-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>Fields</span>
        <span className="field-selector-count">{count}/{total}</span>
        <span className="field-selector-chevron">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div ref={popoverRef} className="field-selector-popover" role="dialog" aria-label="Select fields">
          <div className="field-selector-search-row">
            <input
              type="text"
              className="field-selector-search"
              placeholder="Search fields…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          <div className="field-selector-actions">
            <button type="button" className="field-selector-link" onClick={selectAll}>All</button>
            <span className="field-selector-sep">·</span>
            <button type="button" className="field-selector-link" onClick={clearAll}>None</button>
            <span className="field-selector-sep">·</span>
            <button type="button" className="field-selector-link" onClick={selectCommon}>Common</button>
          </div>

          <div className="field-selector-list">
            {filteredFields.length === 0 ? (
              <div className="field-selector-empty">No fields match "{search}"</div>
            ) : (
              filteredFields.map((f, i) => {
                const checked = selectedSet.has(f);
                const color = COLORS[i % COLORS.length];
                return (
                  <label
                    key={f}
                    className={'field-selector-option' + (checked ? ' checked' : '')}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(f)}
                    />
                    <span className="field-selector-option-dot" style={{ background: color }} />
                    <span className="field-selector-option-name">{labelOf(f)}</span>
                    <span className="field-selector-option-raw">{f}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
