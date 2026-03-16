<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ChevronDown } from 'lucide-svelte';

	let { title, open = false, children }: {
		title: string;
		open?: boolean;
		children: Snippet;
	} = $props();

	let isOpen = $state(open);
</script>

<div class="my-3 rounded-md border border-gray-200 dark:border-gray-700">
	<button
		onclick={() => isOpen = !isOpen}
		class="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-800"
	>
		{title}
		<ChevronDown
			size={14}
			class="shrink-0 text-gray-400 transition-transform duration-100 dark:text-gray-500 {isOpen ? 'rotate-180' : ''}"
		/>
	</button>
	{#if isOpen}
		<div class="border-t border-gray-200 px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">
			{@render children()}
		</div>
	{/if}
</div>
