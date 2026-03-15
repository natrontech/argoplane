<script lang="ts">
	import { browser } from '$app/environment';
	import { afterNavigate } from '$app/navigation';

	let isOpen = $state(false);
	let searchInput: HTMLInputElement | null = $state(null);
	let pagefindUI: any = $state(null);
	let searchContainer: HTMLDivElement | null = $state(null);

	function open() {
		isOpen = true;
		setTimeout(() => {
			loadPagefind();
			searchInput?.focus();
		}, 50);
	}

	function close() {
		isOpen = false;
	}

	async function loadPagefind() {
		if (pagefindUI || !browser) return;
		try {
			// Use globalThis to avoid Vite/Rollup trying to resolve the import
			const pagefind = await (new Function('return import("/pagefind/pagefind.js")'))();
			await pagefind.init();
			pagefindUI = pagefind;
			pagefindFailed = false;
		} catch {
			pagefindFailed = true;
		}
	}

	let query = $state('');
	let results: any[] = $state([]);
	let loading = $state(false);
	let pagefindFailed = $state(false);

	async function search(q: string) {
		query = q;
		if (!q.trim()) {
			results = [];
			return;
		}
		if (!pagefindUI) {
			// Try loading again in case it wasn't ready
			await loadPagefind();
			if (!pagefindUI) {
				results = [];
				return;
			}
		}
		loading = true;
		try {
			const searchResult = await pagefindUI.search(q);
			const loaded = await Promise.all(
				searchResult.results.slice(0, 8).map((r: any) => r.data())
			);
			results = loaded;
		} catch {
			results = [];
		}
		loading = false;
	}

	$effect(() => {
		if (!browser) return;
		function onKeydown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				isOpen ? close() : open();
			}
			if (e.key === 'Escape' && isOpen) {
				close();
			}
		}
		document.addEventListener('keydown', onKeydown);
		return () => document.removeEventListener('keydown', onKeydown);
	});

	afterNavigate(() => {
		close();
	});
</script>

<!-- Search trigger button -->
<button
	onclick={open}
	class="flex items-center gap-2 rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-400 transition-colors hover:border-gray-300 hover:text-gray-600 dark:border-gray-700 dark:text-gray-500 dark:hover:border-gray-600 dark:hover:text-gray-300"
	aria-label="Search documentation"
>
	<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
	<span class="hidden sm:inline">Search</span>
	<kbd class="hidden rounded-sm border border-gray-200 px-1 py-0.5 font-mono text-[10px] text-gray-400 sm:inline dark:border-gray-600 dark:text-gray-500">
		{browser && navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl+'}K
	</kbd>
</button>

<!-- Search dialog -->
{#if isOpen}
	<div class="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
		<!-- Backdrop -->
		<button
			class="fixed inset-0 bg-black/50"
			onclick={close}
			aria-label="Close search"
		></button>

		<!-- Dialog -->
		<div
			class="relative z-10 w-full max-w-lg rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
			bind:this={searchContainer}
		>
			<!-- Input -->
			<div class="flex items-center gap-2 border-b border-gray-200 px-4 dark:border-gray-700">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-gray-400"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
				<input
					bind:this={searchInput}
					type="text"
					placeholder="Search documentation..."
					class="w-full border-0 bg-transparent py-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
					value={query}
					oninput={(e) => search((e.target as HTMLInputElement).value)}
				/>
				<kbd class="shrink-0 rounded-sm border border-gray-200 px-1.5 py-0.5 font-mono text-[10px] text-gray-400 dark:border-gray-600 dark:text-gray-500">
					ESC
				</kbd>
			</div>

			<!-- Results -->
			<div class="max-h-80 overflow-y-auto p-2">
				{#if pagefindFailed}
					<div class="px-3 py-4 text-center text-xs text-gray-400">
						Search index not available. Run <code class="rounded-sm bg-gray-100 px-1 py-0.5 font-mono dark:bg-gray-800">npm run build</code> first, then <code class="rounded-sm bg-gray-100 px-1 py-0.5 font-mono dark:bg-gray-800">npm run preview</code>.
					</div>
				{:else if loading}
					<div class="px-3 py-4 text-center text-xs text-gray-400">Searching...</div>
				{:else if query && results.length === 0}
					<div class="px-3 py-4 text-center text-xs text-gray-400">No results for "{query}"</div>
				{:else if results.length > 0}
					{#each results as result}
						<a
							href={result.url.replace(/\.html$/, '')}
							class="block rounded-md px-3 py-2 no-underline transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
						>
							<div class="text-sm font-medium text-gray-800 dark:text-gray-100">{result.meta?.title || result.url}</div>
							<div class="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
								{@html result.excerpt}
							</div>
						</a>
					{/each}
				{:else if !query}
					<div class="px-3 py-4 text-center text-xs text-gray-400">Type to search documentation</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
