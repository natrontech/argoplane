import * as React from 'react';
import {
  Button,
  Input,
  SectionHeader,
  DataTable,
  Cell,
  colors,
  fonts,
  fontSize,
  fontWeight,
  spacing,
  radius,
} from '@argoplane/shared';
import { fetchCustomQuery, fetchDiscoverMetrics, fetchLabelNames, fetchLabelValues } from '../api';
import { CustomQueryResult, TimeRange, DiscoveredMetric, NamedSeries } from '../types';
import { MultiSeriesChart } from './MultiSeriesChart';
import { TimeRangeSelector } from './TimeRangeSelector';

interface QueryBuilderProps {
  namespace: string;
  appNamespace: string;
  appName: string;
  project: string;
}

type ResultTab = 'graph' | 'table';
type QueryMode = 'builder' | 'raw';

const AGG_FUNCTIONS = ['sum', 'avg', 'max', 'min', 'count', 'stddev'];

const SERIES_COLORS = [
  colors.orange500, colors.blueSolid, colors.greenSolid, colors.yellowSolid,
  colors.red, colors.gray500, colors.orange300, colors.blue,
];

function formatSmartValue(v: number): string {
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2) + 'G';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  if (Math.abs(v) < 0.01 && v !== 0) return v.toExponential(2);
  return v.toFixed(2);
}

