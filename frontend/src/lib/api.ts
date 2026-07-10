const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';

export interface Device {
  id: string;
  name: string;
  device_type: string;
  first_seen: string;
  last_seen: string;
  field_count: number;
  broker_name: string;
}

export interface ReadingData {
  bucket: string;
  field_name: string;
  display_name: string;
  unit: string;
  value: number;
}

export interface FieldRename {
  device_id: string;
  raw_field: string;
  display_name?: string;
  unit?: string;
  chart_group?: string;
  sub_group?: string;
}

export interface User {
  id: number;
  email: string;
  role: string;
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('auth_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return headers;
}

export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Login failed' }));
    throw new Error(err.error || 'Login failed');
  }
  return res.json();
}

export async function register(email: string, password: string, confirmPassword: string): Promise<{ id: number; email: string; role: string }> {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, confirm_password: confirmPassword }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Registration failed' }));
    throw new Error(err.error || 'Registration failed');
  }
  return res.json();
}

export async function getMe(): Promise<User> {
  const res = await fetch(`${API_URL}/auth/me`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Not authenticated');
  return res.json();
}

export async function getDevice(deviceId: string): Promise<Device> {
  const res = await fetch(`${API_URL}/devices/${deviceId}`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to fetch device');
  return res.json();
}

export async function getDevices(): Promise<Device[]> {
  const res = await fetch(`${API_URL}/devices`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to fetch devices');
  return res.json();
}

export async function getDeviceFields(deviceId: string): Promise<string[]> {
  const res = await fetch(`${API_URL}/devices/${deviceId}/fields`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to fetch fields');
  return res.json();
}

export async function getReadings(
  deviceId: string,
  fields: string[],
  from: string,
  to: string
): Promise<{ data: ReadingData[] }> {
  const params = new URLSearchParams({
    fields: fields.join(','),
    from,
    to,
  });
  const res = await fetch(`${API_URL}/devices/${deviceId}/readings?${params}`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch readings');
  return res.json();
}

export async function updateDevice(deviceId: string, data: { name?: string; device_type?: string }): Promise<void> {
  const res = await fetch(`${API_URL}/devices/${deviceId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update device');
}

export async function deleteDevice(deviceId: string): Promise<void> {
  const res = await fetch(`${API_URL}/devices/${deviceId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete device');
}

export async function deleteDeviceField(deviceId: string, fieldName: string): Promise<void> {
  const res = await fetch(`${API_URL}/devices/${deviceId}/fields/${encodeURIComponent(fieldName)}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete field data');
}

export async function getRenames(deviceId: string): Promise<FieldRename[]>{
  const res = await fetch(`${API_URL}/devices/${deviceId}/renames`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to fetch renames');
  return res.json();
}

export async function createRename(
  deviceId: string,
  rawField: string,
  displayName?: string,
  unit?: string,
  chartGroup?: string,
  subGroup?: string
): Promise<void> {
  const res = await fetch(`${API_URL}/devices/${deviceId}/renames`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ raw_field: rawField, display_name: displayName, unit, chart_group: chartGroup, sub_group: subGroup }),
  });
  if (!res.ok) throw new Error('Failed to create rename');
}

export async function updateRename(
  deviceId: string,
  rawField: string,
  displayName?: string,
  unit?: string,
  chartGroup?: string,
  subGroup?: string
): Promise<void> {
  const res = await fetch(`${API_URL}/devices/${deviceId}/renames/${encodeURIComponent(rawField)}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ display_name: displayName, unit, chart_group: chartGroup, sub_group: subGroup }),
  });
  if (!res.ok) throw new Error('Failed to update rename');
}

export async function deleteRename(deviceId: string, rawField: string): Promise<void> {
  const res = await fetch(`${API_URL}/devices/${deviceId}/renames/${encodeURIComponent(rawField)}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete rename');
}
