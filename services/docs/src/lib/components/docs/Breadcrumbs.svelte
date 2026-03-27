<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import { navigation } from '$lib/config/navigation';
	import type { NavItem } from '$lib/types';
	import { ChevronRight } from 'lucide-svelte';

	interface Crumb {
		title: string;
		href: string;
	}

	function findCrumbs(pathname: string): Crumb[] {
		const path = pathname.startsWith(base) ? pathname.slice(base.length) || '/' : pathname;
		if (path === '/') return [];

		const crumbs: Crumb[] = [];

		for (const item of navigation) {
			if (item.href === path) {
				crumbs.push({ title: item.title, href: item.href });
				return crumbs;
			}
			if (item.children) {
				for (const child of item.children) {
					if (child.href === path) {
						crumbs.push({ title: item.title, href: item.href });
						if (child.href !== item.href) {
							crumbs.push({ title: child.title, href: child.href });
						}
						return crumbs;
					}
				}
			}
		}
		return crumbs;
	}

	let crumbs = $derived(findCrumbs($page.url.pathname));
</script>

{#if crumbs.length > 0}
	<nav class="mb-4 flex items-center gap-1.5 text-xs" aria-label="Breadcrumb">
		<a href="{base}/" class="text-gray-400 no-underline hover:text-orange-500 dark:text-gray-500 dark:hover:text-orange-400">
			Docs
		</a>
		{#each crumbs as crumb, i}
			<ChevronRight size={10} class="text-gray-300 dark:text-gray-600" />
			{#if i === crumbs.length - 1}
				<span class="text-gray-600 dark:text-gray-300">{crumb.title}</span>
			{:else}
				<a href="{base}{crumb.href}" class="text-gray-400 no-underline hover:text-orange-500 dark:text-gray-500 dark:hover:text-orange-400">
					{crumb.title}
				</a>
			{/if}
		{/each}
	</nav>
{/if}
