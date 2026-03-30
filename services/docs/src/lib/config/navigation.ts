import type { NavItem } from '$lib/types';

export const navigation: NavItem[] = [
	{
		title: 'Getting Started',
		href: '/getting-started'
	},
	{
		title: 'Architecture',
		href: '/architecture'
	},
	{
		title: 'Extensions',
		href: '/extensions/metrics',
		children: [
			{ title: 'Metrics', href: '/extensions/metrics' },
			{ title: 'Backups', href: '/extensions/backups' },
			{ title: 'Networking', href: '/extensions/networking' },
			{ title: 'Logs', href: '/extensions/logs' },
			{ title: 'Vulnerabilities', href: '/extensions/vulnerabilities' },
			{ title: 'Events', href: '/extensions/events' }
		]
	},
	{
		title: 'Developing',
		href: '/developing',
		children: [
			{ title: 'Overview', href: '/developing' },
			{ title: 'UI Extensions', href: '/developing/ui-extensions' },
			{ title: 'Backend Services', href: '/developing/backend-services' },
			{ title: 'Design System', href: '/developing/design-system' }
		]
	},
	{
		title: 'Deployment',
		href: '/deployment',
		children: [
			{ title: 'Overview', href: '/deployment' },
			{ title: 'ArgoCD Configuration', href: '/deployment/argocd-configuration' },
			{ title: 'CI/CD Pipeline', href: '/deployment/ci-cd' }
		]
	},
	{
		title: 'API Reference',
		href: '/api/metrics',
		children: [
			{ title: 'Metrics API', href: '/api/metrics' },
			{ title: 'Backups API', href: '/api/backups' },
			{ title: 'Networking API', href: '/api/networking' },
			{ title: 'Logs API', href: '/api/logs' },
			{ title: 'Vulnerabilities API', href: '/api/vulnerabilities' },
			{ title: 'Events API', href: '/api/events' }
		]
	},
	{
		title: 'Adoption',
		href: '/adoption'
	},
	{
		title: 'Community',
		href: '/community',
		children: [
			{ title: 'Overview', href: '/community' },
			{ title: 'Contributing', href: '/contributing' },
			{ title: 'About', href: '/about' }
		]
	}
];
