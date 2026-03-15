import * as React from 'react';
import {
  DataTable,
  Cell,
  SectionHeader,
  Loading,
  colors,
  spacing,
} from '@argoplane/shared';
import { fetchPodBreakdown } from '../api';
import { PodMetric } from '../types';

interface PodBreakdownProps {
  namespace: string;
  name: string;
  kind: string;
  appNamespace: string;
  appName: string;
  project: string;
}

export const PodBreakdown: React.FC<PodBreakdownProps> = ({
  namespace,
  name,
  kind,
  appNamespace,
  appName,
  project,
}) => {
  const [pods, setPods] = React.useState<PodMetric[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetchPodBreakdown(namespace, name, kind, appNamespace, appName, project)
      .then(setPods)
      .catch(() => setPods([]))
      .finally(() => setLoading(false));
  }, [namespace, name, kind, appNamespace, appName, project]);

  if (loading) return <Loading />;
  if (pods.length === 0) return null;

  return (
    <div style={{ marginTop: spacing[5] }}>
      <SectionHeader title="POD BREAKDOWN" />
      <DataTable columns={['Pod', 'CPU', 'Memory', 'Net RX', 'Net TX', 'Restarts']}>
        {pods.map((p, i) => (
          <tr key={p.pod}>
            <Cell isLast={i === pods.length - 1}>
              <span style={{ color: colors.orange600 }}>{p.pod}</span>
            </Cell>
            <Cell isLast={i === pods.length - 1}>{p.cpu} m</Cell>
            <Cell isLast={i === pods.length - 1}>{p.memory} MiB</Cell>
            <Cell isLast={i === pods.length - 1}>{p.netRx} KB/s</Cell>
            <Cell isLast={i === pods.length - 1}>{p.netTx} KB/s</Cell>
            <Cell isLast={i === pods.length - 1}>
              <span style={{ color: Number(p.restarts) > 0 ? colors.redText : colors.gray600 }}>
                {p.restarts}
              </span>
            </Cell>
          </tr>
        ))}
      </DataTable>
    </div>
  );
};
