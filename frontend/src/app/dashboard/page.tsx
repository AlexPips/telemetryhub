'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  getDevices, deleteDevice, getDeviceGroups, createDeviceGroup,
  updateDeviceGroup, deleteDeviceGroup, reorderDeviceGroups,
  setDeviceGroup, type Device, type DeviceGroup,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, Cpu } from 'lucide-react';
import { DeviceGroupSection } from '@/components/device-group-section';

export default function DashboardPage() {
  const { user, isAdmin, isLoading: authLoading } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [groups, setGroups] = useState<DeviceGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newGroupName, setNewGroupName] = useState('');
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [d, g] = await Promise.all([getDevices(), getDeviceGroups()]);
      setDevices(d);
      setGroups(g);
    } catch {
      setDevices([]);
      setGroups([]);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const groupedDevices = useMemo(() => {
    const map = new Map<number, Device[]>();
    const ungrouped: Device[] = [];
    for (const device of devices) {
      if (device.group_id) {
        const arr = map.get(device.group_id) || [];
        arr.push(device);
        map.set(device.group_id, arr);
      } else {
        ungrouped.push(device);
      }
    }
    return { map, ungrouped };
  }, [devices]);

  const sortedGroups = useMemo(() => {
    return [...groups]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((g) => ({ ...g, devices: groupedDevices.map.get(g.id) || [] }));
  }, [groups, groupedDevices]);

  async function handleCreateGroup() {
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    try {
      await createDeviceGroup(trimmed);
      setNewGroupName('');
      loadData();
    } catch {
      alert('Failed to create group');
    }
  }

  async function handleRenameGroup(id: number, newName: string) {
    try {
      await updateDeviceGroup(id, newName);
      loadData();
    } catch {
      alert('Failed to rename group');
    }
  }

  async function handleDeleteGroup(id: number) {
    const group = groups.find((g) => g.id === id);
    const deviceCount = groupedDevices.map.get(id)?.length || 0;
    const msg = deviceCount > 0
      ? `Delete group "${group?.name}"? ${deviceCount} device(s) will become ungrouped.`
      : `Delete empty group "${group?.name}"?`;
    if (!confirm(msg)) return;
    try {
      await deleteDeviceGroup(id);
      loadData();
    } catch {
      alert('Failed to delete group');
    }
  }

  async function handleMoveGroup(id: number, direction: -1 | 1) {
    const sorted = [...groups].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((g) => g.id === id);
    if (idx < 0) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;
    const reordered = [...sorted];
    [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];
    try {
      await reorderDeviceGroups(reordered.map((g) => g.id));
      loadData();
    } catch {
      alert('Failed to reorder groups');
    }
  }

  async function handleAssignDevice(deviceId: string, groupId: number | null) {
    try {
      await setDeviceGroup(deviceId, groupId);
      loadData();
    } catch {
      alert('Failed to assign device');
    }
  }

  async function handleDeleteDevice(deviceId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete device ${deviceId}? This will remove all associated data.`)) return;
    try {
      await deleteDevice(deviceId);
      setDevices(devices.filter((d) => d.id !== deviceId));
    } catch {
      alert('Failed to delete device');
    }
  }

  if (authLoading || !user) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="w-full mx-auto p-6 max-md:p-4">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
              placeholder="New group name"
              className="h-9 px-3 text-sm border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
              style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}
            />
            <Button variant="outline" size="sm" onClick={handleCreateGroup} disabled={!newGroupName.trim()}>
              <Plus className="h-4 w-4 mr-1" />Add Group
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : devices.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-12 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Cpu className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="mb-1 text-lg font-medium text-foreground">No devices found</h3>
          <p className="text-sm text-muted-foreground">Connect an MQTT broker to start receiving data.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {sortedGroups.map((group, idx) => (
            <DeviceGroupSection
              key={group.id}
              groupName={group.name}
              devices={group.devices}
              isAdmin={isAdmin}
              sortOrder={idx}
              totalGroups={sortedGroups.length + (groupedDevices.ungrouped.length > 0 ? 1 : 0)}
              availableGroups={groups}
              onMoveUp={() => handleMoveGroup(group.id, -1)}
              onMoveDown={() => handleMoveGroup(group.id, 1)}
              onRename={(name) => handleRenameGroup(group.id, name)}
              onDelete={() => handleDeleteGroup(group.id)}
              onAssignDevice={handleAssignDevice}
            />
          ))}
          {groupedDevices.ungrouped.length > 0 && (
            <DeviceGroupSection
              groupName="Ungrouped"
              devices={groupedDevices.ungrouped}
              isAdmin={isAdmin}
              sortOrder={sortedGroups.length}
              totalGroups={sortedGroups.length + 1}
              availableGroups={groups}
              onAssignDevice={handleAssignDevice}
            />
          )}
        </div>
      )}
    </div>
  );
}
