export interface NavItem {
	title: string;
	href: string;
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
