<script lang="ts">
	import { onMount } from 'svelte';

	interface TOCItem {
		depth: number;
		text: string;
		slug: string;
	}

	let items: TOCItem[] = $state([]);
	let activeSlug: string = $state('');

	onMount(() => {
		const headings = document.querySelectorAll('.prose h2, .prose h3');
		items = Array.from(headings).map((el) => ({
			depth: el.tagName === 'H2' ? 2 : 3,
			text: el.textContent?.replace('#', '').trim() || '',
			slug: el.id
		}));

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						activeSlug = entry.target.id;
					}
				}
			},
			{ rootMargin: '-80px 0px -80% 0px', threshold: 0 }
		);

		headings.forEach((el) => observer.observe(el));

		return () => observer.disconnect();
	});
</script>

{#if items.length > 0}
	<div class="hidden xl:block">
		<div class="fixed top-12 right-0 h-[calc(100vh-48px)] w-50 overflow-y-auto p-4">
			<span class="mb-2 block font-mono text-xs font-500 uppercase tracking-wider text-gray-400 dark:text-gray-500">
				On this page
			</span>
			<nav class="flex flex-col gap-0.5">
				{#each items as item}
					<a
						href="#{item.slug}"
						class="block py-1 text-xs no-underline transition-colors duration-100 {item.depth === 3 ? 'pl-3' : ''} {activeSlug === item.slug
							? 'text-orange-500 dark:text-orange-400'
							: 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}"
					>
						{item.text}
					</a>
				{/each}
			</nav>
		</div>
	</div>
{/if}
