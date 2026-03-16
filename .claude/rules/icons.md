# Icons

## Svelte (Docs, Portal)

Always use `lucide-svelte` for icons in SvelteKit projects (docs site, portal frontend). Never use inline SVG markup for standard icons.

```svelte
<script>
  import { ChevronDown, Search, ArrowLeft } from 'lucide-svelte';
</script>

<ChevronDown size={14} class="text-gray-400" />
<Search size={16} />
```

- Use the `size` prop instead of `width`/`height` or Tailwind `h-*`/`w-*` classes
- Use the `class` prop for colors and other styling
- Browse available icons at https://lucide.dev/icons

## Exceptions

- Custom diagram/illustration SVGs (like `ArchitectureDiagram.svelte`) that are not standard icons
- SVGs injected via DOM manipulation (`innerHTML`) where Svelte components cannot be used (e.g., copy-to-clipboard buttons added with `document.createElement`)

## React (ArgoCD Extensions)

ArgoCD extensions cannot use lucide-svelte. Use FontAwesome classes where ArgoCD provides them (e.g., `icon: 'fa-chart-line'` in extension registration). For custom icons in extension components, inline SVG is acceptable since the extension bundle environment is more constrained.
