<script lang="ts">
  let activeLayer: string | null = $state(null);

  const descriptions: Record<string, string> = {
    developer: 'Developers interact with ArgoCD UI. ArgoPlane extensions appear as tabs, status panels, and sidebar pages.',
    gateway: 'ArgoCD validates auth, enforces RBAC, and proxies /extensions/* requests to backend services.',
    extensions: 'Each Go backend queries a specific platform system and returns JSON via ArgoCD proxy.',
    sources: 'Backends query live data from cluster systems. No database. All state is derived.',
    rbac: 'ArgoCD AppProjects + OIDC provide tenant isolation. Identity headers flow to backends.',
  };
</script>

<div class="arch">
  <!-- Pixel decoration -->
  <div class="pixels" aria-hidden="true">
    <span class="px"></span><span class="px"></span><span class="px"></span>
  </div>

  <!-- Layer 1: Developer -->
  <button
    class="layer"
    class:layer-active={activeLayer === 'developer'}
    onclick={() => activeLayer = activeLayer === 'developer' ? null : 'developer'}
  >
    <div class="layer-label">
      <span class="layer-num">01</span>
      <span class="layer-name">Developer</span>
    </div>
    <div class="layer-content">
      <div class="node node-gray node-wide">
        <div class="node-icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="2" width="14" height="10" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/>
            <line x1="5" y1="14" x2="11" y2="14" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        </div>
        <div class="node-text">
          <span class="node-title">Browser</span>
          <span class="node-sub">ArgoCD UI + ArgoPlane Extensions</span>
        </div>
      </div>
    </div>
    {#if activeLayer === 'developer'}
      <p class="layer-desc">{descriptions.developer}</p>
    {/if}
  </button>

  <!-- Flow arrow -->
  <div class="flow-connector">
    <div class="flow-line"></div>
    <div class="flow-arrow"></div>
    <span class="flow-label">HTTPS</span>
  </div>

  <!-- Layer 2: Gateway -->
  <button
    class="layer layer-accent"
    class:layer-active={activeLayer === 'gateway'}
    onclick={() => activeLayer = activeLayer === 'gateway' ? null : 'gateway'}
  >
    <div class="layer-label">
      <span class="layer-num">02</span>
      <span class="layer-name">Gateway</span>
    </div>
    <div class="layer-content">
      <div class="node node-orange node-wide">
        <div class="node-icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="1" width="14" height="14" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/>
            <line x1="1" y1="5" x2="15" y2="5" stroke="currentColor" stroke-width="1"/>
            <circle cx="4" cy="3" r="1" fill="currentColor"/>
            <circle cx="7" cy="3" r="1" fill="currentColor"/>
          </svg>
        </div>
        <div class="node-text">
          <span class="node-title">ArgoCD API Server</span>
          <span class="node-sub">Auth, RBAC, Proxy Routing</span>
        </div>
        <div class="node-badges">
          <span class="badge">OIDC/SSO</span>
          <span class="badge">AppProjects</span>
          <span class="badge">Identity Headers</span>
        </div>
      </div>
    </div>
    {#if activeLayer === 'gateway'}
      <p class="layer-desc">{descriptions.gateway}</p>
    {/if}
  </button>

  <!-- Flow arrow -->
  <div class="flow-connector">
    <div class="flow-line flow-line-orange"></div>
    <div class="flow-arrow flow-arrow-orange"></div>
    <span class="flow-label flow-label-orange">/extensions/*</span>
  </div>

  <!-- Layer 3: ArgoPlane Extensions -->
  <button
    class="layer"
    class:layer-active={activeLayer === 'extensions'}
    onclick={() => activeLayer = activeLayer === 'extensions' ? null : 'extensions'}
  >
    <div class="layer-label">
      <span class="layer-num">03</span>
      <span class="layer-name">Extensions</span>
    </div>
    <div class="layer-content">
      <div class="extensions-grid">
        <div class="ext-card ext-discover">
          <span class="ext-category">Discover</span>
          <span class="ext-name">Platform</span>
          <span class="node-sub">StorageClasses, CRDs, Operators, Nodes</span>
        </div>
        <div class="ext-card ext-observe">
          <span class="ext-category">Observe</span>
          <div class="ext-pair">
            <div class="ext-item">
              <span class="ext-name">Metrics</span>
              <span class="node-sub">CPU, Memory, Custom</span>
            </div>
            <div class="ext-sep"></div>
            <div class="ext-item">
              <span class="ext-name">Backups</span>
              <span class="node-sub">Schedules, Restores</span>
            </div>
          </div>
        </div>
        <div class="ext-card ext-secure">
          <span class="ext-category">Secure</span>
          <span class="ext-name">Networking</span>
          <span class="node-sub">Policies, Flows, Endpoints</span>
        </div>
      </div>
    </div>
    {#if activeLayer === 'extensions'}
      <p class="layer-desc">{descriptions.extensions}</p>
    {/if}
  </button>

  <!-- Flow arrow -->
  <div class="flow-connector">
    <div class="flow-line flow-line-dashed"></div>
    <div class="flow-arrow flow-arrow-gray"></div>
    <span class="flow-label">queries</span>
  </div>

  <!-- Layer 4: Data Sources -->
  <button
    class="layer"
    class:layer-active={activeLayer === 'sources'}
    onclick={() => activeLayer = activeLayer === 'sources' ? null : 'sources'}
  >
    <div class="layer-label">
      <span class="layer-num">04</span>
      <span class="layer-name">Sources</span>
    </div>
    <div class="layer-content">
      <div class="sources-row">
        <div class="source source-blue">
          <span class="source-name">Prometheus</span>
          <span class="node-sub">PromQL</span>
        </div>
        <div class="source source-blue">
          <span class="source-name">Velero</span>
          <span class="node-sub">CRDs</span>
        </div>
        <div class="source source-blue">
          <span class="source-name">Cilium</span>
          <span class="node-sub">Hubble</span>
        </div>
        <div class="source source-green">
          <span class="source-name">Kubernetes API</span>
          <span class="node-sub">Native Resources</span>
        </div>
      </div>
    </div>
    {#if activeLayer === 'sources'}
      <p class="layer-desc">{descriptions.sources}</p>
    {/if}
  </button>

  <!-- Principle bar -->
  <div class="principles">
    <span class="principle">No database</span>
    <span class="principle-dot"></span>
    <span class="principle">No custom auth</span>
    <span class="principle-dot"></span>
    <span class="principle">No separate portal</span>
  </div>
</div>

<style>
  .arch {
    width: 100%;
    max-width: 640px;
    margin: 24px 0;
    display: flex;
    flex-direction: column;
    gap: 0;
    font-family: var(--font-mono);
    position: relative;
  }

  /* Pixel decoration */
  .pixels {
    display: flex;
    gap: 4px;
    margin-bottom: 12px;
  }

  .px {
    width: 4px;
    height: 4px;
    background: var(--color-orange-300);
    border-radius: 1px;
  }

  :global(.dark) .px {
    background: var(--color-orange-500);
    opacity: 0.5;
  }

  /* Layers */
  .layer {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--color-gray-200);
    border-radius: 4px;
    background: var(--color-gray-50);
    cursor: pointer;
    transition: border-color 100ms, background 100ms;
    text-align: left;
    width: 100%;
    font-family: inherit;
    font-size: inherit;
    color: inherit;
  }

  .layer:hover {
    border-color: var(--color-gray-300);
  }

  .layer-active {
    border-color: var(--color-orange-300);
    background: var(--color-orange-50);
  }

  .layer-accent {
    border-color: var(--color-orange-200);
    background: var(--color-orange-50);
  }

  .layer-accent:hover {
    border-color: var(--color-orange-400);
  }

  .layer-accent.layer-active {
    border-color: var(--color-orange-500);
  }

  :global(.dark) .layer {
    background: var(--color-gray-800);
    border-color: var(--color-gray-700);
  }

  :global(.dark) .layer:hover {
    border-color: var(--color-gray-600);
  }

  :global(.dark) .layer-active {
    border-color: var(--color-orange-500);
    background: color-mix(in srgb, var(--color-orange-500) 8%, var(--color-gray-900));
  }

  :global(.dark) .layer-accent {
    background: color-mix(in srgb, var(--color-orange-500) 5%, var(--color-gray-900));
    border-color: var(--color-gray-600);
  }

  :global(.dark) .layer-accent:hover {
    border-color: var(--color-orange-400);
  }

  :global(.dark) .layer-accent.layer-active {
    border-color: var(--color-orange-400);
  }

  /* Layer label */
  .layer-label {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .layer-num {
    font-size: 9px;
    font-weight: 600;
    color: var(--color-orange-500);
    opacity: 0.6;
  }

  :global(.dark) .layer-num {
    color: var(--color-orange-400);
  }

  .layer-name {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-gray-500);
  }

  :global(.dark) .layer-name {
    color: var(--color-gray-400);
  }

  /* Layer content */
  .layer-content {
    width: 100%;
  }

  .layer-desc {
    font-size: 11px;
    color: var(--color-gray-500);
    line-height: 1.5;
    margin: 0;
    padding-top: 4px;
    border-top: 1px solid var(--color-gray-200);
    font-family: var(--font-body);
  }

  :global(.dark) .layer-desc {
    color: var(--color-gray-400);
    border-top-color: var(--color-gray-700);
  }

  /* Nodes */
  .node {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 4px;
    border: 1px solid;
  }

  .node-wide {
    width: 100%;
  }

  .node-icon {
    flex-shrink: 0;
    color: var(--color-gray-500);
  }

  :global(.dark) .node-icon {
    color: var(--color-gray-400);
  }

  .node-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .node-gray {
    background: white;
    border-color: var(--color-gray-300);
  }

  :global(.dark) .node-gray {
    background: var(--color-gray-900);
    border-color: var(--color-gray-600);
  }

  .node-orange {
    background: white;
    border-color: var(--color-orange-400);
  }

  :global(.dark) .node-orange {
    background: var(--color-gray-900);
    border-color: var(--color-orange-500);
  }

  .node-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-gray-800);
  }

  :global(.dark) .node-title {
    color: var(--color-gray-100);
  }

  .node-sub {
    font-size: 10px;
    color: var(--color-gray-500);
  }

  :global(.dark) .node-sub {
    color: var(--color-gray-400);
  }

  .node-badges {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    margin-left: auto;
  }

  .badge {
    font-size: 9px;
    padding: 2px 6px;
    border-radius: 2px;
    background: var(--color-orange-100);
    color: var(--color-orange-600);
    white-space: nowrap;
  }

  :global(.dark) .badge {
    background: color-mix(in srgb, var(--color-orange-500) 15%, var(--color-gray-900));
    color: var(--color-orange-400);
  }

  /* Flow connectors */
  .flow-connector {
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 28px;
    position: relative;
    padding: 2px 0;
  }

  .flow-line {
    flex: 1;
    width: 1px;
    background: var(--color-gray-300);
  }

  .flow-line-orange {
    background: var(--color-orange-400);
  }

  .flow-line-dashed {
    background: repeating-linear-gradient(
      to bottom,
      var(--color-gray-400) 0,
      var(--color-gray-400) 3px,
      transparent 3px,
      transparent 6px
    );
  }

  :global(.dark) .flow-line {
    background: var(--color-gray-600);
  }

  :global(.dark) .flow-line-orange {
    background: var(--color-orange-500);
  }

  :global(.dark) .flow-line-dashed {
    background: repeating-linear-gradient(
      to bottom,
      var(--color-gray-500) 0,
      var(--color-gray-500) 3px,
      transparent 3px,
      transparent 6px
    );
  }

  .flow-arrow {
    width: 0;
    height: 0;
    border-left: 3px solid transparent;
    border-right: 3px solid transparent;
    border-top: 5px solid var(--color-gray-300);
  }

  .flow-arrow-orange {
    border-top-color: var(--color-orange-400);
  }

  .flow-arrow-gray {
    border-top-color: var(--color-gray-400);
  }

  :global(.dark) .flow-arrow {
    border-top-color: var(--color-gray-600);
  }

  :global(.dark) .flow-arrow-orange {
    border-top-color: var(--color-orange-500);
  }

  :global(.dark) .flow-arrow-gray {
    border-top-color: var(--color-gray-500);
  }

  .flow-label {
    position: absolute;
    left: calc(50% + 12px);
    top: 50%;
    transform: translateY(-50%);
    font-size: 9px;
    color: var(--color-gray-400);
    letter-spacing: 0.02em;
    white-space: nowrap;
  }

  .flow-label-orange {
    color: var(--color-orange-500);
    font-weight: 600;
  }

  :global(.dark) .flow-label {
    color: var(--color-gray-500);
  }

  :global(.dark) .flow-label-orange {
    color: var(--color-orange-400);
  }

  /* Extensions grid */
  .extensions-grid {
    display: grid;
    grid-template-columns: 1fr 1.4fr 1fr;
    gap: 6px;
  }

  .ext-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px;
    border-radius: 4px;
    border: 1px solid;
    background: white;
  }

  :global(.dark) .ext-card {
    background: var(--color-gray-900);
  }

  .ext-discover {
    border-color: var(--color-info);
    border-top: 2px solid var(--color-info);
  }

  :global(.dark) .ext-discover {
    border-color: color-mix(in srgb, var(--color-info) 50%, var(--color-gray-700));
    border-top-color: var(--color-info);
  }

  .ext-observe {
    border-color: var(--color-orange-400);
    border-top: 2px solid var(--color-orange-500);
  }

  :global(.dark) .ext-observe {
    border-color: color-mix(in srgb, var(--color-orange-500) 40%, var(--color-gray-700));
    border-top-color: var(--color-orange-400);
  }

  .ext-secure {
    border-color: var(--color-success);
    border-top: 2px solid var(--color-success);
  }

  :global(.dark) .ext-secure {
    border-color: color-mix(in srgb, var(--color-success) 40%, var(--color-gray-700));
    border-top-color: var(--color-success);
  }

  .ext-category {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .ext-discover .ext-category { color: var(--color-info-text); }
  .ext-observe .ext-category { color: var(--color-orange-600); }
  .ext-secure .ext-category { color: var(--color-success-text); }

  :global(.dark) .ext-discover .ext-category { color: var(--color-info); }
  :global(.dark) .ext-observe .ext-category { color: var(--color-orange-400); }
  :global(.dark) .ext-secure .ext-category { color: var(--color-success); }

  .ext-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-gray-800);
  }

  :global(.dark) .ext-name {
    color: var(--color-gray-100);
  }

  .ext-pair {
    display: flex;
    gap: 0;
  }

  .ext-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .ext-sep {
    width: 1px;
    background: var(--color-gray-200);
    margin: 0 8px;
    align-self: stretch;
  }

  :global(.dark) .ext-sep {
    background: var(--color-gray-700);
  }

  /* Sources row */
  .sources-row {
    display: flex;
    gap: 6px;
  }

  .source {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px 6px;
    border-radius: 4px;
    border: 1px solid;
  }

  .source-blue {
    background: var(--color-info-light);
    border-color: var(--color-info);
  }

  :global(.dark) .source-blue {
    background: color-mix(in srgb, var(--color-info) 8%, var(--color-gray-900));
    border-color: color-mix(in srgb, var(--color-info) 50%, var(--color-gray-700));
  }

  .source-green {
    background: var(--color-success-light);
    border-color: var(--color-success);
  }

  :global(.dark) .source-green {
    background: color-mix(in srgb, var(--color-success) 8%, var(--color-gray-900));
    border-color: color-mix(in srgb, var(--color-success) 50%, var(--color-gray-700));
  }

  .source-name {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-gray-800);
    text-align: center;
  }

  :global(.dark) .source-name {
    color: var(--color-gray-100);
  }

  /* Principles bar */
  .principles {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-top: 16px;
    padding: 8px 0;
    border-top: 1px solid var(--color-gray-200);
  }

  :global(.dark) .principles {
    border-top-color: var(--color-gray-700);
  }

  .principle {
    font-size: 10px;
    font-weight: 500;
    color: var(--color-gray-400);
    letter-spacing: 0.02em;
    font-family: var(--font-body);
  }

  :global(.dark) .principle {
    color: var(--color-gray-500);
  }

  .principle-dot {
    width: 3px;
    height: 3px;
    border-radius: 1px;
    background: var(--color-gray-300);
    flex-shrink: 0;
  }

  :global(.dark) .principle-dot {
    background: var(--color-gray-600);
  }

  /* Responsive */
  @media (max-width: 640px) {
    .extensions-grid {
      grid-template-columns: 1fr;
    }

    .sources-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }

    .node-badges {
      display: none;
    }

    .flow-label {
      display: none;
    }

    .principles {
      flex-wrap: wrap;
      gap: 8px;
    }

    .principle-dot {
      display: none;
    }
  }
</style>
