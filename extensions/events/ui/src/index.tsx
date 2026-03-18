import * as React from 'react';
import { registerArgoPlaneView, registerArgoPlaneResourceTab } from '@argoplane/shared';
import { EventsPanel } from './components/EventsPanel';
import { AppEventsView } from './components/AppEventsView';

/** Error boundary that catches React render errors and shows a readable message. */
class ExtensionErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ArgoPlane Events] render error:', error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return React.createElement('div', {
        style: {
          padding: 20,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12,
          color: '#B91C1C',
        },
      },
        React.createElement('div', { style: { fontWeight: 600, marginBottom: 8 } },
          'Events: render error'),
        React.createElement('pre', {
          style: { whiteSpace: 'pre-wrap', color: '#78716C', fontSize: 11 },
        }, this.state.error.message + '\n' + this.state.error.stack),
      );
    }
    return this.props.children;
  }
}

/** Wrap a component in our error boundary. */
function withErrorBoundary<P extends object>(Component: React.ComponentType<P>): React.FC<P> {
  return (props: P) =>
    React.createElement(ExtensionErrorBoundary, null,
      React.createElement(Component, props));
}

const SafeEventsPanel = withErrorBoundary(EventsPanel);
const SafeAppEventsView = withErrorBoundary(AppEventsView);

// Register app view via ArgoPlane consolidated tab
registerArgoPlaneView({
  id: 'events',
  title: 'Events',
  icon: 'fa-bell',
  component: SafeAppEventsView,
});

// Register resource tabs via ArgoPlane consolidated resource tab
const entry = {
  id: 'events',
  title: 'Events',
  icon: 'fa-bell',
  component: SafeEventsPanel,
};

registerArgoPlaneResourceTab('', 'Pod', entry);
registerArgoPlaneResourceTab('apps', 'Deployment', entry);
registerArgoPlaneResourceTab('apps', 'StatefulSet', entry);
registerArgoPlaneResourceTab('apps', 'ReplicaSet', entry);
registerArgoPlaneResourceTab('apps', 'DaemonSet', entry);
registerArgoPlaneResourceTab('batch', 'Job', entry);
registerArgoPlaneResourceTab('batch', 'CronJob', entry);
