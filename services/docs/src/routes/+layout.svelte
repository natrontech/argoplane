<script lang="ts">
	import '../app.css';
	import Header from '$lib/components/docs/Header.svelte';
	import Sidebar from '$lib/components/docs/Sidebar.svelte';
	import TableOfContents from '$lib/components/docs/TableOfContents.svelte';
	import PrevNext from '$lib/components/docs/PrevNext.svelte';
	import PageMeta from '$lib/components/docs/PageMeta.svelte';
	import Breadcrumbs from '$lib/components/docs/Breadcrumbs.svelte';
	import BackToTop from '$lib/components/docs/BackToTop.svelte';
	import ReadingTime from '$lib/components/docs/ReadingTime.svelte';
	import type { Snippet } from 'svelte';
	import { browser } from '$app/environment';
	import { afterNavigate } from '$app/navigation';

	let { children }: { children: Snippet } = $props();

	let sidebarOpen = $state(false);
	let sidebarCollapsed = $state(false);
	let isDark = $state(false);

	function toggleSidebar() {
		sidebarOpen = !sidebarOpen;
	}

	function toggleSidebarCollapse() {
		sidebarCollapsed = !sidebarCollapsed;
		if (browser) {
			localStorage.setItem('sidebar-collapsed', sidebarCollapsed ? '1' : '0');
		}
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
			sidebarCollapsed = localStorage.getItem('sidebar-collapsed') === '1';
		}
	});

	function addCopyButtons() {
		if (!browser) return;
		document.querySelectorAll('.prose pre').forEach((pre) => {
			if (pre.querySelector('.copy-btn')) return;
			const wrapper = document.createElement('div');
			wrapper.className = 'code-block-wrapper';
			pre.parentNode?.insertBefore(wrapper, pre);
			wrapper.appendChild(pre);

			const btn = document.createElement('button');
			btn.className = 'copy-btn';
			btn.setAttribute('aria-label', 'Copy code');
			btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
			btn.addEventListener('click', () => {
				const code = pre.querySelector('code')?.textContent || '';
				navigator.clipboard.writeText(code).then(() => {
					btn.classList.add('copied');
					btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
					setTimeout(() => {
						btn.classList.remove('copied');
						btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
					}, 1500);
				});
			});
			wrapper.appendChild(btn);
		});
	}

	function addHeadingAnchors() {
		if (!browser) return;
		document.querySelectorAll('.prose h1[id], .prose h2[id], .prose h3[id]').forEach((heading) => {
			if (heading.querySelector('.heading-anchor')) return;
			const id = heading.getAttribute('id');
			if (!id) return;

			heading.classList.add('heading-with-anchor');

			const btn = document.createElement('button');
			btn.className = 'heading-anchor';
			btn.setAttribute('aria-label', 'Copy link');
			btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
			btn.addEventListener('click', (e) => {
				e.preventDefault();
				const url = `${window.location.origin}${window.location.pathname}#${id}`;
				navigator.clipboard.writeText(url).then(() => {
					btn.classList.add('copied');
					btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
					setTimeout(() => {
						btn.classList.remove('copied');
						btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
					}, 1500);
				});
			});
			heading.appendChild(btn);
		});
	}

	afterNavigate(() => {
		setTimeout(() => {
			addCopyButtons();
			addHeadingAnchors();
		}, 50);
	});
</script>

<div class="min-h-screen bg-white dark:bg-gray-900">
	<Header onToggleSidebar={toggleSidebar} onToggleSidebarCollapse={toggleSidebarCollapse} onToggleTheme={toggleTheme} {isDark} {sidebarCollapsed} />
	<Sidebar isOpen={sidebarOpen} sidebarHidden={sidebarCollapsed} />

	<main class="pt-12 xl:pr-50 {sidebarCollapsed ? '' : 'lg:pl-60'}" style="transition: padding-left 150ms;">
		<div class="mx-auto max-w-3xl overflow-hidden px-6 py-8">
			<Breadcrumbs />
			<div class="mb-2 flex items-center gap-3">
				<ReadingTime />
			</div>
			<article class="prose min-w-0" data-pagefind-body>
				{@render children()}
			</article>
			<PageMeta />
			<PrevNext />
		</div>
	</main>

	<TableOfContents />
	<BackToTop />
</div>
