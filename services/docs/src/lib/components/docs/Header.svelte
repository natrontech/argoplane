<script lang="ts">
	import { base } from '$app/paths';
	import { siteConfig } from '$lib/config/site';
	import { onMount } from 'svelte';
	import SearchDialog from './SearchDialog.svelte';
	import { Menu, PanelLeftClose, PanelLeftOpen, Sun, Moon, Star } from 'lucide-svelte';

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
				<Menu size={20} />
			</button>
			<button
				onclick={onToggleSidebarCollapse}
				class="hidden items-center justify-center rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-800 lg:flex dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-100"
				aria-label="Toggle sidebar"
			>
				{#if sidebarCollapsed}
					<PanelLeftOpen size={18} />
				{:else}
					<PanelLeftClose size={18} />
				{/if}
			</button>
			<a href="{base}/" class="flex items-center gap-2 no-underline">
				<img
					src="{base}{isDark ? '/logo-light.svg' : '/logo-dark.svg'}"
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
					<Sun size={16} />
				{:else}
					<Moon size={16} />
				{/if}
			</button>
			<a
				href={siteConfig.repo}
				target="_blank"
				rel="noopener noreferrer"
				class="flex items-center gap-1.5 rounded-md border border-gray-200 px-2 py-1 text-gray-500 no-underline hover:border-gray-300 hover:text-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-100"
				aria-label="GitHub repository"
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
					<path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-1.97c-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a10.9 10.9 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.59.23 2.76.11 3.05.73.8 1.18 1.82 1.18 3.08 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.07.78 2.16v3.2c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"/>
				</svg>
				{#if starCount}
					<Star size={12} class="fill-current text-yellow-500" />
					<span class="font-mono text-xs">{starCount}</span>
				{/if}
			</a>
		</div>
	</div>
</header>
