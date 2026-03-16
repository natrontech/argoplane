<script lang="ts">
	import { browser } from '$app/environment';
	import { ArrowUp } from 'lucide-svelte';

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
		<ArrowUp size={16} />
	</button>
{/if}
