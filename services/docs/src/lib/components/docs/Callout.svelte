<script lang="ts">
	import type { Snippet } from 'svelte';

	let { type = 'info', children }: {
		type?: 'info' | 'warning' | 'danger';
		children: Snippet;
	} = $props();

	const styles = {
		info: 'border-info-text/30 bg-info-light dark:bg-info-text/10',
		warning: 'border-warning-text/30 bg-warning-light dark:bg-warning-text/10',
		danger: 'border-error-text/30 bg-error-light dark:bg-error-text/10'
	};

	const squareColors = {
		info: 'bg-info-text',
		warning: 'bg-warning-text',
		danger: 'bg-error-text'
	};

	const labels = {
		info: 'Note',
		warning: 'Warning',
		danger: 'Danger'
	};
</script>

<div class="my-4 rounded-md border p-4 {styles[type]}">
	<div class="mb-2 flex items-center gap-2">
		<span class="inline-block h-2 w-2 rounded-sm {squareColors[type]}"></span>
		<span class="font-mono text-xs font-500 uppercase tracking-wider text-gray-600 dark:text-gray-300">
			{labels[type]}
		</span>
	</div>
	<div class="text-sm text-gray-700 dark:text-gray-300">
		{@render children()}
	</div>
</div>
