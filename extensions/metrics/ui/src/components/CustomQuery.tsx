import * as React from 'react';
import {
  Button,
  Input,
  SectionHeader,
  colors,
  fonts,
  fontSize,
  fontWeight,
  spacing,
  radius,
} from '@argoplane/shared';
import { fetchCustomQuery, fetchDiscoverMetrics } from '../api';
import { CustomQueryResult, TimeRange, DiscoveredMetric } from '../types';
import { SparklineChart } from './SparklineChart';
import { TimeRangeSelector } from './TimeRangeSelector';

interface CustomQueryProps {
  namespace: string;
  appNamespace: string;
  appName: string;
  project: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  cpu: colors.orange500,
  memory: colors.blueSolid,
  network: colors.greenSolid,
  disk: colors.yellowSolid,
  pod: colors.gray500,
  node: colors.gray600,
};

function formatSmartValue(v: number): string {
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2) + ' G';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + ' M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + ' K';
  if (Math.abs(v) < 0.01 && v !== 0) return v.toExponential(2);
  return v.toFixed(2);
}

export const CustomQuery: React.FC<CustomQueryProps> = ({
  namespace,
  appNamespace,
  appName,
  project,
}) => {
  const [query, setQuery] = React.useState('');
  const [timeRange, setTimeRange] = React.useState<TimeRange>('1h');
  const [result, setResult] = React.useState<CustomQueryResult | null>(null);
  const [loading, setLoading] = React.useState(false);

  // Discovery state
  const [search, setSearch] = React.useState('');
  const [discovered, setDiscovered] = React.useState<DiscoveredMetric[]>([]);
  const [showDiscover, setShowDiscover] = React.useState(false);
  const [discoverLoading, setDiscoverLoading] = React.useState(false);
  const searchTimer = React.useRef<ReturnType<typeof setTimeout>>();

  const runQuery = () => {
    if (!query.trim()) return;
    setLoading(true);
    fetchCustomQuery(query, timeRange, appNamespace, appName, project)
      .then(setResult)
      .catch((err) => setResult({ error: err.message }))
      .finally(() => setLoading(false));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      runQuery();
    }
  };

  const doDiscover = React.useCallback((term: string) => {
    setDiscoverLoading(true);
    fetchDiscoverMetrics(namespace, term, appNamespace, appName, project)
      .then(setDiscovered)
      .catch(() => setDiscovered([]))
      .finally(() => setDiscoverLoading(false));
  }, [namespace, appNamespace, appName, project]);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doDiscover(val), 300);
  };

  const selectMetric = (m: DiscoveredMetric) => {
    setQuery(m.query);
    setShowDiscover(false);
  };

  // Format chart data to human-readable values
  const chartData = React.useMemo(() => {
    if (!result?.series) return undefined;
    return result.series;
  }, [result]);

  return (
    <div>
      <SectionHeader
        title="QUERY"
        action={
          <button
            onClick={() => { setShowDiscover(!showDiscover); if (!showDiscover) doDiscover(''); }}
            style={discoverToggle}
          >
            {showDiscover ? 'Hide metrics' : 'Browse metrics'}
          </button>
        }
      />

      {/* Metric discovery panel */}
      {showDiscover && (
        <div style={discoverPanel}>
          <Input
            value={search}
            onChange={handleSearchChange}
            placeholder="Search metrics (e.g. cpu, memory, network...)"
            style={{ width: '100%', marginBottom: spacing[2] }}
          />
          <div style={discoverList}>
            {discoverLoading && <span style={discoverHint}>Searching...</span>}
            {!discoverLoading && discovered.length === 0 && (
              <span style={discoverHint}>No metrics found</span>
            )}
            {discovered.map((m) => (
              <button key={m.name} onClick={() => selectMetric(m)} style={discoverItem}>
                <span style={{
                  ...categoryBadge,
                  background: CATEGORY_COLORS[m.category] || colors.gray400,
                }}>
                  {m.category}
                </span>
                <span style={metricName}>{m.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Query input */}
      <div style={queryRow}>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`sum(rate(container_cpu_usage_seconds_total{namespace="${namespace}"}[5m]))`}
          style={queryInput}
          rows={2}
        />
      </div>
      <div style={controlsRow}>
        <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
        <Button primary onClick={runQuery} disabled={loading || !query.trim()}>
          {loading ? 'Running...' : 'Run'}
        </Button>
      </div>

      {/* Results */}
      {result && (
        <div style={{ marginTop: spacing[3] }}>
          {result.error && (
            <div style={errorBox}>{result.error}</div>
          )}

          {chartData && chartData.length > 0 && (
            <SparklineChart
              title="Query Result"
              unit=""
              data={chartData}
              height={160}
              timeRange={timeRange}
              formatValue={formatSmartValue}
            />
          )}

          {result.samples && result.samples.length > 0 && (
            <div style={samplesTable}>
              {result.samples.map((s, i) => (
                <div key={i} style={sampleRow}>
                  <span style={sampleLabels}>
                    {Object.entries(s.labels)
                      .filter(([k]) => k !== '__name__')
                      .map(([k, v]) => (
                        <span key={k}>
                          <span style={{ color: colors.gray400 }}>{k}=</span>
                          <span style={{ color: colors.orange600 }}>"{v}"</span>
                          {' '}
                        </span>
                      ))}
                  </span>
                  <span style={sampleValue}>{formatSmartValue(s.value)}</span>
                </div>
              ))}
            </div>
          )}

          {!result.error && !chartData?.length && !result.samples?.length && (
            <div style={noResult}>No results</div>
          )}
        </div>
      )}
    </div>
  );
};

// --- Styles ---

const discoverToggle: React.CSSProperties = {
  background: 'none',
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.sm,
  padding: '3px 10px',
  fontSize: fontSize.xs,
  fontWeight: fontWeight.medium,
  color: colors.orange600,
  cursor: 'pointer',
  fontFamily: fonts.mono,
};

const discoverPanel: React.CSSProperties = {
  background: colors.white,
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.md,
  padding: spacing[3],
  marginBottom: spacing[3],
};

const discoverList: React.CSSProperties = {
  maxHeight: 200,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const discoverItem: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing[2],
  padding: `${spacing[1]}px ${spacing[2]}px`,
  background: 'none',
  border: 'none',
  borderRadius: radius.sm,
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
  fontSize: fontSize.sm,
  fontFamily: fonts.mono,
};

const categoryBadge: React.CSSProperties = {
  fontSize: 9,
  fontWeight: fontWeight.semibold,
  color: colors.white,
  padding: '1px 5px',
  borderRadius: radius.sm,
  textTransform: 'uppercase',
  letterSpacing: '0.3px',
  flexShrink: 0,
};

const metricName: React.CSSProperties = {
  color: colors.gray700,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const discoverHint: React.CSSProperties = {
  fontSize: fontSize.sm,
  color: colors.gray400,
  padding: spacing[2],
  textAlign: 'center',
};

const queryRow: React.CSSProperties = {
  marginBottom: spacing[2],
};

const queryInput: React.CSSProperties = {
  fontFamily: fonts.mono,
  fontSize: fontSize.sm,
  padding: spacing[2],
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.sm,
  background: colors.white,
  color: colors.gray800,
  resize: 'vertical',
  outline: 'none',
  lineHeight: 1.5,
  width: '100%',
  boxSizing: 'border-box',
};

const controlsRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: spacing[2],
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

const samplesTable: React.CSSProperties = {
  background: colors.gray50,
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.md,
  overflow: 'hidden',
};

const sampleRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: `6px ${spacing[3]}px`,
  borderBottom: `1px solid ${colors.gray100}`,
  fontSize: fontSize.sm,
  fontFamily: fonts.mono,
  gap: spacing[2],
};

const sampleLabels: React.CSSProperties = {
  color: colors.gray500,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
  minWidth: 0,
};

const sampleValue: React.CSSProperties = {
  fontWeight: fontWeight.semibold,
  color: colors.gray800,
  flexShrink: 0,
};

const noResult: React.CSSProperties = {
  fontSize: fontSize.sm,
  color: colors.gray400,
  textAlign: 'center',
  padding: spacing[3],
};
