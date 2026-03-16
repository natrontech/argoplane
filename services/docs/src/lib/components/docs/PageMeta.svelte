<script lang="ts">
	import { page } from '$app/stores';
	import { siteConfig } from '$lib/config/site';
	import timestamps from 'virtual:git-timestamps';
	import { SquarePen } from 'lucide-svelte';

	let editUrl = $derived(() => {
		const path = $page.url.pathname;
		const filePath = path === '/' ? '/src/routes/+page.svx' : `/src/routes${path}/+page.svx`;
		return `${siteConfig.repo}/edit/main/services/docs${filePath}`;
	});

	let lastUpdated = $derived(() => {
		const path = $page.url.pathname;
		const ts = (timestamps as Record<string, string>)[path];
		if (!ts) return '';
		return new Date(ts).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	});
</script>

<div class="mt-8 flex items-center justify-between border-t border-gray-200 pt-4 dark:border-gray-700">
	<a
		href={editUrl()}
		target="_blank"
		rel="noopener noreferrer"
		class="flex items-center gap-1.5 text-xs text-gray-400 no-underline hover:text-orange-500 dark:text-gray-500 dark:hover:text-orange-400"
	>
		<SquarePen size={14} />
		Edit this page on GitHub
	</a>
	{#if lastUpdated()}
		<span class="text-xs text-gray-400 dark:text-gray-500">
			Last updated: {lastUpdated()}
		</span>
	{/if}
</div>
