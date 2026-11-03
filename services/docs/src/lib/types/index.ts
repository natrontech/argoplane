import type { RouteId } from '$app/types';

export interface NavItem {
	title: string;
	href: RouteId;
	children?: NavItem[];
}

export interface TOCEntry {
	depth: number;
	text: string;
	slug: string;
}

export interface PageMeta {
	title: string;
	description: string;
}
