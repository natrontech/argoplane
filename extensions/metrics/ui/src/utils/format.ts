export function formatCPU(millicores: number): string {
  if (millicores >= 1000) {
    return `${(millicores / 1000).toFixed(2)} cores`;
  }
  return `${millicores.toFixed(1)}m`;
}

export function formatMemory(mib: number): string {
  if (mib >= 1024) {
    return `${(mib / 1024).toFixed(2)} GiB`;
  }
  return `${mib.toFixed(1)} MiB`;
}

export function formatNetwork(kbps: number): string {
  if (kbps >= 1024) {
    return `${(kbps / 1024).toFixed(1)} MB/s`;
  }
  return `${kbps.toFixed(1)} KB/s`;
}

export function formatCompact(value: number, unit: string): string {
  switch (unit) {
    case 'millicores':
      return formatCPU(value);
    case 'MiB':
      return formatMemory(value);
    case 'KB/s':
      return formatNetwork(value);
    default:
      return value.toFixed(1);
  }
}

export function formatTimeLabel(iso: string, range: string): string {
  const d = new Date(iso);
  if (range === '7d') {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
