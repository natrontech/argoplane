<script lang="ts">
	import { browser } from '$app/environment';
	import { afterNavigate } from '$app/navigation';

	let minutes = $state(0);

	function calculate() {
		if (!browser) return;
		const article = document.querySelector('.prose');
		if (!article) return;
		const text = article.textContent || '';
		const words = text.trim().split(/\s+/).length;
		minutes = Math.max(1, Math.ceil(words / 200));
	}

	afterNavigate(() => {
		setTimeout(calculate, 100);
	});
</script>

{#if minutes > 0}
	<span class="text-xs text-gray-400 dark:text-gray-500">
		{minutes} min read
	</span>
{/if}