export const QueryBuilder: React.FC<QueryBuilderProps> = ({
  namespace, appNamespace, appName, project,
}) => {
  const [expanded, setExpanded] = React.useState(false);
  const [mode, setMode] = React.useState<QueryMode>('builder');
  const [resultTab, setResultTab] = React.useState<ResultTab>('graph');
  const [timeRange, setTimeRange] = React.useState<TimeRange>('1h');
  const [result, setResult] = React.useState<CustomQueryResult | null>(null);
  const [loading, setLoading] = React.useState(false);

  // Builder state
  const [metricSearch, setMetricSearch] = React.useState('');
  const [metrics, setMetrics] = React.useState<DiscoveredMetric[]>([]);
  const [selectedMetric, setSelectedMetric] = React.useState('');
  const [aggFn, setAggFn] = React.useState('sum');
  const [groupBy, setGroupBy] = React.useState('');
  const [labelNames, setLabelNames] = React.useState<string[]>([]);
  const [filters, setFilters] = React.useState<Array<{ key: string; value: string }>>([]);
  const [showMetricList, setShowMetricList] = React.useState(false);

  // Raw mode state
  const [rawQuery, setRawQuery] = React.useState('');

  const searchTimer = React.useRef<ReturnType<typeof setTimeout>>();

  // Search metrics
  const searchMetrics = React.useCallback((term: string) => {
    fetchDiscoverMetrics(namespace, term, appNamespace, appName, project)
      .then(setMetrics)
      .catch(() => setMetrics([]));
  }, [namespace, appNamespace, appName, project]);

  const handleMetricSearch = (val: string) => {
    setMetricSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => searchMetrics(val), 250);
  };

  // When metric is selected, load label names
  const selectMetric = (m: DiscoveredMetric) => {
    setSelectedMetric(m.name);
    setMetricSearch(m.name);
    setShowMetricList(false);
    setFilters([]);
    setGroupBy('');
    fetchLabelNames(m.name, namespace, appNamespace, appName, project)
      .then(setLabelNames)
      .catch(() => setLabelNames([]));
  };

  // Build query from builder state
  const buildQuery = (): string => {
    if (mode === 'raw') return rawQuery;
    if (!selectedMetric) return '';

    let selector = `namespace="${namespace}"`;
    for (const f of filters) {
      if (f.key && f.value) {
        selector += `,${f.key}="${f.value}"`;
      }
    }

    const base = `${selectedMetric}{${selector}}`;
    const isCounter = selectedMetric.endsWith('_total') || selectedMetric.endsWith('_seconds_total');
    const inner = isCounter ? `rate(${base}[5m])` : base;
    const grouped = groupBy ? `${aggFn} by (${groupBy}) (${inner})` : `${aggFn}(${inner})`;
    return grouped;
  };

  const runQuery = () => {
    const q = buildQuery();
    if (!q) return;
    setLoading(true);
    setRawQuery(q);
    fetchCustomQuery(q, timeRange, appNamespace, appName, project)
      .then(setResult)
      .catch((err) => setResult({ error: err.message }))
      .finally(() => setLoading(false));
  };

  const addFilter = () => {
    setFilters([...filters, { key: '', value: '' }]);
  };

  const updateFilter = (idx: number, field: 'key' | 'value', val: string) => {
    const next = [...filters];
    next[idx][field] = val;
    setFilters(next);
  };

  const removeFilter = (idx: number) => {
    setFilters(filters.filter((_, i) => i !== idx));
  };

  if (!expanded) {
    return (
      <div style={{ marginBottom: spacing[4] }}>
        <button onClick={() => setExpanded(true)} style={expandBtn}>
          Query Builder
        </button>
      </div>
    );
  }

  const query = buildQuery();
  const hasSeries = result?.multiSeries && result.multiSeries.length > 0;
  const hasSamples = result?.samples && result.samples.length > 0;

  return (
    <div style={container}>
      {/* Header */}
      <div style={headerRow}>
        <div style={tabRow}>
          <button style={mode === 'builder' ? tabActive : tab} onClick={() => setMode('builder')}>Builder</button>
          <button style={mode === 'raw' ? tabActive : tab} onClick={() => setMode('raw')}>PromQL</button>
        </div>
        <button onClick={() => setExpanded(false)} style={closeBtn}>Close</button>
      </div>

      {/* Builder mode */}
      {mode === 'builder' && (
        <div style={builderGrid}>
          {/* Metric selector */}
          <div style={fieldGroup}>
            <label style={fieldLabel}>Metric</label>
            <div style={{ position: 'relative' }}>
              <input
                value={metricSearch}
                onChange={(e) => { handleMetricSearch(e.target.value); setShowMetricList(true); }}
                onFocus={() => { setShowMetricList(true); if (!metricSearch) searchMetrics(''); }}
                placeholder="Search metric name..."
                style={inputStyle}
              />
              {showMetricList && metrics.length > 0 && (
                <div style={dropdown}>
                  {metrics.slice(0, 20).map((m) => (
                    <button key={m.name} onClick={() => selectMetric(m)} style={dropdownItem}>
                      <span style={{ ...catBadge, background: catColor(m.category) }}>{m.category}</span>
                      <span style={dropdownText}>{m.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Aggregation */}
          <div style={fieldGroup}>
            <label style={fieldLabel}>Aggregation</label>
            <select value={aggFn} onChange={(e) => setAggFn(e.target.value)} style={selectStyle}>
              {AGG_FUNCTIONS.map((fn) => <option key={fn} value={fn}>{fn}</option>)}
            </select>
          </div>

          {/* Group by */}
          <div style={fieldGroup}>
            <label style={fieldLabel}>Group by</label>
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} style={selectStyle}>
              <option value="">(none)</option>
              {labelNames.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          {/* Filters */}
          {filters.length > 0 && (
            <div style={{ ...fieldGroup, gridColumn: '1 / -1' }}>
              <label style={fieldLabel}>Filters</label>
              {filters.map((f, i) => (
                <div key={i} style={filterRow}>
                  <select value={f.key} onChange={(e) => updateFilter(i, 'key', e.target.value)} style={{ ...selectStyle, flex: 1 }}>
                    <option value="">label...</option>
                    {labelNames.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                  <span style={{ color: colors.gray400 }}>=</span>
                  <input
                    value={f.value}
                    onChange={(e) => updateFilter(i, 'value', e.target.value)}
                    placeholder="value"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button onClick={() => removeFilter(i)} style={removeBtn}>x</button>
                </div>
              ))}
            </div>
          )}
          <div>
            <button onClick={addFilter} style={addFilterBtn}>+ Filter</button>
          </div>
        </div>
      )}

      {/* Raw PromQL mode */}
      {mode === 'raw' && (
        <textarea
          value={rawQuery}
          onChange={(e) => setRawQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runQuery(); } }}
          placeholder={`sum(rate(container_cpu_usage_seconds_total{namespace="${namespace}"}[5m]))`}
          style={textareaStyle}
          rows={3}
        />
      )}

      {/* Generated query preview (builder mode) */}
      {mode === 'builder' && query && (
        <div style={queryPreview}>
          <span style={{ color: colors.gray400, fontSize: fontSize.xs }}>QUERY:</span>
          <code style={queryCode}>{query}</code>
        </div>
      )}

      {/* Controls */}
      <div style={controlsRow}>
        <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
        <Button primary onClick={runQuery} disabled={loading || !query}>
          {loading ? 'Running...' : 'Execute'}
        </Button>
      </div>

      {/* Results */}
      {result && (
        <div style={{ marginTop: spacing[3] }}>
          {result.error && <div style={errorBox}>{result.error}</div>}

          {(hasSeries || hasSamples) && (
            <>
              {/* Graph / Table tabs */}
              <div style={resultTabRow}>
                <button style={resultTab === 'graph' ? resultTabActive : resultTabBtn} onClick={() => setResultTab('graph')}>Graph</button>
                <button style={resultTab === 'table' ? resultTabActive : resultTabBtn} onClick={() => setResultTab('table')}>Table</button>
              </div>

              {/* Graph view */}
              {resultTab === 'graph' && hasSeries && (
                <MultiSeriesChart
                  series={result.multiSeries!}
                  colors={SERIES_COLORS}
                  height={220}
                  timeRange={timeRange}
                  formatValue={formatSmartValue}
                />
              )}

              {/* Table view */}
              {resultTab === 'table' && hasSamples && (
                <div style={tableWrap}>
                  <DataTable columns={['Labels', 'Value']}>
                    {result.samples!.map((s, i) => (
                      <tr key={i}>
                        <Cell isLast={i === result.samples!.length - 1}>
                          {Object.entries(s.labels)
                            .filter(([k]) => k !== '__name__')
                            .map(([k, v]) => `${k}="${v}"`)
                            .join(', ')}
                        </Cell>
                        <Cell isLast={i === result.samples!.length - 1}>
                          <span style={{ fontWeight: 600 }}>{formatSmartValue(s.value)}</span>
                        </Cell>
                      </tr>
                    ))}
                  </DataTable>
                </div>
              )}

              {resultTab === 'table' && !hasSamples && hasSeries && (
                <div style={tableWrap}>
                  <DataTable columns={['Series', 'Latest Value']}>
                    {result.multiSeries!.map((s, i) => (
                      <tr key={i}>
                        <Cell isLast={i === result.multiSeries!.length - 1}>
                          <span style={{ color: SERIES_COLORS[i % SERIES_COLORS.length] }}>{s.label}</span>
                        </Cell>
                        <Cell isLast={i === result.multiSeries!.length - 1}>
                          <span style={{ fontWeight: 600 }}>
                            {s.series.length > 0 ? formatSmartValue(s.series[s.series.length - 1].value) : '-'}
                          </span>
                        </Cell>
                      </tr>
                    ))}
                  </DataTable>
                </div>
              )}
            </>
          )}

          {!result.error && !hasSeries && !hasSamples && (
            <div style={noResult}>No results</div>
          )}
        </div>
      )}
    </div>
  );
};

const catColor = (cat: string) => ({
  cpu: colors.orange500, memory: colors.blueSolid, network: colors.greenSolid,
  disk: colors.yellowSolid, pod: colors.gray500,
}[cat] || colors.gray400);

// --- Styles ---

const container: React.CSSProperties = {
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.md,
  padding: spacing[4],
  marginBottom: spacing[5],
  background: colors.white,
};

const expandBtn: React.CSSProperties = {
  background: colors.white,
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.sm,
  padding: '6px 14px',
  fontSize: fontSize.sm,
  fontWeight: fontWeight.medium,
  color: colors.orange600,
  cursor: 'pointer',
  fontFamily: fonts.mono,
};

const headerRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: spacing[3],
};

const tabRow: React.CSSProperties = {
  display: 'flex',
  gap: 0,
};

const tab: React.CSSProperties = {
  background: colors.gray50,
  border: `1px solid ${colors.gray200}`,
  padding: '4px 12px',
  fontSize: fontSize.sm,
  fontWeight: fontWeight.medium,
  color: colors.gray500,
  cursor: 'pointer',
};

const tabActive: React.CSSProperties = {
  ...tab,
  background: colors.white,
  color: colors.orange600,
  borderBottom: `2px solid ${colors.orange500}`,
};

const closeBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: fontSize.sm,
  color: colors.gray400,
  cursor: 'pointer',
};

const builderGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 150px 150px',
  gap: spacing[3],
  marginBottom: spacing[3],
  alignItems: 'start',
};

