<script lang="ts">
	import '../app.css';
	import Header from '$lib/components/docs/Header.svelte';
	import Sidebar from '$lib/components/docs/Sidebar.svelte';
	import TableOfContents from '$lib/components/docs/TableOfContents.svelte';
	import PrevNext from '$lib/components/docs/PrevNext.svelte';
	import type { Snippet } from 'svelte';
	import { browser } from '$app/environment';

	let { children }: { children: Snippet } = $props();

	let sidebarOpen = $state(false);
	let isDark = $state(false);

	function toggleSidebar() {
		sidebarOpen = !sidebarOpen;
	}

	function toggleTheme() {
		isDark = !isDark;
		if (browser) {
			document.documentElement.classList.toggle('dark', isDark);
			localStorage.setItem('theme', isDark ? 'dark' : 'light');
		}
	}

	$effect(() => {
		if (browser) {
			const stored = localStorage.getItem('theme');
			const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
			isDark = stored === 'dark' || (!stored && prefersDark);
			document.documentElement.classList.toggle('dark', isDark);
		}
	});
</script>

<div class="min-h-screen bg-white dark:bg-gray-900">
	<Header onToggleSidebar={toggleSidebar} onToggleTheme={toggleTheme} {isDark} />
	<Sidebar isOpen={sidebarOpen} />

	<main class="pt-12 lg:pl-60 xl:pr-50">
		<div class="mx-auto max-w-3xl overflow-hidden px-6 py-8">
			<article class="prose min-w-0">
				{@render children()}
			</article>
			<PrevNext />
		</div>
	</main>

	<TableOfContents />
</div>
