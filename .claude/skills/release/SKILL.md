---
name: release
description: Cut an ArgoPlane release (optional release candidate, chart bump PR, tag, GitHub Release with notes). Use when the user wants to release, tag a version, or publish a release candidate.
user-invocable: true
argument-hint: "[version, e.g. 1.8.0 or 1.8.0-rc.1]"
allowed-tools: Bash(git *), Bash(gh *), Bash(helm *), Bash(bash hack/check-extension-consistency.sh), Read, Edit, Write
---

# Release ArgoPlane

Release **$ARGUMENTS** (or work out the version below if none was given).

Pushing a `v*` tag runs `.github/workflows/release.yml`, which builds and pushes
every image (amd64 + arm64) and the Helm chart to
`oci://ghcr.io/natrontech/charts/argoplane`. A pushed tag publishes images, so
treat it as irreversible: if a release turns out broken, fix forward with a patch
release rather than moving the tag. The workflow does **not** create the GitHub
Release; step 6 does.

Never build or push images from the local machine.

## 1. Preconditions

```bash
git switch main && git pull --ff-only
git status --short                                   # must be empty
gh run list --branch main --limit 4                  # CI and docs green on HEAD
bash hack/check-extension-consistency.sh
git describe --tags --abbrev=0                       # last release
```

Stop and report if the tree is dirty or CI is red on `HEAD`.

## 2. Version

Without an argument, derive it from the Conventional Commits since the last
release (`git log --format=%s <last-tag>..HEAD`): a breaking change (`!` or
`BREAKING CHANGE`) bumps major, any `feat` bumps minor, otherwise patch. State
the version and the reason, and confirm it with the user before tagging.

## 3. Release candidate (optional, recommended for larger releases)

```bash
git tag -a vX.Y.Z-rc.N -m vX.Y.Z-rc.N && git push origin vX.Y.Z-rc.N
gh run watch "$(gh run list --workflow release.yml --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
gh release create vX.Y.Z-rc.N --verify-tag --prerelease --generate-notes
```

The user tests the RC on a real cluster. Fixes go to `main` and get a new
`-rc.N+1`. Skip this step only when the user says so.

## 4. Chart bump PR

The workflow sets the chart version during packaging; this PR keeps
`deploy/helm/argoplane/Chart.yaml` in the repo in sync.

```bash
git switch -c release/vX.Y.Z
sed -i '' 's/^version:.*/version: X.Y.Z/; s/^appVersion:.*/appVersion: "X.Y.Z"/' deploy/helm/argoplane/Chart.yaml
git commit -am "chore(release): bump chart to X.Y.Z"
git push -u origin release/vX.Y.Z
gh pr create --base main --title "chore(release): bump chart to X.Y.Z" --body "..."
```

The PR body says what is being released (e.g. "X.Y.Z is vX.Y.Z-rc.N unchanged",
or which commits it adds). Wait for CI, then merge with a merge commit
(`gh pr merge --merge --delete-branch`), as earlier release PRs were.

## 5. Tag

Tag the merge commit, annotated, then watch the workflow:

```bash
git switch main && git pull --ff-only
git tag -a vX.Y.Z -m vX.Y.Z && git push origin vX.Y.Z
gh run watch "$(gh run list --workflow release.yml --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
```

If the workflow fails, stop and report the failing job. Do not create the
GitHub Release for a tag whose images or chart did not publish.

## 6. GitHub Release

Notes follow the house style of earlier releases (`gh release view v1.7.0`):

- `## Highlights`: bullets with a **bold area lead-in**, concrete user-facing
  changes, contributors thanked with `(#PR, thanks @login)`.
- `## Upgrade notes`: anything an operator must know before upgrading (new
  defaults, changed APIs, opt-in features that carry risk). Omit when empty.
- GitHub's generated "What's Changed" list is appended by `--generate-notes`.

No em dashes, no buzzwords (see `.claude/rules/marketing.md`). Show the draft to
the user and get approval before publishing: release notes are public.

```bash
gh release create vX.Y.Z --verify-tag --title vX.Y.Z --notes-file <draft.md> --generate-notes
```

## 7. Verify

```bash
helm show chart oci://ghcr.io/natrontech/charts/argoplane --version X.Y.Z | grep -E '^(version|appVersion)'
gh release view vX.Y.Z --json isLatest,isPrerelease
```

Report the release URL to the user.
