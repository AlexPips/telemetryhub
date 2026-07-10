'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Settings, Loader2, Trash2, Save, AlertTriangle, Search } from 'lucide-react';
import {
  updateDevice,
  deleteDevice,
  deleteDeviceField,
  createRename,
  updateRename,
  deleteRename,
  type Device,
  type FieldRename,
} from '@/lib/api';

const inputClasses = "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 transition-colors";

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

  const handleSaveDevice = async () => {
    setIsSavingDevice(true);
    try {
      await updateDevice(deviceId, { name: deviceName });
      onDeviceUpdate({ ...device, name: deviceName });
    } catch (err) {
      alert('Failed to update device name');
    } finally {
      setIsSavingDevice(false);
    }
  };

  const handleDeleteDevice = async () => {
    if (!confirm(`Delete device ${device.name || deviceId}? This will remove all associated data.`)) return;
    setIsDeletingDevice(true);
    try {
      await deleteDevice(deviceId);
      onDeviceDelete();
      setOpen(false);
      router.push('/dashboard');
    } catch (err) {
      alert('Failed to delete device');
    } finally {
      setIsDeletingDevice(false);
    }
  };

  // Filter fields by Search Query (ID or Display Name)
  const filteredFields = useMemo(() => {
    if (!searchQuery.trim()) return fields;
    const q = searchQuery.toLowerCase();
    return fields.filter((field) => {
      const rename = renames.find((r) => r.raw_field === field);
      const displayName = rename?.display_name?.toLowerCase() || '';
      return field.toLowerCase().includes(q) || displayName.includes(q);
    });
  }, [fields, renames, searchQuery]);

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
      
      {/* Added pb-6 here to push the bottom edge of the flex container up, clearing the rounded corner */}
      <DialogContent className="sm:max-w-[1100px] max-h-[85vh] p-0 pb-6 flex flex-col overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b border-border shrink-0">
          <DialogTitle>Device Settings</DialogTitle>
          <DialogDescription>
            Manage device details and sensor configurations.
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable Body - removed pb to let the parent handle the bottom gap */}
        <div className="overflow-y-auto px-6 pt-4 flex-1 space-y-6">
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
              <Button onClick={handleSaveDevice} disabled={isSavingDevice || deviceName === device.name}>
                {isSavingDevice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
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
                <p className="text-xs text-muted-foreground">This will permanently remove the device and all its data.</p>
              </div>
              <Button variant="destructive" onClick={handleDeleteDevice} disabled={isDeletingDevice}>
                {isDeletingDevice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete
              </Button>
            </div>
          </div>

          {/* Sensors Configuration */}
          <div className="space-y-3 pt-4 border-t border-border">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-sm font-medium text-foreground whitespace-nowrap">
                Sensors / Fields Configuration
              </h3>
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by ID or name..."
                  className="flex h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-3">
              {fields.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No fields available for this device.</p>
              ) : filteredFields.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No sensors found matching "{searchQuery}".</p>
              ) : (
                filteredFields.map((field) => {
                  const rename = renames.find((r) => r.raw_field === field);
                  return (
                    <FieldConfigCard
                      key={field}
                      field={field}
                      rename={rename}
                      deviceId={deviceId}
                      onRenamesChange={onRenamesChange}
                      onFieldsChange={onFieldsChange}
                    />
                  );
                })
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface FieldConfigCardProps {
  field: string;
  rename?: FieldRename;
  deviceId: string;
  onRenamesChange: () => void;
  onFieldsChange: () => void;
}

function FieldConfigCard({ field, rename, deviceId, onRenamesChange, onFieldsChange }: FieldConfigCardProps) {
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
    } catch (err) {
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
    } catch (err) {
      alert('Failed to delete field');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="rounded-lg border border-border p-4 space-y-3 bg-card/50">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-1 rounded">{field}</span>
        <Button variant="ghost" size="icon-sm" onClick={handleDelete} disabled={isDeleting}>
          {isDeleting ? <Loader2 className="h-4 w-4 animate-spin text-destructive" /> : <Trash2 className="h-4 w-4 text-destructive" />}
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Display Name</label>
          <input
            type="text"
            className={inputClasses}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={field}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Unit (Y-Axis)</label>
          <input
            type="text"
            className={inputClasses}
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="e.g., °C, %, v"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Chart Group</label>
          <input
            type="text"
            className={inputClasses}
            value={chartGroup}
            onChange={(e) => setChartGroup(e.target.value)}
            placeholder="e.g., Temperature"
          />
        </div>
        <div className="space-y-1">
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