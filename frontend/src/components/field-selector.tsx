'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Drawer } from 'vaul';

const COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

export type FieldLabel = {
  field: string;
  displayName?: string;
  unit?: string;
  chartGroup?: string;
};

export type FieldSelectorProps = {
  fields: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  labelFor?: (field: string) => FieldLabel;
};

export function FieldSelector({ fields, selected, onChange, labelFor }: FieldSelectorProps) {
  const [open, setOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
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

  const groupedFields = useMemo(() => {
    const groups: { groupName: string; fields: string[] }[] = [];
    const uncategorized: string[] = [];
    const seen = new Set<string>();

    for (const field of filteredFields) {
      const label = labelFor?.(field);
      const group = label?.chartGroup?.trim();
      if (group) {
        let existing = groups.find((g) => g.groupName === group);
        if (!existing) {
          existing = { groupName: group, fields: [] };
          groups.push(existing);
        }
        existing.fields.push(field);
        seen.add(field);
      }
    }

    groups.sort((a, b) => a.groupName.localeCompare(b.groupName));

    for (const field of filteredFields) {
      if (!seen.has(field)) {
        uncategorized.push(field);
      }
    }

    return { groups, uncategorized };
  }, [filteredFields, labelFor]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleCollapse = useCallback((group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  const handleGroupHeaderClick = useCallback(
    (groupName: string, fields: string[]) => {
      const groupFieldsSet = new Set(fields);
      const anySelected = fields.some((f) => selected.includes(f));
      if (anySelected) {
        onChange(selected.filter((f) => !groupFieldsSet.has(f)));
      } else {
        const toAdd = fields.filter((f) => !selected.includes(f));
        onChange([...selected, ...toAdd]);
      }
      toggleCollapse(groupName);
    },
    [selected, onChange, toggleCollapse]
  );

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

  const renderFieldOption = useCallback(
    (f: string, i: number) => {
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
    },
    [selectedSet, toggle, labelOf]
  );

  function handleTriggerClick() {
    const mobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
    if (mobile) {
      setDrawerOpen(true);
    } else {
      setOpen((v) => !v);
    }
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setSearch('');
  }

  const total = fields.length;
  const count = selected.length;

  function renderFieldList() {
    if (filteredFields.length === 0) {
      return <div className="field-selector-empty">No fields match "{search}"</div>;
    }
    if (search.trim()) {
      return filteredFields.map((f, i) => renderFieldOption(f, i));
    }
    return (
      <>
        {groupedFields.groups.map((group) => {
          const collapsed = collapsedGroups.has(group.groupName);
          return (
            <div key={group.groupName}>
              <button
                type="button"
                className="field-selector-group-header"
                onClick={() => handleGroupHeaderClick(group.groupName, group.fields)}
              >
                <span className="field-selector-group-chevron">
                  {collapsed ? '▸' : '▾'}
                </span>
                <span className="field-selector-group-name">{group.groupName}</span>
                <span className="field-selector-group-count">{group.fields.length}</span>
              </button>
              {!collapsed && group.fields.map((f) => renderFieldOption(f, fields.indexOf(f)))}
            </div>
          );
        })}
        {groupedFields.uncategorized.length > 0 && (
          <div>
            <div className="field-selector-group-header field-selector-group-other">
              <span className="field-selector-group-chevron">▾</span>
              <span className="field-selector-group-name">Other</span>
              <span className="field-selector-group-count">{groupedFields.uncategorized.length}</span>
            </div>
            {groupedFields.uncategorized.map((f) => renderFieldOption(f, fields.indexOf(f)))}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="field-selector">
      <button
        ref={triggerRef}
        type="button"
        className="field-selector-trigger"
        onClick={handleTriggerClick}
        aria-expanded={open || drawerOpen}
      >
        <span>Fields</span>
        <span className="field-selector-count">{count}/{total}</span>
        <span className="field-selector-chevron">{open || drawerOpen ? '▲' : '▼'}</span>
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
            {renderFieldList()}
          </div>
        </div>
      )}

      <Drawer.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="field-drawer-overlay" />
          <Drawer.Content className="field-drawer-content">
            <Drawer.Handle />
            <div className="field-drawer-header">
              <Drawer.Title asChild>
                <h3>Select Fields</h3>
              </Drawer.Title>
            </div>

            <div className="field-drawer-search-row">
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

            <div className="field-drawer-list">
              {renderFieldList()}
            </div>

            <div className="field-drawer-footer">
              <button
                className="primary"
                style={{ width: '100%', minHeight: '48px' }}
                onClick={closeDrawer}
              >
                Done ({count} selected)
              </button>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
}
