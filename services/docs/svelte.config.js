import adapter from '@sveltejs/adapter-static';
import { mdsvex, escapeSvelte } from 'mdsvex';
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

/** @type {import('mdsvex').MdsvexOptions} */
const mdsvexOptions = {
	extensions: ['.svx'],
	highlight: {
		highlighter: async (code, lang = 'text') => {
			const html = escapeSvelte(
				highlighter.codeToHtml(code, {
					lang,
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
	rehypePlugins: [rehypeSlug, [rehypeAutolinkHeadings, { behavior: 'wrap' }]]
};

/** @type {import('@sveltejs/kit').Config} */
const config = {
	extensions: ['.svelte', '.svx'],
	preprocess: [mdsvex(mdsvexOptions)],
	kit: {
		adapter: adapter({
			fallback: '404.html'
		}),
		paths: {
			base: process.env.BASE_PATH || ''
		}
	}
};

export default config;
