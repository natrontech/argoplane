<script lang="ts">
	import type { Snippet } from 'svelte';

	let { tabs, children }: {
		tabs: string[];
		children: Snippet<[number]>;
	} = $props();

	let active = $state(0);
</script>

<div class="my-4">
	<div class="flex border-b border-gray-200 dark:border-gray-700">
		{#each tabs as tab, i}
			<button
				onclick={() => active = i}
				class="px-3 py-1.5 text-xs font-medium transition-colors {active === i
					? 'border-b-2 border-orange-500 text-orange-600 dark:border-orange-400 dark:text-orange-400'
					: 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'}"
			>
				{tab}
			</button>
		{/each}
	</div>
	<div class="pt-3">
		{@render children(active)}
	</div>
</div>
