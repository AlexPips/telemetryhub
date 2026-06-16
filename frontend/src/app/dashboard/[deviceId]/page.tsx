'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useLocalStorage } from '@/lib/use-local-storage';
import { FieldSelector, type FieldLabel } from '@/components/field-selector';
import {
  getDevice,
  getDeviceFields,
  getReadings,
  getRenames,
  createRename,
  updateRename,
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
    const stored = storedFields.filter((f) => fields.includes(f));
    if (stored.length > 0) return;
    autoSelected.current = true;
    setStoredFields(fields.slice(0, 5));
  }, [fields, fieldsHydrated, storedFields, setStoredFields]);

  // Fetch renames
  useEffect(() => {
    if (!user || !deviceId) return;
    getRenames(deviceId)
      .then(setRenames)
      .catch(() => setRenames([]));
  }, [user, deviceId]);

  const fetchReadings = useCallback(async () => {
    if (!deviceId || selectedFields.length === 0) return;

    const now = new Date();
    let from;
    switch (timeRange) {
      case '1h':
        from = new Date(now.getTime() - 1 * 60 * 60 * 1000);
        break;
      case '6h':
        from = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        break;
      case '24h':
        from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    try {
      const result = await getReadings(
        deviceId,
        selectedFields,
        from.toISOString(),
        now.toISOString()
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

      <h1 className="page-title">{device?.name || `Device: ${deviceId}`}</h1>

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
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
          >
            <option value="1h">1 Hour</option>
            <option value="6h">6 Hours</option>
            <option value="24h">24 Hours</option>
            <option value="7d">7 Days</option>
            <option value="30d">30 Days</option>
          </select>
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
      </div>

      {/* Per-field Chart Grid */}
      {selectedFields.length === 0 ? (
        <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)' }}>
            Select at least one field to display data.
          </p>
        </div>
      ) : readings.length === 0 ? (
        <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)' }}>
            No data available for selected fields and time range.
          </p>
        </div>
      ) : (
        <div className="chart-grid">
          {selectedFields.map((field, i) => (
            <FieldChart
              key={field}
              field={field}
              index={i}
              readings={readings}
              displayName={getDisplayName(field)}
              unit={getUnit(field)}
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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="field-select">
      <button
        className="field-select-trigger"
        type="button"
        onClick={() => setOpen(!open)}
      >
        <span className={value ? '' : 'field-select-placeholder'}>
          {value || '-- Select field --'}
        </span>
        <span className="field-select-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="field-select-dropdown">
          {fields.map((f) => (
            <button
              key={f}
              className={
                'field-select-option' + (f === value ? ' selected' : '')
              }
              type="button"
              onClick={() => {
                onChange(f);
                setOpen(false);
              }}
            >
              {f}
            </button>
          ))}
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
}: {
  field: string;
  index: number;
  readings: ReadingData[];
  displayName: string;
  unit: string;
}) {
  const fieldData = readings.filter((r) => r.field_name === field);
  const color = COLORS[index % COLORS.length];
  const isMobile = useIsMobile();

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
        <span className="field-chart-dot" style={{ background: color }} />
        <span className="field-chart-title">{displayName}</span>
        {unit && <span className="field-chart-unit">({unit})</span>}
      </div>
      <div className="field-chart-body">
        {fieldData.length === 0 ? (
          <p className="chart-empty">No data</p>
        ) : (
          <Line
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
        )}
      </div>
    </div>
  );
}