const fieldGroup: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: spacing[1],
};

const fieldLabel: React.CSSProperties = {
  fontSize: fontSize.xs,
  fontWeight: fontWeight.semibold,
  color: colors.gray500,
  textTransform: 'uppercase',
  letterSpacing: '0.3px',
};

const inputStyle: React.CSSProperties = {
  fontFamily: fonts.mono,
  fontSize: fontSize.sm,
  padding: '6px 8px',
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.sm,
  background: colors.white,
  color: colors.gray800,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
};

const dropdown: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  right: 0,
  background: colors.white,
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.sm,
  maxHeight: 200,
  overflowY: 'auto',
  zIndex: 10,
};

const dropdownItem: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing[2],
  padding: '4px 8px',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  width: '100%',
  textAlign: 'left',
  fontSize: fontSize.sm,
  fontFamily: fonts.mono,
};

const dropdownText: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: colors.gray700,
};

const catBadge: React.CSSProperties = {
  fontSize: 8,
  fontWeight: fontWeight.semibold,
  color: colors.white,
  padding: '1px 4px',
  borderRadius: radius.sm,
  textTransform: 'uppercase',
  flexShrink: 0,
};

const filterRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing[1],
  marginBottom: spacing[1],
};

const addFilterBtn: React.CSSProperties = {
  background: 'none',
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.sm,
  padding: '3px 10px',
  fontSize: fontSize.xs,
  color: colors.orange600,
  cursor: 'pointer',
  fontFamily: fonts.mono,
};

const removeBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: colors.gray400,
  cursor: 'pointer',
  fontSize: fontSize.sm,
  padding: '0 4px',
};

const textareaStyle: React.CSSProperties = {
  fontFamily: fonts.mono,
  fontSize: fontSize.sm,
  padding: spacing[2],
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.sm,
  background: colors.white,
  color: colors.gray800,
  resize: 'vertical',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  lineHeight: 1.5,
  marginBottom: spacing[2],
};

const queryPreview: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing[2],
  padding: `${spacing[1]}px ${spacing[2]}px`,
  background: colors.gray50,
  borderRadius: radius.sm,
  marginBottom: spacing[2],
  overflow: 'hidden',
};

const queryCode: React.CSSProperties = {
  fontFamily: fonts.mono,
  fontSize: fontSize.xs,
  color: colors.gray700,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const controlsRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const resultTabRow: React.CSSProperties = {
  display: 'flex',
  gap: 0,
  marginBottom: spacing[2],
  borderBottom: `1px solid ${colors.gray200}`,
};

const resultTabBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  borderBottom: '2px solid transparent',
  padding: `${spacing[2]}px ${spacing[3]}px`,
  fontSize: fontSize.sm,
  fontWeight: fontWeight.medium,
  color: colors.gray500,
  cursor: 'pointer',
};

const resultTabActive: React.CSSProperties = {
  ...resultTabBtn,
  color: colors.orange600,
  borderBottom: `2px solid ${colors.orange500}`,
};

const errorBox: React.CSSProperties = {
  fontSize: fontSize.sm,
  color: colors.redText,
  fontFamily: fonts.mono,
  padding: spacing[2],
  background: colors.redLight,
  borderRadius: radius.sm,
  wordBreak: 'break-all',
};

const tableWrap: React.CSSProperties = {
  maxHeight: 300,
  overflowY: 'auto',
};

const noResult: React.CSSProperties = {
  fontSize: fontSize.sm,
  color: colors.gray400,
  textAlign: 'center',
  padding: spacing[4],
};
