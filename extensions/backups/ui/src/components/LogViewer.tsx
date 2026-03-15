import * as React from 'react';
import { colors, fonts, fontSize, fontWeight, spacing } from '@argoplane/shared';

const LOG_LEVEL_COLORS: Record<string, string> = {
  'error': '#FF6B6B',
  'warning': '#FFD93D',
  'warn': '#FFD93D',
  'info': '#6BCB77',
  'debug': '#A8A29E',
};

function highlightLogLine(line: string, searchTerm: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let key = 0;

  const tokenRegex = /(time="[^"]*"|level=\w+|msg="[^"]*"|error="[^"]*"|logSource="[^"]*"|name="[^"]*"|namespace="[^"]*"|resource="[^"]*")/g;
  const tokens: { start: number; end: number; text: string; color: string }[] = [];

  let match;
  while ((match = tokenRegex.exec(line)) !== null) {
    let color = colors.gray400;
    if (match[0].startsWith('time=')) color = '#A8A29E';
    else if (match[0].startsWith('level=')) {
      const lvl = match[0].replace('level=', '').toLowerCase();
      color = LOG_LEVEL_COLORS[lvl] || colors.gray300;
    }
    else if (match[0].startsWith('msg=')) color = '#E2E8F0';
    else if (match[0].startsWith('error=')) color = '#FF6B6B';
    else color = '#93C5FD';
    tokens.push({ start: match.index, end: match.index + match[0].length, text: match[0], color });
  }

  if (tokens.length === 0 && !searchTerm) {
    return [<span key={0}>{line}</span>];
  }

  let pos = 0;
  const segments: { text: string; color?: string }[] = [];
  for (const t of tokens) {
    if (t.start > pos) segments.push({ text: line.slice(pos, t.start) });
    segments.push({ text: t.text, color: t.color });
    pos = t.end;
  }
  if (pos < line.length) segments.push({ text: line.slice(pos) });
  if (segments.length === 0) segments.push({ text: line });

  for (const seg of segments) {
    if (searchTerm && seg.text.toLowerCase().includes(searchTerm.toLowerCase())) {
      const lc = seg.text.toLowerCase();
      const needle = searchTerm.toLowerCase();
      let idx = 0;
      let sIdx = lc.indexOf(needle, idx);
      while (sIdx !== -1) {
        if (sIdx > idx) parts.push(<span key={key++} style={seg.color ? { color: seg.color } : undefined}>{seg.text.slice(idx, sIdx)}</span>);
        parts.push(<span key={key++} style={{ background: '#F59E0B', color: '#1C1917', borderRadius: 2, padding: '0 1px' }}>{seg.text.slice(sIdx, sIdx + searchTerm.length)}</span>);
        idx = sIdx + searchTerm.length;
        sIdx = lc.indexOf(needle, idx);
      }
      if (idx < seg.text.length) parts.push(<span key={key++} style={seg.color ? { color: seg.color } : undefined}>{seg.text.slice(idx)}</span>);
    } else {
      parts.push(<span key={key++} style={seg.color ? { color: seg.color } : undefined}>{seg.text}</span>);
    }
  }

  return parts;
}

export const LogViewer: React.FC<{ title: string; content: string; onClose: () => void }> = ({ title, content, onClose }) => {
  const [search, setSearch] = React.useState('');

  const lines = React.useMemo(() => (content || '').split('\n'), [content]);
  const matchCount = React.useMemo(() => {
    if (!search) return 0;
    const lc = search.toLowerCase();
    return lines.filter(l => l.toLowerCase().includes(lc)).length;
  }, [lines, search]);

  return (
    <div style={{ marginTop: spacing[3], border: `1px solid ${colors.gray200}`, borderRadius: 4, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: `${spacing[2]}px ${spacing[3]}px`, background: colors.gray100,
        borderBottom: `1px solid ${colors.gray200}`, gap: spacing[2],
      }}>
        <span style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.gray500, textTransform: 'uppercase', letterSpacing: '0.5px', flexShrink: 0 }}>{title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing[2], flex: 1, justifyContent: 'flex-end' }}>
          <div style={{ position: 'relative', maxWidth: 260 }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search logs..."
              style={{
                width: '100%', padding: `3px ${spacing[2]}px`, border: `1px solid ${colors.gray200}`,
                borderRadius: 4, fontSize: fontSize.xs, fontFamily: fonts.mono, color: colors.gray800,
                boxSizing: 'border-box' as const,
              }}
            />
          </div>
          {search && <span style={{ fontSize: fontSize.xs, color: colors.gray500, fontFamily: fonts.mono, flexShrink: 0 }}>{matchCount} match{matchCount !== 1 ? 'es' : ''}</span>}
          <span onClick={onClose} style={{ cursor: 'pointer', fontSize: fontSize.sm, color: colors.gray400, fontWeight: fontWeight.semibold, flexShrink: 0 }}>x</span>
        </div>
      </div>
      <pre style={{
        margin: 0, padding: spacing[3], background: colors.gray800, color: colors.gray100,
        fontSize: fontSize.xs, fontFamily: fonts.mono, lineHeight: 1.5,
        maxHeight: 400, overflowY: 'auto', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' as const,
      }}>
        {content ? lines.map((line, i) => {
          if (search && !line.toLowerCase().includes(search.toLowerCase())) {
            return <div key={i} style={{ opacity: 0.3 }}>{highlightLogLine(line, '')}</div>;
          }
          return <div key={i}>{highlightLogLine(line, search)}</div>;
        }) : '(empty)'}
      </pre>
    </div>
  );
};
