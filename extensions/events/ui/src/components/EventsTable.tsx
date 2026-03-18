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

const messageStyle: React.CSSProperties = {
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

export const EventsTable: React.FC<EventsTableProps> = ({ events, loading, error, onRetry }) => {
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
    React.createElement('tbody', null,
      events.map((event, i) =>
        React.createElement('tr', { key: `${event.involvedObject.name}-${event.reason}-${i}` },
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
          React.createElement('td', { style: messageStyle, title: event.message }, event.message),
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
      ),
    ),
  );
};
