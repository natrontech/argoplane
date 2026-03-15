<script lang="ts">
	import { page } from '$app/stores';
	import { navigation } from '$lib/config/navigation';
	import type { NavItem } from '$lib/types';
	import { browser } from '$app/environment';

	let { isOpen, sidebarHidden = false }: { isOpen: boolean; sidebarHidden?: boolean } = $props();

	let collapsed: Record<string, boolean> = $state({});

	function isActive(href: string): boolean {
		return $page.url.pathname === href;
	}

	function isSectionActive(item: NavItem): boolean {
		if (isActive(item.href)) return true;
		if (item.children) {
			return item.children.some((child) => isActive(child.href));
		}
		return false;
	}

	function toggleSection(title: string) {
		collapsed[title] = !collapsed[title];
	}

	function isCollapsed(title: string): boolean {
		return collapsed[title] ?? false;
	}

	// Auto-expand sections containing the active page
	$effect(() => {
		if (browser) {
			for (const item of navigation) {
				if (item.children && isSectionActive(item)) {
					collapsed[item.title] = false;
				}
			}
		}
	});
</script>

<aside
	class="fixed top-12 left-0 z-40 h-[calc(100vh-48px)] w-60 overflow-y-auto border-r border-gray-200 bg-white p-4 transition-transform duration-150 dark:border-gray-700 dark:bg-gray-900 {isOpen ? 'translate-x-0' : '-translate-x-full'} {sidebarHidden ? 'lg:-translate-x-full' : 'lg:translate-x-0'}"
>
	<nav class="flex flex-col gap-1">
		{#each navigation as item}
			{#if item.children}
				<div class="mt-4 first:mt-0">
					<button
						onclick={() => toggleSection(item.title)}
						class="mb-1 flex w-full items-center justify-between rounded-md px-1 py-0.5 text-left transition-colors duration-100 hover:bg-gray-50 dark:hover:bg-gray-800"
					>
						<span class="font-mono text-xs font-500 uppercase tracking-wider text-gray-400 dark:text-gray-500">
							{item.title}
						</span>
						<svg
							class="h-3 w-3 text-gray-400 transition-transform duration-100 dark:text-gray-500 {isCollapsed(item.title) ? '-rotate-90' : ''}"
							viewBox="0 0 12 12"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
						>
							<path d="M3 4.5L6 7.5L9 4.5"/>
						</svg>
					</button>
					{#if !isCollapsed(item.title)}
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
					{/if}
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
