<script lang="ts">
	import { siteConfig } from '$lib/config/site';
	import { onMount } from 'svelte';
	import SearchDialog from './SearchDialog.svelte';

	let { onToggleSidebar, onToggleSidebarCollapse, onToggleTheme, isDark, sidebarCollapsed }: {
		onToggleSidebar: () => void;
		onToggleSidebarCollapse: () => void;
		onToggleTheme: () => void;
		isDark: boolean;
		sidebarCollapsed: boolean;
	} = $props();

	let starCount: string = $state('');
	let version: string = $state('');

	onMount(async () => {
		try {
			const res = await fetch('https://api.github.com/repos/natrontech/argoplane');
			if (res.ok) {
				const data = await res.json();
				const count = data.stargazers_count;
				starCount = count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
			}
		} catch {
			// silent fail
		}
		try {
			const res = await fetch('https://api.github.com/repos/natrontech/argoplane/releases/latest');
			if (res.ok) {
				const data = await res.json();
				version = data.tag_name || '';
			}
		} catch {
			// silent fail
		}
	});
</script>

<header class="fixed top-0 left-0 right-0 z-50 h-12 border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
	<div class="flex h-full items-center justify-between px-4">
		<div class="flex items-center gap-3">
			<button
				onclick={onToggleSidebar}
				class="flex items-center justify-center rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800 lg:hidden dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
				aria-label="Toggle sidebar"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
			</button>
			<button
				onclick={onToggleSidebarCollapse}
				class="hidden items-center justify-center rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-800 lg:flex dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-100"
				aria-label="Toggle sidebar"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 150ms; {sidebarCollapsed ? 'transform: rotate(180deg)' : ''}"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
			</button>
			<a href="/" class="flex items-center gap-2 no-underline">
				<img
					src={isDark ? '/logo-light.svg' : '/logo-dark.svg'}
					alt="ArgoPlane"
					class="h-6 w-6"
				/>
				<span class="text-lg font-semibold text-gray-800 dark:text-gray-100">{siteConfig.name}</span>
				<span class="rounded-sm border border-gray-200 px-1.5 py-0.5 font-mono text-xs text-gray-400 dark:border-gray-700 dark:text-gray-500">docs</span>
			</a>
		</div>
		<div class="flex items-center gap-1">
			<SearchDialog />
			{#if version}
				<a
					href="{siteConfig.repo}/releases/latest"
					target="_blank"
					rel="noopener noreferrer"
					class="hidden items-center rounded-sm border border-gray-200 px-1.5 py-0.5 font-mono text-xs text-gray-400 no-underline hover:border-orange-300 hover:text-orange-500 sm:flex dark:border-gray-700 dark:text-gray-500 dark:hover:border-orange-500 dark:hover:text-orange-400"
				>
					{version}
				</a>
			{/if}
			<button
				onclick={onToggleTheme}
				class="flex items-center justify-center rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
				aria-label="Toggle theme"
			>
				{#if isDark}
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
				{/if}
			</button>
			<a
				href={siteConfig.repo}
				target="_blank"
				rel="noopener noreferrer"
				class="flex items-center gap-1.5 rounded-md border border-gray-200 px-2 py-1 text-gray-500 no-underline hover:border-gray-300 hover:text-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-100"
				aria-label="GitHub repository"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
				{#if starCount}
					<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" class="text-yellow-500"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
					<span class="font-mono text-xs">{starCount}</span>
				{/if}
			</a>
		</div>
	</div>
</header>
