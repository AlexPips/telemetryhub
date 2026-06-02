'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { getDevices, type Device } from '@/lib/api';

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
    return <div className="page-loading">Loading...</div>;
  }

  return (
    <div className="page-container">
      <h1 className="page-title">Dashboard</h1>

      {isLoading ? (
        <p>Loading devices...</p>
      ) : devices.length === 0 ? (
        <div className="card">
          <p style={{ color: 'var(--text-secondary)' }}>
            No devices found. Connect an MQTT broker to start receiving data.
          </p>
        </div>
      ) : (
        <div className="device-grid">
          {devices.map((device) => (
            <DeviceCard key={device.id} device={device} />
          ))}
        </div>
      )}
    </div>
  );
}

function DeviceCard({ device }: { device: Device }) {
  const isOnline =
    new Date().getTime() - new Date(device.last_seen).getTime() < 15 * 60 * 1000;

  return (
    <Link href={`/dashboard/${device.id}`} style={{ textDecoration: 'none' }}>
      <div
        className="card device-card"
        style={{ cursor: 'pointer', transition: 'border-color 0.15s' }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.borderColor = 'var(--accent)')
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.borderColor = 'var(--border)')
        }
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
          }}
        >
          <h3 style={{ fontSize: '16px' }}>{device.name || device.id}</h3>
          <span className={`badge ${isOnline ? 'online' : 'offline'}`}>
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
        <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
          <div>ID: {device.id}</div>
          <div>Type: {device.device_type}</div>
          <div>Broker: {device.broker_name || '—'}</div>
          <div>Fields: {device.field_count}</div>
          <div>Last seen: {new Date(device.last_seen).toLocaleString()}</div>
        </div>
      </div>
    </Link>
  );
}
