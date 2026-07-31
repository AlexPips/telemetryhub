const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';

export interface Device {
  id: string;
  name: string;
  device_type: string;
  first_seen: string;
  last_seen: string;
  field_count: number;
  broker_name: string;
  group_id?: number;
  group_name?: string;
}

export interface DeviceGroup {
  id: number;
  name: string;
  sort_order: number;
  created_at: string;
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
  group_description?: string;
  sub_group_description?: string;
  group_sort_order?: number;
  sub_group_sort_order?: number;
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

export async function updateGroupConfig(
  deviceId: string,
  chartGroup: string,
  description?: string,
  sortOrder?: number
): Promise<void> {
  const res = await fetch(`${API_URL}/devices/${deviceId}/renames/group-config`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ chart_group: chartGroup, group_description: description, group_sort_order: sortOrder }),
  });
  if (!res.ok) throw new Error('Failed to update group config');
}

export async function updateSubGroupConfig(
  deviceId: string,
  chartGroup: string,
  subGroup: string,
  description?: string,
  sortOrder?: number
): Promise<void> {
  const res = await fetch(`${API_URL}/devices/${deviceId}/renames/subgroup-config`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ chart_group: chartGroup, sub_group: subGroup, sub_group_description: description, sub_group_sort_order: sortOrder }),
  });
  if (!res.ok) throw new Error('Failed to update subgroup config');
}

export async function getDeviceGroups(): Promise<DeviceGroup[]> {
  const res = await fetch(`${API_URL}/device-groups`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to fetch device groups');
  return res.json();
}

export async function createDeviceGroup(name: string): Promise<{ id: number; name: string }> {
  const res = await fetch(`${API_URL}/device-groups`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error('Failed to create device group');
  return res.json();
}

export async function updateDeviceGroup(id: number, name: string): Promise<void> {
  const res = await fetch(`${API_URL}/device-groups/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error('Failed to update device group');
}

export async function deleteDeviceGroup(id: number): Promise<void> {
  const res = await fetch(`${API_URL}/device-groups/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete device group');
}

export async function reorderDeviceGroups(order: number[]): Promise<void> {
  const res = await fetch(`${API_URL}/device-groups/reorder`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ order }),
  });
  if (!res.ok) throw new Error('Failed to reorder device groups');
}

export async function setDeviceGroup(deviceId: string, groupId: number | null): Promise<void> {
  const res = await fetch(`${API_URL}/devices/${deviceId}/group`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ group_id: groupId }),
  });
  if (!res.ok) throw new Error('Failed to set device group');
}

export async function exportDeviceData(
  deviceId: string,
  fields: string[],
  from: string,
  to: string,
  format: 'csv' | 'json'
): Promise<Blob> {
  const params = new URLSearchParams({
    fields: fields.join(','),
    from,
    to,
    format,
  });
  const res = await fetch(
    `${API_URL}/devices/${encodeURIComponent(deviceId)}/export?${params}`,
    { headers: getHeaders() }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Export failed' }));
    throw new Error(err.error || 'Export failed');
  }
  return res.blob();
}
