'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Drawer } from 'vaul';
import { Button } from '@/components/ui/button';

export type FieldLabel = {
  field: string;
  displayName?: string;
  unit?: string;
  chartGroup?: string;
  subGroup?: string;
  groupDescription?: string;
  subGroupDescription?: string;
  groupSortOrder?: number;
  subGroupSortOrder?: number;
};

export type FieldSelectorProps = {
  fields: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  labelFor?: (field: string) => FieldLabel;
};

const popoverClasses =
  'absolute top-full left-0 w-[min(85vw,400px)] max-h-[75vh] bg-popover border border-border rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.4)] z-50 flex flex-col overflow-hidden max-md:!hidden';
const searchClasses =
  'w-full bg-background text-foreground border border-input rounded-md px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring';
const actionBtnClasses =
  'bg-transparent text-primary px-1 py-0.5 text-xs font-medium rounded hover:bg-secondary hover:underline';
const optClasses =
  'flex items-center gap-2.5 px-3.5 py-[7px] cursor-pointer text-xs transition-colors duration-100 w-full min-w-0 box-border hover:bg-accent rounded-md';
const optCheckedClasses = ' bg-primary/10';

type GroupEntry = {
  name: string;
  fields: string[];
  sortOrder: number;
  description?: string;
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

  const groups = useMemo(() => {
    const map = new Map<string, GroupEntry>();
    const uncategorized: string[] = [];

    for (const field of fields) {
      const label = labelFor?.(field);
      const group = label?.chartGroup?.trim();
      if (group) {
        let entry = map.get(group);
        if (!entry) {
          entry = { name: group, fields: [], sortOrder: label?.groupSortOrder ?? 0, description: label?.groupDescription };
          map.set(group, entry);
        }
        entry.fields.push(field);
      } else {
        uncategorized.push(field);
      }
    }

    const sorted = Array.from(map.values())
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

    return { sorted, uncategorized };
  }, [fields, labelFor]);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups.sorted;
    const q = search.toLowerCase();
    return groups.sorted.filter((g) =>
      g.name.toLowerCase().includes(q) ||
      g.description?.toLowerCase().includes(q) ||
      g.fields.some((f) => labelFor?.(f).displayName?.toLowerCase().includes(q))
    );
  }, [groups.sorted, search, labelFor]);

  const toggleGroup = useCallback(
    (groupFields: string[]) => {
      const groupSet = new Set(groupFields);
      const anySelected = groupFields.some((f) => selectedSet.has(f));
      if (anySelected) {
        onChange(selected.filter((f) => !groupSet.has(f)));
      } else {
        const toAdd = groupFields.filter((f) => !selectedSet.has(f));
        onChange([...selected, ...toAdd]);
      }
    },
    [selected, selectedSet, onChange]
  );

  function selectAll() { onChange(groups.sorted.flatMap(g => g.fields)); }
  function clearAll() { onChange([]); }

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

  const totalGroups = groups.sorted.length;
  const selectedGroups = groups.sorted.filter((g) => g.fields.some((f) => selectedSet.has(f))).length;

  function renderGroupOption(entry: GroupEntry) {
    const allSelected = entry.fields.every((f) => selectedSet.has(f));
    const someSelected = entry.fields.some((f) => selectedSet.has(f));
    return (
      <label
        key={entry.name}
        className={optClasses + (someSelected ? optCheckedClasses : '')}
      >
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
          onChange={() => toggleGroup(entry.fields)}
          className="m-0 cursor-pointer accent-primary"
        />
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-foreground font-semibold text-xs truncate">{entry.name}</span>
          {entry.description && (
            <span className="text-muted-foreground text-[10px] truncate">{entry.description}</span>
          )}
        </div>
        <span className="text-muted-foreground text-[11px] shrink-0">{entry.fields.length}</span>
      </label>
    );
  }

  function renderList() {
    const hasNoResults = filteredGroups.length === 0;
    if (hasNoResults) {
      return <div className="p-6 text-center text-muted-foreground text-xs">No groups match &quot;{search}&quot;</div>;
    }
    return (
      <>
        {filteredGroups.map((g) => renderGroupOption(g))}
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
        <span className="text-foreground">Groups</span>
        <span className="text-xs font-semibold bg-primary text-primary-foreground px-[7px] py-[1px] rounded-full ml-1 leading-[1.5]">{selectedGroups}/{totalGroups}</span>
      </Button>

      {open && (
        <div ref={popoverRef} className={popoverClasses} role="dialog" aria-label="Select groups">
          <div className="px-3 pt-3 pb-2 border-b border-border">
            <input
              type="text"
              className={searchClasses}
              placeholder="Search groups…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex items-center gap-2 px-3.5 py-2 text-xs border-b border-border bg-muted">
            <button type="button" className={actionBtnClasses} onClick={selectAll}>All</button>
            <span className="text-border text-xs">·</span>
            <button type="button" className={actionBtnClasses} onClick={clearAll}>None</button>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden p-1 pb-2 flex flex-col gap-0.5">
            {renderList()}
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
                <h3 className="text-lg font-semibold text-foreground">Select Groups</h3>
              </Drawer.Title>
            </div>

            <div className="px-4 py-2">
              <input
                type="text"
                className={searchClasses}
                placeholder="Search groups…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>

            <div className="flex items-center gap-2 px-3.5 py-2 text-xs border-b border-border bg-muted">
              <button type="button" className={actionBtnClasses} onClick={selectAll}>All</button>
              <span className="text-border text-xs">·</span>
              <button type="button" className={actionBtnClasses} onClick={clearAll}>None</button>
            </div>

            <div className="flex-1 overflow-y-auto py-1 pb-2 px-1 flex flex-col gap-0.5">
              {renderList()}
            </div>

            <div className="px-4 pb-4 pt-2 border-t border-border">
              <Button
                className="w-full h-12"
                onClick={closeDrawer}
              >
                Done ({selectedGroups} selected)
              </Button>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
}
