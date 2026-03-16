# Marketing & Content

## Tone

Confident, friendly, approachable. Not corporate-stiff, not try-hard casual. Write like you're explaining something cool to a smart colleague over coffee.

## Humor

Toss in a joke or ironic sentence every now and then. Keep it natural. If it feels forced, cut it. A well-placed quip lands better than three mediocre ones.

## Positioning

ArgoPlane gives developers operational superpowers inside ArgoCD, then adds a lightweight self-service portal for everything ArgoCD's extension system can't handle.

**Layer 1 (extensions)**: operational visibility inside ArgoCD. Metrics, logs, alerts, backups, network flows, policy violations, traces. Resource tabs, app views, status panels, and system-level dashboards. All inside ArgoCD, zero context switching. Works for power users who live in ArgoCD.

**Layer 2 (portal)**: a self-service platform built on SvelteKit + Go. Service catalog (Helm chart templates for apps, Crossplane XRDs for platform resources), tenant onboarding (one form generates a values.yaml, commits to Git, ApplicationSet does the rest), team membership (assign OIDC groups to roles, scoped to your tenant), and progressive GitOps (start with a form, graduate to owning your Git repo). One Go binary, no database, auth via ArgoCD's Dex.

The broader pitch: you don't need to adopt Backstage, Port, or Humanitec when you can extend ArgoCD with world-class extensions and add a lightweight portal for self-service and management.

## Competitive landscape

- **Backstage** (Spotify): full developer portal framework, plugin ecosystem, but heavy to operate (PostgreSQL, Node.js, plugin API churn). You "build your Backstage," you don't deploy it. Great if you have 50+ tools to unify. Overkill if your platform is ArgoCD-centric.
- **Port**: commercial developer portal, SaaS-first. Polished but vendor-locked.
- **Humanitec**: platform orchestrator, opinionated, commercial. Replaces your workflow rather than extending it.
- **Kratix**: promise-based platform framework, Crossplane alternative. Composable but niche.

ArgoPlane's differentiator: extensions live inside ArgoCD (no new UI for ops tasks). The portal is purpose-built for ArgoCD platforms: same auth (Dex), same RBAC model (AppProjects + groups), same deployment model (GitOps). If your team already uses ArgoCD, ArgoPlane is the natural next step. Not a generic framework you spend months configuring.

## Three personas, three value props

**Platform engineers**: "I define the tenant chart and Crossplane XRDs. The portal turns them into a self-service catalog and tenant onboarding wizard. Teams onboard themselves. No more Slack tickets for namespace creation."

**Team leads**: "My team can self-serve. They browse the catalog, deploy apps via a common Helm chart, and request databases via Crossplane claims. All through forms that commit to our GitOps repo. I manage team membership myself."

**Developers**: "I don't need to learn Kubernetes or GitOps on day one. I pick 'Web Application' from the catalog, fill in my image and port, and it runs. When I'm ready, I edit the YAML in our GitOps repo directly."

## Open Source

Actively encourage and celebrate open-source tools. ArgoPlane is built on ArgoCD, Crossplane, Prometheus, Velero, Cilium, External Secrets Operator, Dex, and other open-source projects. Give credit where it's due.

## Easter Eggs

Sprinkle in subtle easter eggs sparingly: hidden HTML comments, playful alt text, clever variable names in code examples. Don't overdo it.

## Formatting

Never use em dashes. Use periods, commas, colons, semicolons, or parentheses instead.

## Avoid

- Buzzword soup ("synergy", "paradigm shift", "leverage")
- Empty superlatives ("revolutionary", "game-changing", "best-in-class")
- Walls of text. Say what you mean, mean what you say
- Vague promises. Be specific about what each extension does
- Stock photo energy. If the content feels generic, rewrite it
- "Internal developer platform" without explaining what that means concretely
