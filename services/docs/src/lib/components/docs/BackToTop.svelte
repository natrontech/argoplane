<script lang="ts">
	import { browser } from '$app/environment';

	let visible = $state(false);

	$effect(() => {
		if (!browser) return;
		function onScroll() {
			visible = window.scrollY > 300;
		}
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => window.removeEventListener('scroll', onScroll);
	});

	function scrollToTop() {
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}
</script>

{#if visible}
	<button
		onclick={scrollToTop}
		class="fixed bottom-6 right-6 z-40 flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-400 transition-all hover:border-gray-300 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500 dark:hover:border-gray-600 dark:hover:text-gray-100"
		aria-label="Back to top"
	>
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
	</button>
{/if}
