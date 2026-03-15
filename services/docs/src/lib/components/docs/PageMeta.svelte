<script lang="ts">
	import { page } from '$app/stores';
	import { siteConfig } from '$lib/config/site';

	let editUrl = $derived(() => {
		const path = $page.url.pathname;
		const filePath = path === '/' ? '/src/routes/+page.svx' : `/src/routes${path}/+page.svx`;
		return `${siteConfig.repo}/edit/main/services/docs${filePath}`;
	});
</script>

<div class="mt-8 flex items-center gap-4 border-t border-gray-200 pt-4 dark:border-gray-700">
	<a
		href={editUrl()}
		target="_blank"
		rel="noopener noreferrer"
		class="flex items-center gap-1.5 text-xs text-gray-400 no-underline hover:text-orange-500 dark:text-gray-500 dark:hover:text-orange-400"
	>
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
		Edit this page on GitHub
	</a>
</div>
