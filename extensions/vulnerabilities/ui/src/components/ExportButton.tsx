import * as React from 'react';
import { Button, colors, fonts, fontSize, spacing } from '@argoplane/shared';
import { downloadExport } from '../api';

/** CSV export button that surfaces download failures inline. */
export const ExportButton: React.FC<{
  namespace: string;
  type: 'vulnerabilities' | 'audit' | 'secrets' | 'sbom';
  appNamespace: string;
  appName: string;
  project: string;
}> = ({ namespace, type, appNamespace, appName, project }) => {
  const [error, setError] = React.useState<string | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: spacing[1] }}>
      <Button onClick={() => {
        setError(null);
        downloadExport(namespace, type, appNamespace, appName, project)
          .catch((err) => setError(err?.message || 'download failed'));
      }}>
        Export CSV
      </Button>
      {error && (
        <span style={{ color: colors.redText, fontSize: fontSize.xs, fontFamily: fonts.mono }}>
          Export failed: {error}
        </span>
      )}
    </div>
  );
};
