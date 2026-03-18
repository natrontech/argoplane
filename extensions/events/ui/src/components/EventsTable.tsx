import * as React from 'react';
import {
  Loading,
  EmptyState,
  colors,
  fonts,
  fontSize,
  fontWeight,
  spacing,
  table as tableStyle,
  th as thStyle,
  td as tdStyle,
  tag,
} from '@argoplane/shared';
import { KubeEvent } from '../types';

interface EventsTableProps {
  events: KubeEvent[];
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
}

function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  if (diff < 0) return 'just now';
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const cellStyle: React.CSSProperties = {
  ...tdStyle,
  verticalAlign: 'top',
};

const messageCellStyle: React.CSSProperties = {
  ...cellStyle,
  maxWidth: 400,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const objectStyle: React.CSSProperties = {
  ...cellStyle,
  whiteSpace: 'nowrap',
};

const countStyle: React.CSSProperties = {
  ...cellStyle,
  textAlign: 'right',
};

const expandedRowStyle: React.CSSProperties = {
  background: colors.gray50,
};

const expandedCellStyle: React.CSSProperties = {
  padding: `${spacing[3]}px ${spacing[3]}px ${spacing[4]}px`,
  borderBottom: `1px solid ${colors.gray100}`,
};

const expandedMessageStyle: React.CSSProperties = {
  fontFamily: fonts.mono,
  fontSize: fontSize.sm,
  color: colors.gray800,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  lineHeight: 1.5,
  margin: 0,
};

const detailGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  gap: `${spacing[1]}px ${spacing[3]}px`,
  fontSize: fontSize.xs,
  fontFamily: fonts.mono,
  marginTop: spacing[3],
};

const detailLabelStyle: React.CSSProperties = {
  color: colors.gray500,
  fontWeight: fontWeight.semibold,
  textTransform: 'uppercase',
  letterSpacing: '0.3px',
};

const detailValueStyle: React.CSSProperties = {
  color: colors.gray700,
};

const clickableRowStyle: React.CSSProperties = {
  cursor: 'pointer',
};

const chevronStyle = (expanded: boolean): React.CSSProperties => ({
  display: 'inline-block',
  width: 12,
  fontSize: fontSize.xs,
  color: colors.gray400,
  marginRight: spacing[1],
  transition: 'transform 0.1s',
  transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
});

export const EventsTable: React.FC<EventsTableProps> = ({ events, loading, error, onRetry }) => {
  const [expandedRows, setExpandedRows] = React.useState<Set<number>>(new Set());

  // Tick every 30s so timeAgo labels refresh.
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Collapse expanded rows when the event list changes (e.g. filter or refresh).
  const eventFingerprint = events.length + (events[0]?.lastTimestamp || '');
  React.useEffect(() => {
    setExpandedRows(new Set());
  }, [eventFingerprint]);

  const toggleRow = (index: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  if (loading) return React.createElement(Loading, null);

  if (error) {
    return React.createElement('div', {
      style: { padding: spacing[4], color: colors.redText, fontFamily: fonts.mono, fontSize: fontSize.sm },
    },
      React.createElement('span', null, error),
      onRetry && React.createElement('button', {
        onClick: onRetry,
        style: {
          marginLeft: spacing[3],
          background: colors.orange100,
          color: colors.orange600,
          border: `1px solid ${colors.orange200}`,
          borderRadius: 2,
          padding: '4px 12px',
          fontSize: fontSize.sm,
          cursor: 'pointer',
          fontFamily: 'inherit',
        },
      }, 'Retry'),
    );
  }

  if (events.length === 0) {
    return React.createElement(EmptyState, { message: 'No events found' });
  }

  const rows: React.ReactElement[] = [];
  events.forEach((event, i) => {
    const expanded = expandedRows.has(i);

    // Main row
    rows.push(
      React.createElement('tr', {
        key: `row-${i}`,
        style: clickableRowStyle,
        onClick: () => toggleRow(i),
      },
        React.createElement('td', { style: cellStyle },
          React.createElement('span', {
            style: tag(event.type === 'Warning' ? 'red' : 'green'),
          }, event.type),
        ),
        React.createElement('td', { style: cellStyle },
          React.createElement('span', {
            style: { fontFamily: fonts.mono, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
          }, event.reason),
        ),
        React.createElement('td', { style: objectStyle },
          React.createElement('span', {
            style: { color: colors.gray500, fontSize: fontSize.xs },
          }, event.involvedObject.kind + '/'),
          React.createElement('span', {
            style: { color: colors.gray800, fontSize: fontSize.sm },
          }, event.involvedObject.name),
        ),
        React.createElement('td', { style: messageCellStyle },
          React.createElement('span', { style: chevronStyle(expanded) }, '\u25B6'),
          event.message,
        ),
        React.createElement('td', { style: countStyle }, String(event.count)),
        React.createElement('td', { style: cellStyle },
          React.createElement('span', {
            style: { color: colors.gray600, fontSize: fontSize.xs },
            title: event.lastTimestamp,
          }, timeAgo(event.lastTimestamp)),
        ),
        React.createElement('td', { style: cellStyle },
          React.createElement('span', {
            style: { color: colors.gray400, fontSize: fontSize.xs },
            title: event.firstTimestamp,
          }, timeAgo(event.firstTimestamp)),
        ),
      ),
    );

    // Expanded detail row
    if (expanded) {
      rows.push(
        React.createElement('tr', { key: `detail-${i}`, style: expandedRowStyle },
          React.createElement('td', {
            colSpan: 7,
            style: expandedCellStyle,
          },
            React.createElement('pre', { style: expandedMessageStyle }, event.message),
            React.createElement('div', { style: detailGridStyle },
              React.createElement('span', { style: detailLabelStyle }, 'Object'),
              React.createElement('span', { style: detailValueStyle },
                `${event.involvedObject.kind}/${event.involvedObject.name}`),
              React.createElement('span', { style: detailLabelStyle }, 'Namespace'),
              React.createElement('span', { style: detailValueStyle },
                event.involvedObject.namespace),
              React.createElement('span', { style: detailLabelStyle }, 'Source'),
              React.createElement('span', { style: detailValueStyle },
                [event.source.component, event.source.host].filter(Boolean).join(', ') || '-'),
              React.createElement('span', { style: detailLabelStyle }, 'Count'),
              React.createElement('span', { style: detailValueStyle }, String(event.count)),
              React.createElement('span', { style: detailLabelStyle }, 'First seen'),
              React.createElement('span', { style: detailValueStyle },
                `${timeAgo(event.firstTimestamp)} (${event.firstTimestamp})`),
              React.createElement('span', { style: detailLabelStyle }, 'Last seen'),
              React.createElement('span', { style: detailValueStyle },
                `${timeAgo(event.lastTimestamp)} (${event.lastTimestamp})`),
            ),
          ),
        ),
      );
    }
  });

  return React.createElement('table', { style: tableStyle },
    React.createElement('thead', null,
      React.createElement('tr', null,
        React.createElement('th', { style: thStyle }, 'Type'),
        React.createElement('th', { style: thStyle }, 'Reason'),
        React.createElement('th', { style: thStyle }, 'Object'),
        React.createElement('th', { style: thStyle }, 'Message'),
        React.createElement('th', { style: { ...thStyle, textAlign: 'right' } }, 'Count'),
        React.createElement('th', { style: thStyle }, 'Last Seen'),
        React.createElement('th', { style: thStyle }, 'First Seen'),
      ),
    ),
    React.createElement('tbody', null, ...rows),
  );
};
