import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { execSync } from 'child_process';
import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import adapter from '@sveltejs/adapter-static';
import { mdsvex, escapeSvelte, type MdsvexOptions } from 'mdsvex';
import { createHighlighter } from 'shiki';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';

const highlighter = await createHighlighter({
	themes: ['github-dark', 'github-light'],
	langs: [
		'javascript',
		'typescript',
		'svelte',
		'html',
		'css',
		'bash',
		'json',
		'yaml',
		'go',
		'dockerfile',
		'markdown'
	]
});

const mdsvexOptions: MdsvexOptions = {
	extensions: ['.svx'],
	highlight: {
		highlighter: async (code: string, lang?: string | null) => {
			const html = escapeSvelte(
				highlighter.codeToHtml(code, {
					lang: lang ?? 'text',
					themes: {
						light: 'github-light',
						dark: 'github-dark'
					}
				})
			);
			return `{@html \`${html}\`}`;
		}
	},
	remarkPlugins: [remarkGfm],
	// @ts-expect-error mdsvex's types predate unified 11; runtime is fine
	rehypePlugins: [rehypeSlug, [rehypeAutolinkHeadings, { behavior: 'wrap' }]]
};

function gitLastUpdatedPlugin() {
	const virtualModuleId = 'virtual:git-timestamps';
	const resolvedVirtualModuleId = '\0' + virtualModuleId;

	return {
		name: 'git-last-updated',
		resolveId(id: string) {
			if (id === virtualModuleId) return resolvedVirtualModuleId;
		},
		load(id: string) {
			if (id !== resolvedVirtualModuleId) return;

			const routesDir = join(process.cwd(), 'src/routes');
			const timestamps: Record<string, string> = {};

			function walk(dir: string) {
				for (const entry of readdirSync(dir)) {
					const full = join(dir, entry);
					if (statSync(full).isDirectory()) {
						walk(full);
					} else if (entry.endsWith('.svx')) {
						try {
							const date = execSync(`git log -1 --format=%aI -- "${full}"`, {
								encoding: 'utf-8',
								cwd: process.cwd(),
								stdio: ['pipe', 'pipe', 'pipe']
							}).trim();
							if (date) {
								const rel = relative(routesDir, dir);
								const route = rel === '' ? '/' : '/' + rel.replace(/\\/g, '/');
								timestamps[route] = date;
							}
						} catch {
							// skip
						}
					}
				}
			}

			walk(routesDir);
			return `export default ${JSON.stringify(timestamps)};`;
		}
	};
}

export default defineConfig({
	plugins: [
		tailwindcss(),
		gitLastUpdatedPlugin(),
		sveltekit({
			extensions: ['.svelte', '.svx'],
			preprocess: [mdsvex(mdsvexOptions)],
			adapter: adapter({
				fallback: '404.html'
			}),
			paths: {
				base: (process.env.BASE_PATH || '') as '' | `/${string}`
			}
		})
	]
});
