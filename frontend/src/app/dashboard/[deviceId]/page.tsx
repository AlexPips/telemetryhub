'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useLocalStorage } from '@/lib/use-local-storage';
import { FieldSelector, type FieldLabel } from '@/components/field-selector';
import { TimeRangeSelector } from '@/components/time-range-selector';
import {
  getDevice,
  getDeviceFields,
  getReadings,
  getRenames,
  createRename,
  updateRename,
  updateDevice,
  deleteRename,
  type Device,
  type ReadingData,
  type FieldRename,
} from '@/lib/api';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';

ChartJS.register(
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

export default function DeviceDetailPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const deviceId = params.deviceId as string;

  const [device, setDevice] = useState<Device | null>(null);
  const [deviceLoading, setDeviceLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [editNameInput, setEditNameInput] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [fields, setFields] = useState<string[]>([]);
  const [storedFields, setStoredFields, fieldsHydrated] = useLocalStorage<string[]>(
    deviceId ? `telemetryhub:device:${deviceId}:fields` : 'telemetryhub:device:_:fields',
    []
  );
  const [storedTimeRange, setStoredTimeRange] = useLocalStorage<string>(
    deviceId ? `telemetryhub:device:${deviceId}:timerange` : 'telemetryhub:device:_:timerange',
    '24h'
  );
  const timeRange = storedTimeRange;
  const setTimeRange = setStoredTimeRange;
  const [readings, setReadings] = useState<ReadingData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const autoSelected = useRef(false);
  const [resetAllCounter, setResetAllCounter] = useState(0);
  const selectedFields = useMemo(() => {
    if (!fieldsHydrated) return [];
    return storedFields.filter((f) => fields.includes(f));
  }, [storedFields, fields, fieldsHydrated]);

  const lastUpdated = useMemo(() => {
    if (readings.length === 0) return null;
    let latest = 0;
    for (const r of readings) {
      const t = new Date(r.bucket).getTime();
      if (t > latest) latest = t;
    }
    return latest > 0 ? new Date(latest) : null;
  }, [readings]);

  // Rename state
  const [renames, setRenames] = useState<FieldRename[]>([]);
  const [editingRename, setEditingRename] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [editChartGroup, setEditChartGroup] = useState('');
  const [addingRename, setAddingRename] = useState(false);
  const [newRawField, setNewRawField] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newChartGroup, setNewChartGroup] = useState('');

  // Group selected fields by chart_group for combined charts
  const chartGroups = useMemo(() => {
    if (!fieldsHydrated) return { groups: [], ungrouped: [] };
    const fieldGroupMap = new Map<string, string>();
    for (const r of renames) {
      if (r.chart_group?.trim()) {
        fieldGroupMap.set(r.raw_field, r.chart_group.trim());
      }
    }
    const groupMap = new Map<string, string[]>();
    const ungrouped: string[] = [];
    for (const field of selectedFields) {
      const group = fieldGroupMap.get(field);
      if (group) {
        const existing = groupMap.get(group);
        if (existing) {
          existing.push(field);
        } else {
          groupMap.set(group, [field]);
        }
      } else {
        ungrouped.push(field);
      }
    }
    const groups = Array.from(groupMap.entries()).map(
      ([groupName, fields]) => ({ groupName, fields })
    );
    return { groups, ungrouped };
  }, [selectedFields, renames, fieldsHydrated]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user || !deviceId) return;
    getDevice(deviceId)
      .then(setDevice)
      .catch(() => setDevice(null))
      .finally(() => setDeviceLoading(false));
  }, [user, deviceId]);

  useEffect(() => {
    if (!user || !deviceId) return;
    getDeviceFields(deviceId)
      .then((f) => {
        setFields(f);
      })
      .catch(() => setFields([]))
      .finally(() => setIsLoading(false));
  }, [user, deviceId]);

  useEffect(() => {
    if (fields.length === 0 || !fieldsHydrated) return;
    if (autoSelected.current) return;
    autoSelected.current = true;
    const stored = storedFields.filter((f) => fields.includes(f));
    if (stored.length > 0) return;
    setStoredFields(fields.slice(0, 5));
  }, [fields, fieldsHydrated, storedFields, setStoredFields]);

  // Fetch renames
  useEffect(() => {
    if (!user || !deviceId) return;
    getRenames(deviceId)
      .then(setRenames)
      .catch(() => setRenames([]));
  }, [user, deviceId]);

  const isAdmin = user?.role === 'admin';

  function startEditingName() {
    setEditNameInput(device?.name || '');
    setEditingName(true);
  }

  async function handleNameSave() {
    if (!device || !editNameInput.trim() || editNameInput.trim() === device.name) {
      setEditingName(false);
      return;
    }
    setNameSaving(true);
    try {
      await updateDevice(deviceId, { name: editNameInput.trim() });
      setDevice({ ...device, name: editNameInput.trim() });
      setEditingName(false);
    } catch {
      getDevice(deviceId).then(setDevice).catch(() => {});
    } finally {
      setNameSaving(false);
    }
  }

  function handleNameKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      handleNameSave();
    } else if (e.key === 'Escape') {
      setEditingName(false);
    }
  }

  const fetchReadings = useCallback(async () => {
    if (!deviceId || selectedFields.length === 0) return;

    const to = new Date();
    let from: Date;
    switch (timeRange) {
      case '1h':
        from = new Date(to.getTime() - 1 * 60 * 60 * 1000);
        break;
      case '6h':
        from = new Date(to.getTime() - 6 * 60 * 60 * 1000);
        break;
      case '24h':
        from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
    }

    try {
      const result = await getReadings(
        deviceId,
        selectedFields,
        from.toISOString(),
        to.toISOString()
      );
      setReadings(result.data);
    } catch {
      setReadings([]);
    }
  }, [deviceId, selectedFields, timeRange]);

  useEffect(() => {
    fetchReadings();
  }, [fetchReadings]);

  // Rename handlers
  const handleEditStart = (r: FieldRename) => {
    setEditingRename(r.raw_field);
    setEditDisplayName(r.display_name || '');
    setEditUnit(r.unit || '');
    setEditChartGroup(r.chart_group || '');
  };

  const handleEditSave = async (rawField: string) => {
    try {
      await updateRename(
        deviceId,
        rawField,
        editDisplayName || undefined,
        editUnit || undefined,
        editChartGroup.trim() || undefined
      );
      setEditingRename(null);
      const updated = await getRenames(deviceId);
      setRenames(updated);
      fetchReadings();
    } catch {
      alert('Failed to save');
    }
  };

  const handleDelete = async (rawField: string) => {
    if (!confirm('Delete label for "' + rawField + '"?')) return;
    try {
      await deleteRename(deviceId, rawField);
      setRenames(renames.filter((r) => r.raw_field !== rawField));
      fetchReadings();
    } catch {
      alert('Failed to delete');
    }
  };

  const handleAddRename = async () => {
    if (!newRawField.trim()) return;
    try {
      await createRename(
        deviceId,
        newRawField.trim(),
        newDisplayName.trim() || undefined,
        newUnit.trim() || undefined,
        newChartGroup.trim() || undefined
      );
      setAddingRename(false);
      setNewRawField('');
      setNewDisplayName('');
      setNewUnit('');
      setNewChartGroup('');
      const updated = await getRenames(deviceId);
      setRenames(updated);
      fetchReadings();
    } catch {
      alert('Failed to create label');
    }
  };

  const getDisplayName = (field: string): string => {
    const rename = renames.find((r) => r.raw_field === field);
    return rename?.display_name || field;
  };

  const getUnit = (field: string): string => {
    const rename = renames.find((r) => r.raw_field === field);
    return rename?.unit || '';
  };

  const labelForField = useCallback(
    (field: string): FieldLabel => ({
      field,
      displayName: renames.find((r) => r.raw_field === field)?.display_name,
      unit: renames.find((r) => r.raw_field === field)?.unit,
      chartGroup: renames.find((r) => r.raw_field === field)?.chart_group,
    }),
    [renames]
  );

  if (authLoading || !user)
    return <div className="page-loading">Loading...</div>;

  return (
    <div className="page-container">
      {/* Breadcrumb */}
      <div className="breadcrumb">
        <Link href="/dashboard">Dashboard</Link>
        <span className="breadcrumb-sep">/</span>
        <span>{device?.name || deviceId}</span>
      </div>

      <div className="page-title-row">
        {editingName ? (
          <div className="page-title-edit-group">
            <input
              className="page-title-input"
              value={editNameInput}
              onChange={(e) => setEditNameInput(e.target.value)}
              onKeyDown={handleNameKeyDown}
              onBlur={handleNameSave}
              autoFocus
              disabled={nameSaving}
            />
            {nameSaving && <span className="page-title-saving">Saving…</span>}
          </div>
        ) : (
          <h1 className="page-title">
            <span>{device?.name || `Device: ${deviceId}`}</span>
            {isAdmin && device && (
              <button
                type="button"
                className="page-title-edit-btn"
                onClick={startEditingName}
                aria-label="Rename device"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            )}
          </h1>
        )}
      </div>

      {device && (
        <div className="device-info-bar">
          <span className="device-info-item">ID: {device.id}</span>
          <span className="device-info-sep">|</span>
          <span className="device-info-item">Type: {device.device_type}</span>
          <span className="device-info-sep">|</span>
          <span className="device-info-item">Broker: {device.broker_name || '—'}</span>
          <span className="device-info-sep">|</span>
          <span className="device-info-item">Fields: {device.field_count}</span>
        </div>
      )}

      {/* Controls */}
      <div className="chart-controls">
        <div>
          <label className="control-label">Time Range</label>
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
        </div>
        <div>
          <label className="control-label">Fields</label>
          <FieldSelector
            fields={fields}
            selected={selectedFields}
            onChange={setStoredFields}
            labelFor={labelForField}
          />
        </div>
        {lastUpdated && (
          <div className="last-updated">
            <span className="last-updated-dot" />
            <span>
              Last data:{' '}
              {lastUpdated.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
              })}
            </span>
          </div>
        )}
        <div style={{ marginLeft: 'auto', marginTop: '20px' }}>
          <button
            className="secondary"
            onClick={() => setResetAllCounter((c) => c + 1)}
            style={{ fontSize: '13px' }}
          >
            Reset All
          </button>
        </div>
      </div>

      {selectedFields.length === 0 ? (
        <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)' }}>
            Select at least one field to display data.
          </p>
        </div>
      ) : readings.length === 0 ? (
        <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)' }}>
            No data for this time range.
          </p>
        </div>
      ) : (
        <div className="chart-grid">
          {chartGroups.groups.map((group) => (
            <GroupChart
              key={group.groupName}
              groupName={group.groupName}
              fields={group.fields}
              readings={readings}
              renames={renames}
              resetTrigger={resetAllCounter}
            />
          ))}
          {chartGroups.ungrouped.map((field, i) => (
            <FieldChart
              key={field}
              field={field}
              index={i}
              readings={readings}
              displayName={getDisplayName(field)}
              unit={getUnit(field)}
              resetTrigger={resetAllCounter}
            />
          ))}
        </div>
      )}

      {/* Field Labels (Rename) Section */}
      <div className="card" style={{ marginTop: '24px' }}>
        <div className="rename-header">
          <h2 className="rename-title">Field Labels</h2>
          <button className="primary" onClick={() => setAddingRename(true)}>
            + Add Label
          </button>
        </div>

        {/* Add new rename form */}
        {addingRename && (
          <div className="rename-form">
            <div className="rename-form-grid">
              <div>
                <label className="control-label">Raw Field</label>
                <FieldSelect
                  fields={fields}
                  value={newRawField}
                  onChange={setNewRawField}
                />
              </div>
              <div>
                <label className="control-label">Display Name</label>
                <input
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="e.g. Temperature"
                />
              </div>
              <div>
                <label className="control-label">Unit</label>
                <input
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  placeholder="e.g. °C"
                />
              </div>
              <div>
                <label className="control-label">Group</label>
                <input
                  value={newChartGroup}
                  onChange={(e) => setNewChartGroup(e.target.value)}
                  placeholder="e.g. Environment"
                />
              </div>
            </div>
            <div className="rename-form-actions">
              <button className="primary" onClick={handleAddRename}>
                Save
              </button>
              <button
                className="secondary"
                onClick={() => {
                  setAddingRename(false);
                  setNewRawField('');
                  setNewDisplayName('');
                  setNewUnit('');
                  setNewChartGroup('');
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Existing renames list */}
        {renames.length === 0 && !addingRename ? (
          <p className="rename-empty">
            No custom labels configured. Add labels to give fields friendly
            names and units.
          </p>
        ) : (
          <div className="rename-list">
            {renames.map((r) => {
              const fieldIndex = fields.indexOf(r.raw_field);
              const color =
                fieldIndex >= 0
                  ? COLORS[fieldIndex % COLORS.length]
                  : '#94a3b8';
              const isEditing = editingRename === r.raw_field;

              return (
                <div key={r.raw_field} className="rename-row">
                  <span
                    className="rename-dot"
                    style={{ background: color }}
                  />
                  <span className="rename-raw">{r.raw_field}</span>
                  <span className="rename-arrow">&rarr;</span>

                  {isEditing ? (
                    <>
                      <input
                        className="rename-input"
                        value={editDisplayName}
                        onChange={(e) => setEditDisplayName(e.target.value)}
                        placeholder="Display name"
                      />
                      <input
                        className="rename-input rename-input-unit"
                        value={editUnit}
                        onChange={(e) => setEditUnit(e.target.value)}
                        placeholder="Unit"
                      />
                      <input
                        className="rename-input"
                        value={editChartGroup}
                        onChange={(e) => setEditChartGroup(e.target.value)}
                        placeholder="Group"
                      />
                      <button
                        className="primary rename-btn"
                        onClick={() => handleEditSave(r.raw_field)}
                      >
                        Save
                      </button>
                      <button
                        className="secondary rename-btn"
                        onClick={() => setEditingRename(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="rename-display">
                        {r.display_name || r.raw_field}
                        {r.unit ? (
                          <span className="rename-unit">
                            {' '}({r.unit})
                          </span>
                        ) : null}
                        {r.chart_group ? (
                          <span className="rename-group-badge">
                            {r.chart_group}
                          </span>
                        ) : null}
                      </span>
                      <button
                        className="secondary rename-btn"
                        onClick={() => handleEditStart(r)}
                      >
                        Edit
                      </button>
                      <button
                        className="danger rename-btn"
                        onClick={() => handleDelete(r.raw_field)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Custom Field Select ──

function FieldSelect({
  fields,
  value,
  onChange,
}: {
  fields: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open]);

  const filteredFields = useMemo(() => {
    if (!search.trim()) return fields;
    const q = search.toLowerCase();
    return fields.filter((f) => f.toLowerCase().includes(q));
  }, [fields, search]);

  return (
    <div ref={ref} className="field-select">
      <button
        className="field-select-trigger"
        type="button"
        onClick={() => {
          setOpen(!open);
          setSearch('');
        }}
      >
        <span className={value ? '' : 'field-select-placeholder'}>
          {value || '-- Select field --'}
        </span>
        <span className="field-select-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="field-select-dropdown">
          <div
            style={{
              padding: '6px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <input
              ref={searchRef}
              type="text"
              placeholder="Search fields…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', fontSize: '12px', padding: '6px 8px' }}
            />
          </div>
          <div className="field-select-list" style={{ maxHeight: '180px', overflowY: 'auto' }}>
            {filteredFields.length === 0 ? (
              <div
                className="field-select-placeholder"
                style={{
                  padding: '12px',
                  textAlign: 'center',
                  fontSize: '12px',
                }}
              >
                No fields match
              </div>
            ) : (
              filteredFields.map((f) => (
                <button
                  key={f}
                  className={
                    'field-select-option' + (f === value ? ' selected' : '')
                  }
                  type="button"
                  onClick={() => {
                    onChange(f);
                    setOpen(false);
                    setSearch('');
                  }}
                >
                  {f}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

// ── Per-Field Chart Component ──

function FieldChart({
  field,
  index,
  readings,
  displayName,
  unit,
  resetTrigger,
}: {
  field: string;
  index: number;
  readings: ReadingData[];
  displayName: string;
  unit: string;
  resetTrigger?: number;
}) {
  const allFieldData = useMemo(() => readings.filter((r) => r.field_name === field), [readings, field]);
  const [zoomRange, setZoomRange] = useState<{ from: string; to: string } | null>(null);

  useEffect(() => {
    setZoomRange(null);
  }, [resetTrigger]);
  const color = COLORS[index % COLORS.length];
  const isMobile = useIsMobile();
  const chartRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{
    active: boolean;
    startX: number;
    curX: number;
  } | null>(null);

  function getChartX(clientX: number): number {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    return clientX - rect.left;
  }

  function handleMouseDown(e: React.MouseEvent) {
    setDragState({ active: true, startX: getChartX(e.clientX), curX: getChartX(e.clientX) });
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!dragState?.active) return;
    setDragState({ ...dragState, curX: getChartX(e.clientX) });
  }

  function handleMouseUp() {
    if (!dragState?.active) return;
    const { startX, curX } = dragState;
    const diff = Math.abs(curX - startX);
    setDragState(null);
    if (diff < 10) return;

    const chart = chartRef.current;
    if (!chart?.scales?.x) return;
    const xScale = chart.scales.x;
    const from = new Date(xScale.getValueForPixel(Math.min(startX, curX))).toISOString();
    const to = new Date(xScale.getValueForPixel(Math.max(startX, curX))).toISOString();
    setZoomRange({ from, to });
  }

  function handleResetZoom() {
    setZoomRange(null);
  }

  const fieldData = useMemo(() => {
    if (!zoomRange) return allFieldData;
    const from = new Date(zoomRange.from).getTime();
    const to = new Date(zoomRange.to).getTime();
    return allFieldData.filter((r) => {
      const t = new Date(r.bucket).getTime();
      return t >= from && t <= to;
    });
  }, [allFieldData, zoomRange]);

  const dataset = {
    label: displayName,
    data: fieldData.map((r) => ({
      x: new Date(r.bucket),
      y: r.value,
    })),
    borderColor: color,
    backgroundColor: color + '20',
    tension: 0.3,
    pointRadius: 0,
    borderWidth: 2,
  };

  return (
    <div className="field-chart-card">
      <div className="field-chart-header">
        <div className="field-chart-header-left">
          <span className="field-chart-dot" style={{ background: color }} />
          <span className="field-chart-title">{displayName}</span>
          {unit && <span className="field-chart-unit">({unit})</span>}
        </div>
        {zoomRange && (
          <div className="field-chart-header-right">
            <span className="zoom-indicator">
              {new Date(zoomRange.from).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
              {' — '}
              {new Date(zoomRange.to).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
            </span>
            <button className="secondary" onClick={handleResetZoom} style={{ padding: '4px 10px', fontSize: '12px' }}>
              ← Reset
            </button>
          </div>
        )}
      </div>
      <div
        ref={containerRef}
        className="field-chart-body"
        style={{ position: 'relative', cursor: dragState?.active ? 'crosshair' : 'default' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { if (dragState?.active) handleMouseUp(); }}
        onDoubleClick={handleResetZoom}
      >
        <Line
          ref={chartRef}
          data={{ datasets: [dataset] }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
              x: {
                type: 'time',
                time: {
                  tooltipFormat: 'PPpp',
                  displayFormats: {
                    hour: 'HH:mm',
                    day: 'MMM d',
                  },
                },
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: {
                  color: '#94a3b8',
                  maxTicksLimit: isMobile ? 4 : 8,
                  maxRotation: isMobile ? 45 : 0,
                  autoSkip: false,
                  font: { size: isMobile ? 10 : 12 },
                },
                title: {
                  display: true,
                  text: 'Time',
                  color: '#94a3b8',
                  font: { size: isMobile ? 10 : 12 },
                },
              },
              y: {
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: {
                  color: '#94a3b8',
                  maxTicksLimit: isMobile ? 4 : 8,
                  font: { size: isMobile ? 10 : 12 },
                },
                title: {
                  display: !!unit,
                  text: unit,
                  color: '#94a3b8',
                  font: { size: isMobile ? 10 : 12 },
                },
              },
            },
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: function (context) {
                    let label = context.dataset.label || '';
                    if (label) label += ': ';
                    const val = context.parsed.y;
                    if (val !== null) {
                      label += val.toFixed(1);
                      if (unit) label += ' ' + unit;
                    }
                    return label;
                  },
                },
              },
            },
            interaction: {
              mode: 'nearest',
              axis: 'x',
              intersect: false,
            },
          }}
        />
        {dragState?.active && (
          <div
            style={{
              position: 'absolute',
              left: Math.min(dragState.startX, dragState.curX),
              width: Math.abs(dragState.curX - dragState.startX),
              top: 0,
              bottom: 0,
              backgroundColor: 'rgba(59,130,246,0.15)',
              borderLeft: '1px solid rgba(59,130,246,0.5)',
              borderRight: '1px solid rgba(59,130,246,0.5)',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          />
        )}
      </div>
    </div>
  );
}

// ── Grouped Chart Component ──

function GroupChart({
  groupName,
  fields,
  readings,
  renames,
  resetTrigger,
}: {
  groupName: string;
  fields: string[];
  readings: ReadingData[];
  renames: FieldRename[];
  resetTrigger?: number;
}) {
  const isMobile = useIsMobile();
  const chartRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoomRange, setZoomRange] = useState<{ from: string; to: string } | null>(null);

  useEffect(() => {
    setZoomRange(null);
  }, [resetTrigger]);
  const [dragState, setDragState] = useState<{
    active: boolean;
    startX: number;
    curX: number;
  } | null>(null);

  function getChartX(clientX: number): number {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    return clientX - rect.left;
  }

  function handleMouseDown(e: React.MouseEvent) {
    setDragState({ active: true, startX: getChartX(e.clientX), curX: getChartX(e.clientX) });
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!dragState?.active) return;
    setDragState({ ...dragState, curX: getChartX(e.clientX) });
  }

  function handleMouseUp() {
    if (!dragState?.active) return;
    const { startX, curX } = dragState;
    const diff = Math.abs(curX - startX);
    setDragState(null);
    if (diff < 10) return;

    const chart = chartRef.current;
    if (!chart?.scales?.x) return;
    const xScale = chart.scales.x;
    const from = new Date(xScale.getValueForPixel(Math.min(startX, curX))).toISOString();
    const to = new Date(xScale.getValueForPixel(Math.max(startX, curX))).toISOString();
    setZoomRange({ from, to });
  }

  function handleResetZoom() {
    setZoomRange(null);
  }

  const fieldLabel = useCallback(
    (field: string) => {
      const rename = renames.find((r) => r.raw_field === field);
      return {
        displayName: rename?.display_name || field,
        unit: rename?.unit || '',
      };
    },
    [renames]
  );

  const datasets = useMemo(() => {
    const filtered = zoomRange
      ? readings.filter((r) => {
          const t = new Date(r.bucket).getTime();
          return t >= new Date(zoomRange.from).getTime() && t <= new Date(zoomRange.to).getTime();
        })
      : readings;

    return fields.map((field, i) => {
      const fieldData = filtered.filter((r) => r.field_name === field);
      const label = fieldLabel(field);
      const color = COLORS[i % COLORS.length];

      return {
        label: label.displayName,
        data: fieldData.map((r) => ({
          x: new Date(r.bucket),
          y: r.value,
        })),
        borderColor: color,
        backgroundColor: color + '20',
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2,
      };
    });
  }, [fields, readings, zoomRange, fieldLabel]);

  const primaryUnit = fields.reduce((unit, field) => {
    if (unit) return unit;
    return fieldLabel(field).unit;
  }, '');

  return (
    <div className="field-chart-card">
      <div className="field-chart-header">
        <div className="field-chart-header-left">
          <span className="field-chart-title">{groupName}</span>
        </div>
        {zoomRange && (
          <div className="field-chart-header-right">
            <span className="zoom-indicator">
              {new Date(zoomRange.from).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
              {' — '}
              {new Date(zoomRange.to).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
            </span>
            <button className="secondary" onClick={handleResetZoom} style={{ padding: '4px 10px', fontSize: '12px' }}>
              ← Reset
            </button>
          </div>
        )}
      </div>
      <div
        ref={containerRef}
        className="field-chart-body"
        style={{ position: 'relative', cursor: dragState?.active ? 'crosshair' : 'default' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { if (dragState?.active) handleMouseUp(); }}
        onDoubleClick={handleResetZoom}
      >
        <Line
          ref={chartRef}
          data={{ datasets }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
              x: {
                type: 'time',
                time: {
                  tooltipFormat: 'PPpp',
                  displayFormats: {
                    hour: 'HH:mm',
                    day: 'MMM d',
                  },
                },
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: {
                  color: '#94a3b8',
                  maxTicksLimit: isMobile ? 4 : 8,
                  maxRotation: isMobile ? 45 : 0,
                  autoSkip: false,
                  font: { size: isMobile ? 10 : 12 },
                },
                title: {
                  display: true,
                  text: 'Time',
                  color: '#94a3b8',
                  font: { size: isMobile ? 10 : 12 },
                },
              },
              y: {
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: {
                  color: '#94a3b8',
                  maxTicksLimit: isMobile ? 4 : 8,
                  font: { size: isMobile ? 10 : 12 },
                },
                title: primaryUnit
                  ? {
                      display: true,
                      text: primaryUnit,
                      color: '#94a3b8',
                      font: { size: isMobile ? 10 : 12 },
                    }
                  : undefined,
              },
            },
            plugins: {
              legend: {
                display: true,
                position: 'top',
                labels: {
                  color: '#94a3b8',
                  font: { size: isMobile ? 11 : 12 },
                  boxWidth: 7,
                  boxHeight: 7,
                  padding: 8,
                  usePointStyle: false,
                },
              },
              tooltip: {
                callbacks: {
                  label: function (context) {
                    let label = context.dataset.label || '';
                    if (label) label += ': ';
                    const val = context.parsed.y;
                    if (val !== null) {
                      label += val.toFixed(1);
                      const dsIndex = context.datasetIndex;
                      if (dsIndex !== undefined && dsIndex < fields.length) {
                        const unit = fieldLabel(fields[dsIndex]).unit;
                        if (unit) label += ' ' + unit;
                      }
                    }
                    return label;
                  },
                },
              },
            },
            interaction: {
              mode: 'nearest',
              axis: 'x',
              intersect: false,
            },
          }}
        />
        {dragState?.active && (
          <div
            style={{
              position: 'absolute',
              left: Math.min(dragState.startX, dragState.curX),
              width: Math.abs(dragState.curX - dragState.startX),
              top: 0,
              bottom: 0,
              backgroundColor: 'rgba(59,130,246,0.15)',
              borderLeft: '1px solid rgba(59,130,246,0.5)',
              borderRight: '1px solid rgba(59,130,246,0.5)',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          />
        )}
      </div>
    </div>
  );
}
