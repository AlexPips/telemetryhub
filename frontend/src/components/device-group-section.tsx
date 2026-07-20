'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Server, Clock, Hash, Activity, Trash2,
  ChevronUp, ChevronDown, Pencil, Check, X, ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Device, DeviceGroup } from '@/lib/api';

interface DeviceGroupSectionProps {
  groupName: string;
  devices: Device[];
  isAdmin: boolean;
  sortOrder: number;
  totalGroups: number;
  availableGroups: DeviceGroup[];
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRename?: (newName: string) => void;
  onDelete?: () => void;
  onAssignDevice?: (deviceId: string, groupId: number | null) => void;
}

export function DeviceGroupSection({
  groupName,
  devices,
  isAdmin,
  sortOrder,
  totalGroups,
  availableGroups,
  onMoveUp,
  onMoveDown,
  onRename,
  onDelete,
  onAssignDevice,
}: DeviceGroupSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(groupName);

  function handleSave() {
    if (editName.trim() && editName !== groupName) {
      onRename?.(editName.trim());
    }
    setIsEditing(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {isAdmin && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" onClick={onMoveUp} disabled={sortOrder <= 0} title="Move group up" className="text-foreground">
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon-sm" onClick={onMoveDown} disabled={sortOrder >= totalGroups - 1} title="Move group down" className="text-foreground">
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>
        )}

        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') setIsEditing(false);
              }}
              className="h-8 px-3 text-sm font-semibold border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
              style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}
              autoFocus
            />
            <Button variant="outline" size="icon-sm" onClick={handleSave} className="text-emerald-500"><Check className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon-sm" onClick={() => setIsEditing(false)} className="text-red-500"><X className="h-4 w-4" /></Button>
          </div>
        ) : (
          <h2
            className={cn(
              "text-lg font-semibold text-foreground",
              isAdmin && onRename && "cursor-pointer hover:text-primary transition-colors"
            )}
            onClick={() => isAdmin && onRename && setIsEditing(true)}
          >
            {groupName}
          </h2>
        )}

        <span className="text-xs text-muted-foreground">
          {devices.length} device{devices.length !== 1 ? 's' : ''}
        </span>

        {isAdmin && !isEditing && onRename && (
          <div className="flex items-center gap-1 ml-auto">
            <Button variant="outline" size="icon-sm" onClick={() => setIsEditing(true)} title="Rename group" className="text-muted-foreground hover:text-foreground">
              <Pencil className="h-4 w-4" />
            </Button>
            {onDelete && (
              <Button variant="outline" size="icon-sm" onClick={onDelete} title="Delete group" className="text-red-400 hover:text-red-500 hover:border-red-500/50">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>

      {devices.length === 0 ? (
        <div className="text-sm text-muted-foreground italic py-2">No devices in this group</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {devices.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              isAdmin={isAdmin}
              availableGroups={availableGroups}
              onAssignDevice={onAssignDevice}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DeviceCard({
  device,
  isAdmin,
  availableGroups,
  onAssignDevice,
}: {
  device: Device;
  isAdmin: boolean;
  availableGroups: DeviceGroup[];
  onAssignDevice?: (deviceId: string, groupId: number | null) => void;
}) {
  const isOnline =
    new Date().getTime() - new Date(device.last_seen).getTime() < 15 * 60 * 1000;
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showGroupPicker) return;
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowGroupPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showGroupPicker]);

  const currentGroup = availableGroups.find((g) => g.id === device.group_id);

  return (
    <div className="relative">
      <Link href={`/dashboard/${device.id}`} className="group block">
        <div className="relative h-full rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/50 hover:shadow-lg">
          <div className="mb-4 flex items-start justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                <Activity className="h-5 w-5" />
              </div>
              <h3 className="truncate text-base font-semibold text-foreground">{device.name || device.id}</h3>
            </div>
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium shrink-0",
                isOnline ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", isOnline ? "bg-emerald-500" : "bg-red-500")} />
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>

          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Hash className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{device.id}</span>
            </div>
            <div className="flex items-center gap-2">
              <Server className="h-3.5 w-3.5 shrink-0" />
              <span>{device.broker_name || '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>{new Date(device.last_seen).toLocaleString()}</span>
            </div>
          </div>

          {isAdmin && onAssignDevice && (
            <div className="mt-3 pt-3 border-t border-border">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowGroupPicker(!showGroupPicker);
                }}
                className="flex items-center justify-between w-full h-9 px-3 text-xs rounded-lg border border-border hover:border-primary/50 bg-secondary text-secondary-foreground transition-colors"
              >
                <span className="flex items-center gap-2 truncate">
                  <span className="truncate">{currentGroup?.name || 'No group'}</span>
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            </div>
          )}
        </div>
      </Link>

      {showGroupPicker && isAdmin && onAssignDevice && (
        <>
          <div className="fixed inset-0 z-40 md:hidden" onClick={() => setShowGroupPicker(false)} />
          <div
            ref={pickerRef}
            className={cn(
              "fixed bottom-0 left-0 right-0 z-50 border border-border rounded-t-xl shadow-lg bg-popover md:absolute md:top-full md:left-0 md:right-0 md:mt-1 md:rounded-xl md:bottom-auto"
            )}
          >
            <div className="p-2 border-b border-border md:hidden">
              <span className="text-xs font-medium text-muted-foreground">Move to group</span>
            </div>
            <div className="p-1 max-h-48 overflow-y-auto">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onAssignDevice(device.id, null);
                  setShowGroupPicker(false);
                }}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm rounded-md transition-colors",
                  !device.group_id ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-muted"
                )}
              >
                No group
              </button>
              {availableGroups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onAssignDevice(device.id, g.id);
                    setShowGroupPicker(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm rounded-md transition-colors",
                    device.group_id === g.id ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-muted"
                  )}
                >
                  {g.name}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
