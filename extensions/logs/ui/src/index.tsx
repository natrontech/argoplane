import * as React from 'react';
import { registerArgoPlaneView } from '@argoplane/shared';
import { LogsPanel } from './components/LogsPanel';
import { AppLogsView } from './components/AppLogsView';

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
    console.error('[ArgoPlane Log Explorer] render error:', error, info.componentStack);
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
          'Log Explorer: render error'),
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

const SafeLogsPanel = withErrorBoundary(LogsPanel);
const SafeAppLogsView = withErrorBoundary(AppLogsView);

// Register app view via ArgoPlane consolidated tab
registerArgoPlaneView({
  id: 'logs',
  title: 'Log Explorer',
  icon: 'fa-search',
  component: SafeAppLogsView,
});

((window: any) => {
  // Resource tab: Pod log explorer (Loki-backed historical search)
  window.extensionsAPI.registerResourceExtension(
    SafeLogsPanel,
    '',
    'Pod',
    'Log Explorer',
    { icon: 'fa-search' }
  );

  // Resource tab: Deployment log explorer (aggregated across pods)
  window.extensionsAPI.registerResourceExtension(
    SafeLogsPanel,
    'apps',
    'Deployment',
    'Log Explorer',
    { icon: 'fa-search' }
  );

  // Resource tab: StatefulSet log explorer
  window.extensionsAPI.registerResourceExtension(
    SafeLogsPanel,
    'apps',
    'StatefulSet',
    'Log Explorer',
    { icon: 'fa-search' }
  );
})(window);
