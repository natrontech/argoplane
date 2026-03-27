<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import { navigation } from '$lib/config/navigation';
	import type { NavItem } from '$lib/types';
	import { ArrowLeft, ArrowRight } from 'lucide-svelte';

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

	let currentIndex = $derived(flatNav.findIndex((item) => base + item.href === $page.url.pathname));
	let prev = $derived(currentIndex > 0 ? flatNav[currentIndex - 1] : null);
	let next = $derived(currentIndex < flatNav.length - 1 ? flatNav[currentIndex + 1] : null);
</script>

{#if prev || next}
	<div class="mt-8 flex items-center justify-between border-t border-gray-200 pt-4 dark:border-gray-700">
		{#if prev}
			<a
				href="{base}{prev.href}"
				class="group flex items-center gap-2 text-sm text-gray-500 no-underline hover:text-orange-500 dark:text-gray-400 dark:hover:text-orange-400"
			>
				<ArrowLeft size={14} />
				{prev.title}
			</a>
		{:else}
			<div></div>
		{/if}
		{#if next}
			<a
				href="{base}{next.href}"
				class="group flex items-center gap-2 text-sm text-gray-500 no-underline hover:text-orange-500 dark:text-gray-400 dark:hover:text-orange-400"
			>
				{next.title}
				<ArrowRight size={14} />
			</a>
		{:else}
			<div></div>
		{/if}
	</div>
{/if}
