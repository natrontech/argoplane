<script lang="ts">
	import { page } from '$app/stores';
	import { navigation } from '$lib/config/navigation';
	import type { NavItem } from '$lib/types';

	let { isOpen }: { isOpen: boolean } = $props();

	function isActive(href: string): boolean {
		return $page.url.pathname === href;
	}

	function isParentActive(item: NavItem): boolean {
		if (isActive(item.href)) return true;
		if (item.children) {
			return item.children.some((child) => isActive(child.href));
		}
		return false;
	}
</script>

<aside
	class="fixed top-12 left-0 z-40 h-[calc(100vh-48px)] w-60 overflow-y-auto border-r border-gray-200 bg-white p-4 transition-transform duration-150 dark:border-gray-700 dark:bg-gray-900 {isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0"
>
	<nav class="flex flex-col gap-1">
		{#each navigation as item}
			{#if item.children}
				<div class="mt-4 first:mt-0">
					<span class="mb-1 block font-mono text-xs font-500 uppercase tracking-wider text-gray-400 dark:text-gray-500">
						{item.title}
					</span>
					<div class="flex flex-col gap-0.5">
						{#each item.children as child}
							<a
								href={child.href}
								class="block rounded-md px-2 py-1.5 text-sm no-underline transition-colors duration-100 {isActive(child.href)
									? 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400'
									: 'text-gray-600 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'}"
							>
								{child.title}
							</a>
						{/each}
					</div>
				</div>
			{:else}
				<a
					href={item.href}
					class="block rounded-md px-2 py-1.5 text-sm no-underline transition-colors duration-100 {isActive(item.href)
						? 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400'
						: 'text-gray-600 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'}"
				>
					{item.title}
				</a>
			{/if}
		{/each}
	</nav>
</aside>

<!-- Overlay for mobile -->
{#if isOpen}
	<button
		class="fixed inset-0 z-30 bg-black/50 lg:hidden"
		onclick={() => (isOpen = false)}
		aria-label="Close sidebar"
	></button>
{/if}
