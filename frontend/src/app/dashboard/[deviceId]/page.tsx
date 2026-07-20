'use client';

import { useEffect, useState, useCallback, useRef, useMemo, Fragment } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useLocalStorage } from '@/lib/use-local-storage';
import { FieldSelector, type FieldLabel } from '@/components/field-selector';
import { TimeRangeSelector } from '@/components/time-range-selector';
import DeviceSettingsModal from '@/components/device-settings-modal';
import { Button } from '@/components/ui/button';
import {
  getDevice,
  getDeviceFields,
  getReadings,
  getRenames,
  type Device,
  type ReadingData,
  type FieldRename,
} from '@/lib/api';
import { Loader2, RotateCcw } from 'lucide-react';

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

  const [renames, setRenames] = useState<FieldRename[]>([]);

  const chartGroups = useMemo(() => {
    if (!fieldsHydrated) return { groups: [], ungrouped: [] };
    // Build maps: field → group, field → subgroup, field → sort orders
    const fieldGroupMap = new Map<string, string>();
    const fieldSubGroupMap = new Map<string, string>();
    const fieldGroupDescMap = new Map<string, string>();
    const fieldSubGroupDescMap = new Map<string, string>();
    const groupSortMap = new Map<string, number>();
    const subGroupSortMap = new Map<string, number>();
    for (const r of renames) {
      if (r.chart_group?.trim()) {
        fieldGroupMap.set(r.raw_field, r.chart_group.trim());
      }
      if (r.sub_group?.trim()) {
        fieldSubGroupMap.set(r.raw_field, r.sub_group.trim());
      }
      if (r.chart_group?.trim() && r.group_description?.trim()) {
        fieldGroupDescMap.set(r.chart_group.trim(), r.group_description.trim());
      }
      if (r.sub_group?.trim() && r.sub_group_description?.trim()) {
        fieldSubGroupDescMap.set(r.sub_group.trim(), r.sub_group_description.trim());
      }
      if (r.chart_group?.trim() && r.group_sort_order != null) {
        groupSortMap.set(r.chart_group.trim(), r.group_sort_order);
      }
      if (r.sub_group?.trim() && r.sub_group_sort_order != null) {
        subGroupSortMap.set(r.sub_group.trim(), r.sub_group_sort_order);
      }
    }
    // Partition selected fields into grouped vs ungrouped
    const chartGroupMap = new Map<string, string[]>();
    const ungrouped: string[] = [];
    for (const field of selectedFields) {
      const group = fieldGroupMap.get(field);
      if (group) {
        const existing = chartGroupMap.get(group);
        if (existing) {
          existing.push(field);
        } else {
          chartGroupMap.set(group, [field]);
        }
      } else {
        ungrouped.push(field);
      }
    }
    // Build group objects, sorting subgroups by sort_order
    const groups = Array.from(chartGroupMap.entries()).map(([groupName, flds]) => {
      const subGroupFields = new Map<string, string[]>();
      const soloFields: string[] = [];
      for (const field of flds) {
        const sg = fieldSubGroupMap.get(field);
        if (sg) {
          const existing = subGroupFields.get(sg);
          if (existing) {
            existing.push(field);
          } else {
            subGroupFields.set(sg, [field]);
          }
        } else {
          soloFields.push(field);
        }
      }
      const subGroups = Array.from(subGroupFields.entries())
        .map(([subGroupName, sflds]) => ({
          subGroupName,
          fields: sflds,
          description: fieldSubGroupDescMap.get(subGroupName) || undefined,
          sortOrder: subGroupSortMap.get(subGroupName) ?? 0,
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.subGroupName.localeCompare(b.subGroupName));
      return {
        groupName,
        subGroups,
        soloFields,
        description: fieldGroupDescMap.get(groupName) || undefined,
        sortOrder: groupSortMap.get(groupName) ?? 0,
      };
    });
    // Sort groups by sort_order
    groups.sort((a, b) => a.sortOrder - b.sortOrder || a.groupName.localeCompare(b.groupName));
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

  useEffect(() => {
    if (!user || !deviceId) return;
    getRenames(deviceId)
      .then(setRenames)
      .catch(() => setRenames([]));
  }, [user, deviceId]);

  // 1. Replace the existing fields useEffect with this:
  const fetchFields = useCallback(() => {
    if (!user || !deviceId) return;
    getDeviceFields(deviceId)
      .then((f) => setFields(f))
      .catch(() => setFields([]))
      .finally(() => setIsLoading(false));
  }, [user, deviceId]);

  useEffect(() => {
    fetchFields();
  }, [fetchFields]);

// 2. Replace the existing renames useEffect with this:
  const fetchRenames = useCallback(() => {
    if (!user || !deviceId) return;
    getRenames(deviceId)
      .then(setRenames)
      .catch(() => setRenames([]));
  }, [user, deviceId]);

  useEffect(() => {
    fetchRenames();
  }, [fetchRenames]);

  
  const isAdmin = user?.role === 'admin';

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

  function handleDeviceUpdate(updated: Device) {
    setDevice(updated);
  }

  const getDisplayName = (field: string): string => {
    const rename = renames.find((r) => r.raw_field === field);
    return rename?.display_name || field;
  };

  const getUnit = (field: string): string => {
    const rename = renames.find((r) => r.raw_field === field);
    return rename?.unit || '';
  };

  const labelForField = useCallback(
    (field: string): FieldLabel => {
      const rename = renames.find((r) => r.raw_field === field);
      return {
        field,
        displayName: rename?.display_name,
        unit: rename?.unit,
        chartGroup: rename?.chart_group,
        subGroup: rename?.sub_group,
        groupDescription: rename?.group_description,
        subGroupDescription: rename?.sub_group_description,
        groupSortOrder: rename?.group_sort_order,
        subGroupSortOrder: rename?.sub_group_sort_order,
      };
    },
    [renames]
  );

  if (authLoading || !user)
    return (
      <div className="flex min-h-svh w-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );

  return (
    <div className="w-full mx-auto p-6 max-md:p-4">
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
        <span className="text-border">/</span>
        <span className="text-foreground font-medium">{device?.name || deviceId}</span>
      </div>

      {/* Title Row */}
      <div className="flex items-center justify-between gap-4 mb-6 pb-6 border-b border-border">
        <h1 className="inline-flex items-center gap-3 text-2xl font-bold tracking-tight text-foreground">
          <span>{device?.name || `Device: ${deviceId}`}</span>
          {isAdmin && device && (
            <DeviceSettingsModal
              device={device}
              deviceId={deviceId}
              fields={fields}
              renames={renames}
              onDeviceUpdate={handleDeviceUpdate}
              onDeviceDelete={() => router.push('/dashboard')}
              onRenamesChange={fetchRenames}
              onFieldsChange={fetchFields}
            />
          )}
        </h1>
      </div>

      {device && (
        <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-card p-3.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">ID: <span className="text-muted-foreground">{device.id}</span></span>
          <span className="text-border">|</span>
          <span className="font-medium text-foreground/80">Broker: <span className="text-muted-foreground">{device.broker_name || '—'}</span></span>
          <span className="text-border">|</span>
          <span className="font-medium text-foreground/80">Fields: <span className="text-muted-foreground">{device.field_count}</span></span>
        </div>
      )}

      {/* Controls */}
      <div className="mb-8 flex flex-wrap items-end gap-6 max-md:flex-col max-md:items-start">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground">Time Range</label>
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground">Fields</label>
          <FieldSelector
            fields={fields}
            selected={selectedFields}
            onChange={setStoredFields}
            labelFor={labelForField}
          />
        </div>
        {lastUpdated && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-xs text-muted-foreground">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
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
        <div className="ml-auto max-md:ml-0 max-md:mt-2">
          <Button
            variant="outline"
            onClick={() => setResetAllCounter((c) => c + 1)}
          >
            <RotateCcw className="h-4 w-4" />
            Reset All
          </Button>
        </div>
      </div>

      {/* Charts Section */}
      {selectedFields.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border p-12 text-center">
          <h3 className="mb-1 text-lg font-medium text-foreground">No fields selected</h3>
          <p className="text-sm text-muted-foreground">
            Select at least one field to display data.
          </p>
        </div>
      ) : readings.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border p-12 text-center">
          <h3 className="mb-1 text-lg font-medium text-foreground">No data available</h3>
          <p className="text-sm text-muted-foreground">
            There is no data for the selected fields in this time range.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {chartGroups.groups.map((group) => (
            <Fragment key={group.groupName}>
              {group.subGroups.map((sg) => (
                <GroupChart
                  key={`${group.groupName}::${sg.subGroupName}`}
                  groupName={`${group.groupName} – ${sg.subGroupName}`}
                  subGroupName={sg.subGroupName}
                  groupDescription={group.description}
                  subGroupDescription={sg.description}
                  fields={sg.fields}
                  readings={readings}
                  renames={renames}
                  resetTrigger={resetAllCounter}
                />
              ))}
              {group.soloFields.map((field) => (
                <FieldChart
                  key={field}
                  field={field}
                  index={selectedFields.indexOf(field)}
                  readings={readings}
                  displayName={`${group.groupName} – ${getDisplayName(field)}`}
                  unit={getUnit(field)}
                  resetTrigger={resetAllCounter}
                />
              ))}
            </Fragment>
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
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
          <span className="text-base font-semibold text-foreground">{displayName}</span>
          {unit && <span className="text-xs text-muted-foreground font-normal">({unit})</span>}
        </div>
        {zoomRange && (
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <span className="text-xs text-primary bg-primary/10 px-2.5 py-1 rounded-md whitespace-nowrap">
              {new Date(zoomRange.from).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
              {' — '}
              {new Date(zoomRange.to).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
            </span>
            <Button variant="outline" size="sm" onClick={handleResetZoom}>
              <RotateCcw className="h-3 w-3" />
              Reset
            </Button>
          </div>
        )}
      </div>
      <div
        ref={containerRef}
        className="w-full relative h-[260px]"
        style={{ cursor: dragState?.active ? 'crosshair' : 'default' }}
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

function GroupChart({
  groupName,
  subGroupName,
  groupDescription,
  subGroupDescription,
  fields,
  readings,
  renames,
  resetTrigger,
}: {
  groupName: string;
  subGroupName?: string;
  groupDescription?: string;
  subGroupDescription?: string;
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
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          <span className="text-base font-semibold text-foreground">{groupName}</span>
        </div>
        {zoomRange && (
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <span className="text-xs text-primary bg-primary/10 px-2.5 py-1 rounded-md whitespace-nowrap">
              {new Date(zoomRange.from).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
              {' — '}
              {new Date(zoomRange.to).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
            </span>
            <Button variant="outline" size="sm" onClick={handleResetZoom}>
              <RotateCcw className="h-3 w-3" />
              Reset
            </Button>
          </div>
        )}
      </div>
      {(groupDescription || subGroupDescription) && (
        <div className="mb-2 space-y-0.5">
          {groupDescription && (
            <p className="text-sm text-muted-foreground">{groupDescription}</p>
          )}
          {subGroupDescription && (
            <p className="text-xs text-muted-foreground/60 italic">{subGroupDescription}</p>
          )}
        </div>
      )}
      <div
        ref={containerRef}
        className="w-full relative h-[260px]"
        style={{ cursor: dragState?.active ? 'crosshair' : 'default' }}
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