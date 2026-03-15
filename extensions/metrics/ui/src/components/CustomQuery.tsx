import * as React from 'react';
import {
  Button,
  colors,
  fonts,
  fontSize,
  fontWeight,
  spacing,
  radius,
} from '@argoplane/shared';
import { fetchCustomQuery } from '../api';
import { CustomQueryResult, TimeRange, DataPoint } from '../types';
import { SparklineChart } from './SparklineChart';
import { TimeRangeSelector } from './TimeRangeSelector';

interface CustomQueryProps {
  namespace: string;
  appNamespace: string;
  appName: string;
  project: string;
}

const PRESETS = [
  {
    label: 'CPU by container',
    query: 'sum by (container) (rate(container_cpu_usage_seconds_total{namespace="{{ns}}",container!=""}[5m])) * 1000',
  },
  {
    label: 'Memory by container',
    query: 'sum by (container) (container_memory_working_set_bytes{namespace="{{ns}}",container!=""})',
  },
  {
    label: 'Network errors',
    query: 'sum(rate(container_network_receive_errors_total{namespace="{{ns}}"}[5m]))',
  },
  {
    label: 'OOM kills',
    query: 'sum(kube_pod_container_status_last_terminated_reason{namespace="{{ns}}",reason="OOMKilled"})',
  },
];

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
  const [expanded, setExpanded] = React.useState(false);

  const runQuery = () => {
    if (!query.trim()) return;
    setLoading(true);
    fetchCustomQuery(query, timeRange, appNamespace, appName, project)
      .then(setResult)
      .catch((err) => setResult({ error: err.message }))
      .finally(() => setLoading(false));
  };

  const applyPreset = (template: string) => {
    setQuery(template.replace(/\{\{ns\}\}/g, namespace));
  };

  if (!expanded) {
    return (
      <button onClick={() => setExpanded(true)} style={toggleButton}>
        Custom Query
      </button>
    );
  }

  return (
    <div style={container}>
      <div style={headerRow}>
        <span style={sectionTitle}>CUSTOM QUERY</span>
        <button onClick={() => setExpanded(false)} style={closeButton}>Close</button>
      </div>

      {/* Presets */}
      <div style={presetsRow}>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => applyPreset(p.query)}
            style={presetButton}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Query input */}
      <div style={inputRow}>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`rate(container_cpu_usage_seconds_total{namespace="${namespace}"}[5m])`}
          style={queryInput}
          rows={2}
        />
        <div style={controlsRow}>
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
          <Button primary onClick={runQuery} disabled={loading || !query.trim()}>
            {loading ? 'Running...' : 'Run'}
          </Button>
        </div>
      </div>

      {/* Results */}
      {result && (
        <div style={resultContainer}>
          {result.error && (
            <div style={errorText}>{result.error}</div>
          )}
          {result.series && result.series.length > 0 && (
            <SparklineChart
              title="Query Result"
              unit=""
              data={result.series}
              height={180}
              timeRange={timeRange}
            />
          )}
          {result.samples && result.samples.length > 0 && (
            <div style={samplesContainer}>
              {result.samples.map((s, i) => (
                <div key={i} style={sampleRow}>
                  <span style={sampleLabels}>
                    {Object.entries(s.labels).map(([k, v]) => `${k}="${v}"`).join(', ')}
                  </span>
                  <span style={sampleValue}>{s.value.toFixed(4)}</span>
                </div>
              ))}
            </div>
          )}
          {!result.error && !result.series?.length && !result.samples?.length && (
            <div style={noResult}>No results</div>
          )}
        </div>
      )}
    </div>
  );
};

const container: React.CSSProperties = {
  background: colors.gray50,
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.md,
  padding: spacing[4],
  marginTop: spacing[4],
};

const headerRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: spacing[3],
};

const sectionTitle: React.CSSProperties = {
  fontSize: fontSize.xs,
  fontWeight: fontWeight.semibold,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: colors.gray500,
};

const toggleButton: React.CSSProperties = {
  background: colors.gray50,
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.sm,
  padding: '6px 12px',
  fontSize: fontSize.sm,
  fontWeight: fontWeight.medium,
  color: colors.gray600,
  cursor: 'pointer',
  fontFamily: fonts.mono,
  marginTop: spacing[4],
};

const closeButton: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: fontSize.sm,
  color: colors.gray400,
  cursor: 'pointer',
};

const presetsRow: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  flexWrap: 'wrap',
  marginBottom: spacing[3],
};

const presetButton: React.CSSProperties = {
  background: colors.white,
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.sm,
  padding: '3px 8px',
  fontSize: fontSize.xs,
  color: colors.orange600,
  cursor: 'pointer',
  fontFamily: fonts.mono,
};

const inputRow: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: spacing[2],
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
};

const controlsRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const resultContainer: React.CSSProperties = {
  marginTop: spacing[3],
};

const errorText: React.CSSProperties = {
  fontSize: fontSize.sm,
  color: colors.redText,
  fontFamily: fonts.mono,
  padding: spacing[2],
  background: colors.redLight,
  borderRadius: radius.sm,
};

const samplesContainer: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const sampleRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: `${spacing[1]}px ${spacing[2]}px`,
  borderBottom: `1px solid ${colors.gray100}`,
  fontSize: fontSize.sm,
  fontFamily: fonts.mono,
};

const sampleLabels: React.CSSProperties = {
  color: colors.gray500,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '70%',
};

const sampleValue: React.CSSProperties = {
  fontWeight: fontWeight.semibold,
  color: colors.gray800,
};

const noResult: React.CSSProperties = {
  fontSize: fontSize.sm,
  color: colors.gray400,
  textAlign: 'center',
  padding: spacing[3],
};
