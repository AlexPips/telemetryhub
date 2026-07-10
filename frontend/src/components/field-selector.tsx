'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Drawer } from 'vaul';
import { Button } from '@/components/ui/button';

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

const popoverClasses =
  'absolute top-full left-0 w-[min(85vw,720px)] max-h-[75vh] bg-popover border border-border rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.4)] z-50 flex flex-col overflow-hidden max-md:!hidden';
const searchClasses =
  'w-full bg-background text-foreground border border-input rounded-md px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring';
const actionBtnClasses =
  'bg-transparent text-primary px-1 py-0.5 text-xs font-medium rounded hover:bg-secondary hover:underline';
const optClasses =
  'flex items-center gap-2.5 px-3.5 py-[7px] cursor-pointer text-xs transition-colors duration-100 w-full min-w-0 box-border hover:bg-accent';
const optCheckedClasses = ' bg-primary/10';
const groupHeaderClasses =
  'flex items-center gap-1.5 w-full px-3.5 py-1.5 bg-muted text-foreground text-xs font-semibold uppercase tracking-[0.5px] border-none border-t border-border cursor-pointer col-span-full hover:bg-secondary';

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
          className={optClasses + (checked ? optCheckedClasses : '')}
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={() => toggle(f)}
            className="m-0 cursor-pointer accent-primary"
          />
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
          <span className="text-foreground font-semibold text-xs truncate min-w-0">{labelOf(f)}</span>
          <span className="text-muted-foreground text-[11px] font-mono ml-auto truncate max-w-[80px] min-w-0">{f}</span>
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
      return <div className="p-6 text-center text-muted-foreground text-xs col-span-full">No fields match &quot;{search}&quot;</div>;
    }
    if (search.trim()) {
      return filteredFields.map((f, i) => renderFieldOption(f, i));
    }
    return (
      <>
        {groupedFields.groups.map((group) => {
          const collapsed = collapsedGroups.has(group.groupName);
          return (
            <Fragment key={group.groupName}>
              <button
                type="button"
                className={groupHeaderClasses}
                onClick={() => handleGroupHeaderClick(group.groupName, group.fields)}
              >
                <span className="text-[8px] text-muted-foreground">
                  {collapsed ? '▸' : '▾'}
                </span>
                <span className="flex-1 text-left">{group.groupName}</span>
                <span className="text-[11px] text-muted-foreground">{group.fields.length}</span>
              </button>
              {!collapsed && group.fields.map((f) => renderFieldOption(f, fields.indexOf(f)))}
            </Fragment>
          );
        })}
        {groupedFields.uncategorized.length > 0 && (
          <Fragment>
            <div className={`${groupHeaderClasses} opacity-60 cursor-default`}>
              <span className="text-[8px] text-muted-foreground">▾</span>
              <span className="flex-1 text-left">Other</span>
              <span className="text-[11px] text-muted-foreground">{groupedFields.uncategorized.length}</span>
            </div>
            {groupedFields.uncategorized.map((f) => renderFieldOption(f, fields.indexOf(f)))}
          </Fragment>
        )}
      </>
    );
  }

  return (
    <div className="relative inline-block">
      <Button
        variant="outline"
        onClick={handleTriggerClick}
        aria-expanded={open || drawerOpen}
        className="min-w-[140px] justify-between font-medium"
      >
        <span className="text-foreground">Fields</span>
        <span className="text-xs font-semibold bg-primary text-primary-foreground px-[7px] py-[1px] rounded-full ml-1 leading-[1.5]">{count}/{total}</span>
      </Button>

      {open && (
        <div ref={popoverRef} className={popoverClasses} role="dialog" aria-label="Select fields">
          <div className="px-3 pt-3 pb-2 border-b border-border">
            <input
              type="text"
              className={searchClasses}
              placeholder="Search fields…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex items-center gap-2 px-3.5 py-2 text-xs border-b border-border bg-muted">
            <button type="button" className={actionBtnClasses} onClick={selectAll}>All</button>
            <span className="text-border text-xs">·</span>
            <button type="button" className={actionBtnClasses} onClick={clearAll}>None</button>
            <span className="text-border text-xs">·</span>
            <button type="button" className={actionBtnClasses} onClick={selectCommon}>Common</button>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden p-1 pb-2 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] content-start">
            {renderFieldList()}
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
                <h3 className="text-lg font-semibold text-foreground">Select Fields</h3>
              </Drawer.Title>
            </div>

            <div className="px-4 py-2">
              <input
                type="text"
                className={searchClasses}
                placeholder="Search fields…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>

            <div className="flex items-center gap-2 px-3.5 py-2 text-xs border-b border-border bg-muted">
              <button type="button" className={actionBtnClasses} onClick={selectAll}>All</button>
              <span className="text-border text-xs">·</span>
              <button type="button" className={actionBtnClasses} onClick={clearAll}>None</button>
              <span className="text-border text-xs">·</span>
              <button type="button" className={actionBtnClasses} onClick={selectCommon}>Common</button>
            </div>

            <div className="flex-1 overflow-y-auto py-1 pb-2">
              {renderFieldList()}
            </div>

            <div className="px-4 pb-4 pt-2 border-t border-border">
              <Button
                className="w-full h-12"
                onClick={closeDrawer}
              >
                Done ({count} selected)
              </Button>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
}