<script lang="ts">
	import { page } from '$app/stores';
	import { navigation } from '$lib/config/navigation';
	import type { NavItem } from '$lib/types';

	function flattenNav(items: NavItem[]): NavItem[] {
		const flat: NavItem[] = [];
		for (const item of items) {
			if (item.children) {
				for (const child of item.children) {
					flat.push(child);
				}
			} else {
				flat.push(item);
			}
		}
		return flat;
	}

	let flatNav = flattenNav(navigation);

	let currentIndex = $derived(flatNav.findIndex((item) => item.href === $page.url.pathname));
	let prev = $derived(currentIndex > 0 ? flatNav[currentIndex - 1] : null);
	let next = $derived(currentIndex < flatNav.length - 1 ? flatNav[currentIndex + 1] : null);
</script>

{#if prev || next}
	<div class="mt-8 flex items-center justify-between border-t border-gray-200 pt-4 dark:border-gray-700">
		{#if prev}
			<a
				href={prev.href}
				class="group flex items-center gap-2 text-sm text-gray-500 no-underline hover:text-orange-500 dark:text-gray-400 dark:hover:text-orange-400"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
				{prev.title}
			</a>
		{:else}
			<div></div>
		{/if}
		{#if next}
			<a
				href={next.href}
				class="group flex items-center gap-2 text-sm text-gray-500 no-underline hover:text-orange-500 dark:text-gray-400 dark:hover:text-orange-400"
			>
				{next.title}
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
			</a>
		{:else}
			<div></div>
		{/if}
	</div>
{/if}
