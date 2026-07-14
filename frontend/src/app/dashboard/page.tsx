'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { getDevices, deleteDevice, type Device } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2, Cpu, Server, Clock, Hash, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;

    getDevices()
      .then(setDevices)
      .catch(() => setDevices([]))
      .finally(() => setIsLoading(false));
  }, [user]);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
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

  return (
    <div className="w-full mx-auto p-6 max-md:p-4">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
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
          <p className="text-sm text-muted-foreground">
            Connect an MQTT broker to start receiving data.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {devices.map((device) => (
            <DeviceCard 
              key={device.id} 
              device={device} 
              isAdmin={user?.role === 'admin'} 
              onDelete={(e) => handleDeleteDevice(device.id, e)} 
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DeviceCard({ device, isAdmin, onDelete }: { device: Device; isAdmin: boolean; onDelete: (e: React.MouseEvent) => void }) {
  const isOnline =
    new Date().getTime() - new Date(device.last_seen).getTime() < 15 * 60 * 1000;

  return (
    <Link href={`/dashboard/${device.id}`} className="group block">
      <div className="relative h-full rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/50 hover:shadow-lg">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              <Activity className="h-5 w-5" />
            </div>
            <h3 className="truncate text-base font-semibold text-foreground">{device.name || device.id}</h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                isOnline ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", isOnline ? "bg-emerald-500" : "bg-red-500")} />
              {isOnline ? 'Online' : 'Offline'}
            </span>
            {isAdmin && (
              <Button
                variant="destructive"
                size="icon-sm"
                className="opacity-0 transition-opacity group-hover:opacity-100"
                onClick={onDelete}
                aria-label="Delete device"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Hash className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{device.id}</span>
          </div>
          <div className="flex items-center gap-2">
            <Cpu className="h-3.5 w-3.5 shrink-0" />
            <span>{device.device_type}</span>
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
      </div>
    </Link>
  );
}