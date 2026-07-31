'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs } from '@base-ui/react/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Settings,
  Loader2,
  Trash2,
  Save,
  AlertTriangle,
  Search,
  ChevronUp,
  ChevronDown,
  Plus,
  Download,
} from 'lucide-react';
import {
  updateDevice,
  deleteDevice,
  deleteDeviceField,
  createRename,
  updateRename,
  deleteRename,
  updateGroupConfig,
  updateSubGroupConfig,
  exportDeviceData,
  type Device,
  type FieldRename,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const inputClasses =
  'flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 transition-colors';

interface DeviceSettingsModalProps {
  device: Device;
  deviceId: string;
  fields: string[];
  renames: FieldRename[];
  onDeviceUpdate: (device: Device) => void;
  onDeviceDelete: () => void;
  onRenamesChange: () => void;
  onFieldsChange: () => void;
}

export default function DeviceSettingsModal({
  device,
  deviceId,
  fields,
  renames,
  onDeviceUpdate,
  onDeviceDelete,
  onRenamesChange,
  onFieldsChange,
}: DeviceSettingsModalProps) {
  const [open, setOpen] = useState(false);
  const [deviceName, setDeviceName] = useState(device.name);
  const [isSavingDevice, setIsSavingDevice] = useState(false);
  const [isDeletingDevice, setIsDeletingDevice] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();
  const { isAdmin } = useAuth();

  const handleSaveDevice = async () => {
    setIsSavingDevice(true);
    try {
      await updateDevice(deviceId, { name: deviceName });
      onDeviceUpdate({ ...device, name: deviceName });
    } catch {
      alert('Failed to update device name');
    } finally {
      setIsSavingDevice(false);
    }
  };

  const handleDeleteDevice = async () => {
    if (!confirm(`Delete device ${device.name || deviceId}? This will remove all associated data.`))
      return;
    setIsDeletingDevice(true);
    try {
      await deleteDevice(deviceId);
      onDeviceDelete();
      setOpen(false);
      router.push('/dashboard');
    } catch {
      alert('Failed to delete device');
    } finally {
      setIsDeletingDevice(false);
    }
  };

  const filteredFields = useMemo(() => {
    if (!searchQuery.trim()) return fields;
    const q = searchQuery.toLowerCase();
    return fields.filter((field) => {
      const rename = renames.find((r) => r.raw_field === field);
      const displayName = rename?.display_name?.toLowerCase() || '';
      return field.toLowerCase().includes(q) || displayName.includes(q);
    });
  }, [fields, renames, searchQuery]);

  const groupContext = useMemo(() => {
    const map = new Map<string, { description: string; sortOrder: number; fields: string[] }>();
    const subMap = new Map<string, { description: string; sortOrder: number }>();
    for (const r of renames) {
      const g = r.chart_group?.trim();
      if (g) {
        let entry = map.get(g);
        if (!entry) {
          entry = {
            description: r.group_description || '',
            sortOrder: r.group_sort_order ?? 0,
            fields: [],
          };
          map.set(g, entry);
        }
        entry.fields.push(r.raw_field);
      }
      const s = r.sub_group?.trim();
      if (g && s) {
        const key = `${g}::${s}`;
        if (!subMap.has(key)) {
          subMap.set(key, {
            description: r.sub_group_description || '',
            sortOrder: r.sub_group_sort_order ?? 0,
          });
        }
      }
    }
    return { groups: map, subGroups: subMap };
  }, [renames]);

  const allGroupsSorted = useMemo(
    () =>
      Array.from(groupContext.groups.keys()).sort(
        (a, b) => groupContext.groups.get(a)!.sortOrder - groupContext.groups.get(b)!.sortOrder
      ),
    [groupContext]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Device settings"
            className="shrink-0"
          />
        }
      >
        <Settings className="size-4" />
      </DialogTrigger>

      {/*
        `w-full` (in addition to the max-w) is what keeps the dialog a fixed
        width regardless of which tab is active. Without an explicit width,
        a dialog only constrained by max-width will shrink-wrap to whatever
        tab currently has the narrowest content, making it look like the
        modal "resizes" when switching tabs.
      */}
      <DialogContent className="w-full sm:max-w-[1100px] max-h-[85vh] p-0 pb-6 flex flex-col overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b border-border shrink-0">
          <DialogTitle>Device Settings</DialogTitle>
          <DialogDescription>
            Manage device details and sensor configurations.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto overflow-x-hidden px-6 pt-4 flex-1 space-y-6 min-w-0">
          {/* General Settings */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">General Settings</h3>
            <div className="flex items-center gap-2 max-w-md">
              <input
                type="text"
                className={inputClasses}
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="Device Name"
              />
              <Button
                onClick={handleSaveDevice}
                disabled={isSavingDevice || deviceName === device.name}
              >
                {isSavingDevice ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save
              </Button>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="space-y-3 pt-4 border-t border-border">
            <h3 className="text-sm font-medium text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Danger Zone
            </h3>
            <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <div>
                <p className="text-sm font-medium text-foreground">Delete this device</p>
                <p className="text-xs text-muted-foreground">
                  This will permanently remove the device and all its data.
                </p>
              </div>
              <Button
                variant="destructive"
                onClick={handleDeleteDevice}
                disabled={isDeletingDevice}
              >
                {isDeletingDevice ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Delete
              </Button>
            </div>
          </div>

          {/* Tabs: Sensors + Groups */}
          <div className="pt-4 border-t border-border">
            <Tabs.Root defaultValue="sensors">
              <Tabs.List className="flex gap-0 border-b border-border -mb-px">
                <Tabs.Tab
                  value="sensors"
                  className="px-4 py-2.5 text-sm font-medium text-muted-foreground border-b-2 border-transparent transition-colors cursor-pointer data-[selected]:text-foreground data-[selected]:border-primary aria-selected:text-foreground aria-selected:border-primary aria-selected:bg-muted/50"
                >
                  Sensors
                </Tabs.Tab>
                <Tabs.Tab
                  value="groups"
                  className="px-4 py-2.5 text-sm font-medium text-muted-foreground border-b-2 border-transparent transition-colors cursor-pointer data-[selected]:text-foreground data-[selected]:border-primary aria-selected:text-foreground aria-selected:border-primary aria-selected:bg-muted/50"
                >
                  Groups
                </Tabs.Tab>
                {isAdmin && (
                  <Tabs.Tab
                    value="export"
                    className="px-4 py-2.5 text-sm font-medium text-muted-foreground border-b-2 border-transparent transition-colors cursor-pointer data-[selected]:text-foreground data-[selected]:border-primary aria-selected:text-foreground aria-selected:border-primary aria-selected:bg-muted/50"
                  >
                    Export Data
                  </Tabs.Tab>
                )}
              </Tabs.List>

              <Tabs.Panel value="sensors" className="pt-4 min-w-0">
                <SensorsTab
                  fields={fields}
                  filteredFields={filteredFields}
                  renames={renames}
                  deviceId={deviceId}
                  groupContext={groupContext}
                  allGroups={allGroupsSorted}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  onRenamesChange={onRenamesChange}
                  onFieldsChange={onFieldsChange}
                />
              </Tabs.Panel>

              <Tabs.Panel value="groups" className="pt-4 min-w-0">
                <GroupsTab
                  deviceId={deviceId}
                  renames={renames}
                  groupContext={groupContext}
                  allGroups={allGroupsSorted}
                  onRenamesChange={onRenamesChange}
                />
              </Tabs.Panel>

              {isAdmin && (
                <Tabs.Panel value="export" className="pt-4 min-w-0">
                  <ExportTab
                    deviceId={deviceId}
                    fields={fields}
                    renames={renames}
                    groupContext={groupContext}
                    allGroups={allGroupsSorted}
                  />
                </Tabs.Panel>
              )}
            </Tabs.Root>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────── Sensors Tab ──────────────────────────── */

function SensorsTab({
  fields,
  filteredFields,
  renames,
  deviceId,
  groupContext,
  allGroups,
  searchQuery,
  onSearchChange,
  onRenamesChange,
  onFieldsChange,
}: {
  fields: string[];
  filteredFields: string[];
  renames: FieldRename[];
  deviceId: string;
  groupContext: {
    groups: Map<string, { description: string; sortOrder: number; fields: string[] }>;
    subGroups: Map<string, { description: string; sortOrder: number }>;
  };
  allGroups: string[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onRenamesChange: () => void;
  onFieldsChange: () => void;
}) {
  return (
    <div className="space-y-3 min-w-0">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-medium text-foreground whitespace-nowrap">
          Sensors / Fields Configuration
        </h3>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by ID or name..."
            className="flex h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus:ring-ring"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-3">
        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No fields available for this device.
          </p>
        ) : filteredFields.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No sensors found matching &quot;{searchQuery}&quot;.
          </p>
        ) : (
          filteredFields.map((field) => {
            const rename = renames.find((r) => r.raw_field === field);
            return (
              <FieldConfigCard
                key={field}
                field={field}
                rename={rename}
                deviceId={deviceId}
                groupContext={groupContext}
                allGroups={allGroups}
                onRenamesChange={onRenamesChange}
                onFieldsChange={onFieldsChange}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────── Field Config Card ──────────────────────────── */

interface FieldConfigCardProps {
  field: string;
  rename?: FieldRename;
  deviceId: string;
  groupContext: {
    groups: Map<string, { description: string; sortOrder: number; fields: string[] }>;
    subGroups: Map<string, { description: string; sortOrder: number }>;
  };
  allGroups: string[];
  onRenamesChange: () => void;
  onFieldsChange: () => void;
}

function FieldConfigCard({
  field,
  rename,
  deviceId,
  groupContext,
  allGroups,
  onRenamesChange,
  onFieldsChange,
}: FieldConfigCardProps) {
  const [displayName, setDisplayName] = useState(rename?.display_name || '');
  const [unit, setUnit] = useState(rename?.unit || '');
  const [chartGroup, setChartGroup] = useState(rename?.chart_group || '');
  const [subGroup, setSubGroup] = useState(rename?.sub_group || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (rename) {
        await updateRename(deviceId, field, displayName, unit, chartGroup, subGroup);
      } else {
        await createRename(deviceId, field, displayName, unit, chartGroup, subGroup);
      }
      onRenamesChange();
    } catch {
      alert('Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete all data for field "${field}"? This cannot be undone.`)) return;
    setIsDeleting(true);
    try {
      await deleteDeviceField(deviceId, field);
      if (rename) {
        await deleteRename(deviceId, field);
      }
      onRenamesChange();
      onFieldsChange();
    } catch {
      alert('Failed to delete field');
    } finally {
      setIsDeleting(false);
    }
  };

  const groupData = chartGroup ? groupContext.groups.get(chartGroup) : undefined;
  const siblingCount = groupData ? groupData.fields.length : 0;
  const inGroup = !!chartGroup && siblingCount > 1;

  // Resolve subgroups for current group
  const groupSubGroups = useMemo(() => {
    if (!chartGroup) return [];
    const result: { name: string; sortOrder: number }[] = [];
    for (const [key, data] of groupContext.subGroups.entries()) {
      const [g] = key.split('::');
      if (g === chartGroup) {
        result.push({ name: data.sortOrder + ':' + key, sortOrder: data.sortOrder });
      }
    }
    return result.sort((a, b) => a.sortOrder - b.sortOrder);
  }, [chartGroup, groupContext.subGroups]);

  return (
    <div className="rounded-lg border border-border p-4 space-y-3 bg-card/50 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-1 rounded truncate">
          {field}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {inGroup && (
            <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap">
              {siblingCount} sensors in &quot;{chartGroup}&quot;
            </span>
          )}
          <Button variant="ghost" size="icon-sm" onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin text-destructive" />
            ) : (
              <Trash2 className="h-4 w-4 text-destructive" />
            )}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="space-y-1 min-w-0">
          <label className="text-xs text-muted-foreground">Display Name</label>
          <input
            type="text"
            className={inputClasses}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={field}
          />
        </div>
        <div className="space-y-1 min-w-0">
          <label className="text-xs text-muted-foreground">Unit (Y-Axis)</label>
          <input
            type="text"
            className={inputClasses}
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="e.g., °C, %, v"
          />
        </div>
        <div className="space-y-1 min-w-0">
          <label className="text-xs text-muted-foreground">Chart Group</label>
          <input
            type="text"
            className={inputClasses}
            value={chartGroup}
            onChange={(e) => setChartGroup(e.target.value)}
            placeholder="e.g., Temperature"
          />
        </div>
        <div className="space-y-1 min-w-0">
          <label className="text-xs text-muted-foreground">Sub Group (Optional)</label>
          <input
            type="text"
            className={inputClasses}
            value={subGroup}
            onChange={(e) => setSubGroup(e.target.value)}
            placeholder="e.g., Indoor"
          />
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <Button size="sm" onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Config
        </Button>
      </div>
    </div>
  );
}

/* ──────────────────────────── Groups Tab ──────────────────────────── */

function GroupsTab({
  deviceId,
  renames,
  groupContext,
  allGroups,
  onRenamesChange,
}: {
  deviceId: string;
  renames: FieldRename[];
  groupContext: {
    groups: Map<string, { description: string; sortOrder: number; fields: string[] }>;
    subGroups: Map<string, { description: string; sortOrder: number }>;
  };
  allGroups: string[];
  onRenamesChange: () => void;
}) {
  const [newSubGroupInputs, setNewSubGroupInputs] = useState<Record<string, string>>({});
  const [newGroupName, setNewGroupName] = useState('');
  const [extraGroups, setExtraGroups] = useState<Set<string>>(new Set());
  const [isDeletingGroup, setIsDeletingGroup] = useState<string | null>(null);

  const displayGroups = useMemo(() => {
    const real = new Set(allGroups);
    const extras = Array.from(extraGroups).filter((g) => !real.has(g));
    return [...allGroups, ...extras.sort()];
  }, [allGroups, extraGroups]);

  const moveGroup = useCallback(
    async (groupName: string, direction: -1 | 1) => {
      const idx = displayGroups.indexOf(groupName);
      if (idx < 0) return;
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= displayGroups.length) return;
      const reordered = [...displayGroups];
      [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];
      try {
        await Promise.all(
          reordered.map((name, i) => {
            const existing = groupContext.groups.get(name);
            return updateGroupConfig(
              deviceId,
              name,
              existing?.description || undefined,
              i
            );
          })
        );
        onRenamesChange();
      } catch {
        alert('Failed to reorder groups');
      }
    },
    [displayGroups, groupContext, deviceId, onRenamesChange]
  );

  const moveSubGroup = useCallback(
    async (groupName: string, subName: string, direction: -1 | 1) => {
      const parentKey = `${groupName}::${subName}`;
      const siblings = Array.from(groupContext.subGroups.entries())
        .filter(([k]) => k.startsWith(`${groupName}::`))
        .map(([k, v]) => ({ key: k, name: k.split('::')[1], sortOrder: v.sortOrder }))
        .sort((a, b) => a.sortOrder - b.sortOrder);

      const idx = siblings.findIndex((s) => s.key === parentKey);
      if (idx < 0) return;
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= siblings.length) return;

      const reordered = [...siblings];
      [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];
      try {
        await Promise.all(
          reordered.map((s, i) => {
            const existing = groupContext.subGroups.get(`${groupName}::${s.name}`);
            return updateSubGroupConfig(
              deviceId,
              groupName,
              s.name,
              existing?.description || undefined,
              i
            );
          })
        );
        onRenamesChange();
      } catch {
        alert('Failed to reorder subgroups');
      }
    },
    [groupContext, deviceId, onRenamesChange]
  );

  const handleAddSubGroup = useCallback(
    async (groupName: string, subGroupName: string) => {
      const trimmed = subGroupName.trim();
      if (!trimmed) return;
      const key = `${groupName}::${trimmed}`;
      if (groupContext.subGroups.has(key)) {
        alert('Subgroup already exists');
        return;
      }
      let maxOrder = -1;
      for (const [k, v] of groupContext.subGroups.entries()) {
        if (k.startsWith(`${groupName}::`) && v.sortOrder > maxOrder) {
          maxOrder = v.sortOrder;
        }
      }
      try {
        await updateSubGroupConfig(deviceId, groupName, trimmed, undefined, maxOrder + 1);
        setNewSubGroupInputs((prev) => ({ ...prev, [groupName]: '' }));
        onRenamesChange();
      } catch {
        alert('Failed to add subgroup');
      }
    },
    [groupContext, deviceId, onRenamesChange]
  );

  const handleCreateGroup = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      if (allGroups.includes(trimmed) || extraGroups.has(trimmed)) {
        alert('Group already exists');
        return;
      }
      setExtraGroups((prev) => new Set(prev).add(trimmed));
      setNewGroupName('');
    },
    [allGroups, extraGroups]
  );

  const handleDeleteGroup = useCallback(
    async (groupName: string) => {
      const fields = groupContext.groups.get(groupName)?.fields;
      if (!fields || fields.length === 0) return;
      if (!confirm(`Remove group "${groupName}" from ${fields.length} sensor(s)? The sensors will become ungrouped.`))
        return;
      setIsDeletingGroup(groupName);
      try {
        await Promise.all(
          fields.map((rawField) => {
            const rename = renames.find((r) => r.raw_field === rawField);
            return updateRename(
              deviceId,
              rawField,
              rename?.display_name || rawField,
              rename?.unit,
              undefined,
              undefined
            );
          })
        );
        setExtraGroups((prev) => {
          const next = new Set(prev);
          next.delete(groupName);
          return next;
        });
        onRenamesChange();
      } catch {
        alert('Failed to delete group');
      } finally {
        setIsDeletingGroup(null);
      }
    },
    [groupContext, renames, deviceId, onRenamesChange]
  );

  if (displayGroups.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">
          No groups configured. Assign sensors to groups in the Sensors tab.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 min-w-0">
      <h3 className="text-sm font-medium text-foreground">Group Configuration</h3>
      <p className="text-xs text-muted-foreground">
        Configure group descriptions and order. Changes apply to all sensors in the group.
      </p>

      {/* Create group */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          className={inputClasses + ' max-w-xs'}
          placeholder="New group name"
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreateGroup(newGroupName);
          }}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleCreateGroup(newGroupName)}
          disabled={!newGroupName.trim()}
        >
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </div>

      {displayGroups.map((groupName) => {
        const groupData = groupContext.groups.get(groupName);
        const siblings = Array.from(groupContext.subGroups.entries())
          .filter(([k]) => k.startsWith(`${groupName}::`))
          .map(([k, v]) => ({ key: k, name: k.split('::')[1], ...v }))
          .sort((a, b) => a.sortOrder - b.sortOrder);

        return (
          <div
            key={groupName}
            className="rounded-lg border border-border p-4 space-y-3 bg-card/50 min-w-0"
          >
            {/* Group header */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium text-foreground truncate">{groupName}</span>
                <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap">
                  {groupData ? `${groupData.fields.length} sensor${groupData.fields.length !== 1 ? 's' : ''}` : 'empty'}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => moveGroup(groupName, -1)}
                  disabled={displayGroups.indexOf(groupName) <= 0}
                  title="Move group up"
                >
                  <ChevronUp className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => moveGroup(groupName, 1)}
                  disabled={displayGroups.indexOf(groupName) >= displayGroups.length - 1}
                  title="Move group down"
                >
                  <ChevronDown className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleDeleteGroup(groupName)}
                  disabled={isDeletingGroup === groupName}
                  title="Delete group"
                  className="text-destructive/70 hover:text-destructive"
                >
                  {isDeletingGroup === groupName ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </div>

            {/* Group description + sort order */}
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1 min-w-0">
                <label className="text-xs text-muted-foreground">Group Description</label>
                <input
                  type="text"
                  className={inputClasses}
                  defaultValue={groupData?.description || ''}
                  onBlur={(e) => {
                    const val = e.target.value;
                    if (val !== (groupData?.description || '')) {
                      updateGroupConfig(deviceId, groupName, val || undefined).then(
                        onRenamesChange
                      );
                    }
                  }}
                  placeholder="Optional — shown above charts"
                />
              </div>
            </div>

            {/* Subgroups */}
            {siblings.length > 0 && (
              <div className="space-y-2 pl-3 border-l-2 border-border/50 min-w-0">
                <span className="text-xs font-medium text-muted-foreground">Subgroups</span>
                {siblings.map((sg) => (
                  // Grid with fixed-width tracks for the label/buttons/number
                  // and a single `minmax(0, 1fr)` track for the description
                  // input. That `minmax(0, ...)` is what lets the input
                  // shrink below its content size instead of overflowing
                  // the modal — a plain `flex-1` child won't do that on its
                  // own because flex items default to `min-width: auto`.
                  <div
                    key={sg.key}
                    className="grid grid-cols-[auto_6rem_minmax(0,1fr)] items-center gap-2"
                  >
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => moveSubGroup(groupName, sg.name, -1)}
                        disabled={siblings.indexOf(sg) <= 0}
                        title="Move subgroup up"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => moveSubGroup(groupName, sg.name, 1)}
                        disabled={siblings.indexOf(sg) >= siblings.length - 1}
                        title="Move subgroup down"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </div>
                    <span className="text-xs font-medium text-foreground truncate">
                      {sg.name}
                    </span>
                    <input
                      type="text"
                      className={inputClasses}
                      defaultValue={sg.description}
                      placeholder="Description"
                      onBlur={(e) => {
                        const val = e.target.value;
                        if (val !== sg.description) {
                          updateSubGroupConfig(deviceId, groupName, sg.name, val || undefined).then(
                            onRenamesChange
                          );
                        }
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Add subgroup */}
            <div className="flex items-center gap-2 pt-1 min-w-0">
              <input
                type="text"
                className={inputClasses + ' max-w-xs'}
                placeholder="New subgroup name"
                value={newSubGroupInputs[groupName] || ''}
                onChange={(e) =>
                  setNewSubGroupInputs((prev) => ({ ...prev, [groupName]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddSubGroup(groupName, newSubGroupInputs[groupName] || '');
                  }
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAddSubGroup(groupName, newSubGroupInputs[groupName] || '')}
                disabled={!newSubGroupInputs[groupName]?.trim()}
              >
                <Plus className="h-3 w-3" />
                Add
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ──────────────────────────── Export Data Tab ──────────────────────────── */

function ExportTab({
  deviceId,
  fields,
  renames,
  groupContext,
  allGroups,
}: {
  deviceId: string;
  fields: string[];
  renames: FieldRename[];
  groupContext: {
    groups: Map<string, { description: string; sortOrder: number; fields: string[] }>;
    subGroups: Map<string, { description: string; sortOrder: number }>;
  };
  allGroups: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<'csv' | 'json' | null>(null);

  const ungroupedFields = useMemo(
    () =>
      fields.filter(
        (f) => !renames.some((r) => r.raw_field === f && !!r.chart_group?.trim())
      ),
    [fields, renames]
  );

  const toggleField = (f: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(f)) {
        next.delete(f);
      } else {
        next.add(f);
      }
      return next;
    });
  };

  const toggleGroup = (g: string) => {
    const groupFields = groupContext.groups.get(g)?.fields || [];
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = groupFields.every((f) => next.has(f));
      for (const f of groupFields) {
        if (allSelected) {
          next.delete(f);
        } else {
          next.add(f);
        }
      }
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(fields));
  const clearAll = () => setSelected(new Set());

  const rangeValid = useMemo(() => {
    if (!from || !to) return false;
    return new Date(from).getTime() < new Date(to).getTime();
  }, [from, to]);

  const canDownload = selected.size > 0 && rangeValid && !downloading;

  const handleDownload = async (format: 'csv' | 'json') => {
    setError(null);
    setDownloading(format);
    try {
      const blob = await exportDeviceData(
        deviceId,
        Array.from(selected),
        new Date(from).toISOString(),
        new Date(to).toISOString(),
        format
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${deviceId.replace(/[^A-Za-z0-9._-]+/g, '_')}_${new Date(from)
        .toISOString()
        .replace(/[:.]/g, '-')}_${new Date(to).toISOString().replace(/[:.]/g, '-')}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-medium text-foreground whitespace-nowrap">
          Export Data
        </h3>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={selectAll} disabled={fields.length === 0}>
            Select all
          </Button>
          <Button variant="outline" size="sm" onClick={clearAll} disabled={selected.size === 0}>
            Clear
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Select sensors, pick a time range, then download the readings as CSV or JSON.
      </p>

      {/* Selection tree */}
      <div className="space-y-3 rounded-lg border border-border p-4 bg-card/50">
        {allGroups.length === 0 && ungroupedFields.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-2">
            No sensors available for this device.
          </p>
        ) : (
          <>
            {allGroups.map((groupName) => {
              const groupFields = groupContext.groups.get(groupName)?.fields || [];
              const groupSelected = groupFields.every((f) => selected.has(f));
              return (
                <div key={groupName} className="space-y-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input"
                      checked={groupSelected && groupFields.length > 0}
                      onChange={() => toggleGroup(groupName)}
                    />
                    <span className="text-sm font-medium text-foreground">{groupName}</span>
                    <span className="text-[10px] text-muted-foreground/70">
                      {groupFields.length} sensor{groupFields.length !== 1 ? 's' : ''}
                    </span>
                  </label>
                  <div className="pl-6 space-y-1">
                    {groupFields.map((f) => (
                      <label
                        key={f}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-input"
                          checked={selected.has(f)}
                          onChange={() => toggleField(f)}
                        />
                        <span className="font-mono text-xs text-muted-foreground">{f}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
            {ungroupedFields.length > 0 && (
              <div className="space-y-1 pt-2 border-t border-border/50">
                <span className="text-xs font-medium text-muted-foreground">Ungrouped</span>
                {ungroupedFields.map((f) => (
                  <label key={f} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input"
                      checked={selected.has(f)}
                      onChange={() => toggleField(f)}
                    />
                    <span className="font-mono text-xs text-muted-foreground">{f}</span>
                  </label>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Time range */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1 min-w-0">
          <label className="text-xs text-muted-foreground">From</label>
          <input
            type="datetime-local"
            className={inputClasses}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1 min-w-0">
          <label className="text-xs text-muted-foreground">To</label>
          <input
            type="datetime-local"
            className={inputClasses}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>
      {from && to && !rangeValid && (
        <p className="text-xs text-destructive">&quot;To&quot; must be after &quot;From&quot;.</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="default"
          onClick={() => handleDownload('csv')}
          disabled={!canDownload}
        >
          {downloading === 'csv' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Download CSV
        </Button>
        <Button
          variant="outline"
          onClick={() => handleDownload('json')}
          disabled={!canDownload}
        >
          {downloading === 'json' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Download JSON
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}