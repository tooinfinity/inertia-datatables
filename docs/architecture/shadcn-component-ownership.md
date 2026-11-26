# shadcn/ui Component Ownership

This document establishes the explicit ownership and modification policy for shadcn/ui components, package-owned DataTable components, and generated registry artifacts in `tooinfinity/inertia-datatables`.

It exists so that AI coding agents and contributors never unintentionally modify, replace, refactor, or customize protected compatibility shims during ordinary feature development.

## Component ownership boundaries

| Directory / File | Ownership | Policy |
|---|---|---|
| `registry/data-table/components/ui/` | Package-owned compatibility shims serving shadcn/ui UI roles (`table.tsx` structurally mirrors the official shadcn Table) | Protected from casual modification; changes only via a dedicated maintenance task |
| `registry/data-table/components/data-table/` | Package | Editable — package-specific DataTable functionality lives here |
| `public/r/` | Generated artifacts | Never edit manually; regenerate from `registry.json` / registry sources |
| `registry.json` | Package | Editable intentionally — single source of truth for the shadcn registry |

## Component provenance and classification

The `registry/data-table/components/ui/` directory contains package-maintained compatibility shims serving the same UI roles as shadcn/ui primitives (`button`, `input`, `dropdown-menu`, `select`, `checkbox`, `table`, `skeleton`). These shims are used by the package's own frontend and tests through the `@/components/ui` alias; they are **not** distributed to consumers through `public/r/data-table.json`.

When a consumer installs the `data-table` registry block, the `registryDependencies` (`button`, `input`, `dropdown-menu`, `select`, `checkbox`, `table`, `skeleton`) are bare names that resolve to the default shadcn registry, so consumers receive the official upstream shadcn/ui components for those primitives.

They are **not** verbatim copies of the official shadcn/ui components:

- They are minimal implementations without the `cn()` utility, `class-variance-authority` (cva), or Radix UI Primitives that many official shadcn/ui components use.
- They are package-maintained, not official shadcn/ui releases.

### `registry/data-table/components/ui/table.tsx`

`table.tsx` structurally mirrors the official shadcn/ui `Table` primitive (semantic elements `Table`, `TableHeader`, `TableBody`, `TableFooter`, `TableHead`, `TableRow`, `TableCell`, `TableCaption`) but is simplified: it has no `cn()` utility, no `className` prop, and renders `children` directly.

**Classification:** package-maintained compatibility shim. Of the seven files in `components/ui/`, `table.tsx` is the one that structurally mirrors an official shadcn/ui component. The other six shims serve equivalent UI roles but are not verified upstream copies.

`table.tsx` is treated as protected because it mirrors an official shadcn/ui component and is used by the package's own frontend and tests (via the `@/components/ui` alias). All seven shims are protected to preserve internal package stability: casual modification risks breaking the package's frontend and tests and creating silent upgrade hazards when shadcn/ui releases new versions. Do not refactor or reformat any of them as part of unrelated work.

## Package-owned component responsibilities

Package-specific DataTable functionality must be implemented in:

```
registry/data-table/components/data-table/
```

This includes `data-table.tsx`, `data-table-toolbar.tsx`, `data-table-pagination.tsx`, `data-table-column-header.tsx`, `data-table-column-visibility.tsx`, `data-table-empty.tsx`, `use-data-table.ts`, `types.ts`, `table-features.ts`, and `cell-formatters.ts`.

Do not solve package requirements by modifying protected compatibility shims in `components/ui/`. If a shim lacks a capability the package needs, report the limitation and propose a separate maintenance task rather than embedding package-specific behavior into a protected primitive.

## Generated registry artifacts

`public/r/` (`registry.json` and `data-table.json`) are generated from the authoritative registry source (`registry.json` and the files under `registry/data-table/components/`).

- Never manually edit files under `public/r/`.
- `registry.json` is the single source of truth for the shadcn registry.
- Rebuild artifacts after changing the manifest or any distributed source file.

## Why protected compatibility shims must remain unchanged

Protected compatibility shims must:

- Retain their current implementation.
- Retain stable APIs used by the package's DataTable components.
- Avoid package-specific behavior.
- Avoid unrelated formatting or refactoring.
- Remain unchanged during ordinary feature development.

They are protected because they are package-maintained compatibility shims whose APIs the package's DataTable components depend on (imported as `@/components/ui/*`). Protection exists to preserve internal package stability: casual modification risks breaking the package's own frontend and tests and creating silent upgrade hazards when shadcn/ui releases new versions. This protection applies regardless of whether a given shim has a verified upstream counterpart.

Note: the local shims under `components/ui/` are **not** distributed to consumers through `public/r/data-table.json`. The artifact lists only the `data-table/` component files. The `registryDependencies` (`button`, `input`, `dropdown-menu`, `select`, `checkbox`, `table`, `skeleton`) are bare names that resolve to the default shadcn registry when a consumer installs the block, so consumers receive the official upstream components for those primitives.

## How to identify protected components

A component is protected when it lives under:

```
registry/data-table/components/ui/
```

and serves the same UI role as a shadcn/ui primitive (`table`, `button`, `input`, `select`, `dropdown-menu`, `checkbox`, `skeleton`). Components under `registry/data-table/components/data-table/` are package-owned and editable.

When in doubt, check `registry.json`'s `registryDependencies` list: any component named there has a corresponding local shim under `components/ui/` that should be treated as protected. Note that consumers receive the official upstream shadcn/ui components for these dependencies, not the local shims.

## How intentional upstream changes will be handled

Intentional updates to protected compatibility shims require:

1. Explicit maintainer authorization via the `protected-maintenance` GitHub Environment (required reviewer gate).
2. A dedicated maintenance PR (not bundled with unrelated feature work).
3. Verification that consumer-facing behavior and the registry dependencies remain compatible.

See "Intentional maintenance changes to protected files — authorization mechanism" and "How to update a local compatibility shim deliberately" below for the step-by-step procedure.

## Enforcement: CODEOWNERS and CI

Ownership boundaries are enforced through two complementary mechanisms.

### CODEOWNERS (`.github/CODEOWNERS`)

Review responsibility for protected paths is assigned in `.github/CODEOWNERS`:

- `registry/data-table/components/ui/` — package-maintained compatibility shims (`@tooinfinity`).
- `public/r/` — generated registry artifacts (`@tooinfinity`).
- `registry.json` — registry source of truth (`@tooinfinity`).
- `.github/CODEOWNERS` — ownership rules (`@tooinfinity`).
- `.github/workflows/` — CI enforcement and integration workflows (`@tooinfinity`).
- `scripts/ci/` — CI enforcement, authorization, and version-check scripts (`@tooinfinity`).
- `docs/architecture/shadcn-component-ownership.md` — ownership policy (`@tooinfinity`).

Package-owned DataTable components under `registry/data-table/components/data-table/` are editable during ordinary development, so they carry no protective CODEOWNERS rule.

A CODEOWNERS file alone does not require approval before merging. Mandatory code-owner review only takes effect when a repository administrator enables the corresponding branch-protection or ruleset setting on the default branch:

- Require a pull request before merging.
- Require approval from code owners.
- Ensure the required approval cannot be bypassed through the normal merge process.

### CI checks (`.github/workflows/ownership.yml`)

The `shadcn ownership` workflow runs on pull requests targeting `main`:

1. **CODEOWNERS validation** — verifies `.github/CODEOWNERS` is syntactically valid and that every required protected path carries an explicit ownership rule.

2. **shadcn CLI version consistency** — verifies that the `shadcn@X.Y.Z` version pinned in `package.json` matches every reference in `.github/workflows/integration.yml`. This prevents silent version drift between the local dev toolchain and CI. See `scripts/ci/check-shadcn-version.js`.

3. **Protected-path change detection** — compares the PR branch against the base branch and fails with a clear, actionable message when any file under `registry/data-table/components/ui/` is added, modified, renamed, or deleted without valid authorization. Ordinary DataTable component changes under `registry/data-table/components/data-table/` are not affected.

Generated registry artifacts under `public/r/` are verified for drift by the existing `Registry` workflow (`.github/workflows/registry.yml`), which validates `registry.json`, rebuilds the artifacts, and fails when committed artifacts are out of date or contain untracked files.

### Intentional maintenance changes to protected files — authorization mechanism

Intentional updates to protected compatibility shims require explicit maintainer authorization via a dedicated maintenance PR. The authorization mechanism uses a **GitHub Actions Environment with required reviewers** (`protected-maintenance`), which must be configured by a repository administrator.

**Workflow:**

1. Add the label `maintenance: protected-component` to the PR.
2. The `authorize-maintenance` job runs in the `protected-maintenance` GitHub Environment. GitHub blocks the job until an eligible required reviewer approves the deployment. This is a human-in-the-loop gate enforced by GitHub, not by CI code.
3. After approval, the job verifies the approving identity in the deployment review history and records that identity and the time it was verified as job outputs.
4. The `enforce-ownership` job reads those outputs and passes them as `MAINTENANCE_AUTHORIZED`, `MAINTENANCE_AUTHORIZED_BY`, and `MAINTENANCE_AUTHORIZED_AT` environment variables to `protected-paths.js`.
5. `protected-paths.js` calls `check-maintenance-authorization.js` to validate all three variables. Only when all are present and correct does the protected-path check pass.
6. The authorization decision (actor, timestamp, reason) is recorded in the workflow log for audit purposes.

**Security properties:**

- A label, branch name, PR title, or commit message alone is never sufficient authorization. The label only routes the PR to the environment gate.
- The environment's required-reviewer gate is enforced by GitHub; a job that has not passed through the environment cannot set `MAINTENANCE_AUTHORIZED=true`.
- Fail-closed: any missing or malformed authorization metadata causes the check to exit 1.
- Unauthorized actors cannot self-authorize: the environment gates who can approve the deployment to run.

**Administrator prerequisite:**

A repository administrator must create a GitHub Actions Environment named exactly `protected-maintenance`, enable **Prevent self-review**, and add at least one eligible required reviewer who is not the PR author. CI rejects missing or ambiguous approval records and approvals by the PR author. The environment is configured at:

> `https://github.com/<org>/<repo>/settings/environments`

The CODEOWNERS code-owner review requirement is a separate, complementary gate enforced by branch protection. Both gates must be satisfied for a maintenance PR to be mergeable.

**Single-maintainer limitation:**

If the only CODEOWNER is also the PR author, add an eligible independent CODEOWNER who can approve the protected paths. The PR also requires approval from an eligible `protected-maintenance` environment reviewer. The same independent collaborator can provide both approvals if eligible for both roles. Any alternative governance arrangement must be explicitly approved and documented for both gates.

## Repository ruleset configuration (administrator action required)

The following settings must be configured by a repository administrator on the `main` branch. CODEOWNERS alone does not enforce review without branch protection.

**Branch ruleset settings for `main`:**

| Setting | Required value |
|---|---|
| Require a pull request before merging | ✅ Enabled |
| Require status checks to pass before merging | `Enforce shadcn component ownership` |
| Required approvals | At least 1 |
| Require review from Code Owners | ✅ Enabled |
| Dismiss stale pull request approvals when new commits are pushed | ✅ Enabled |
| Require approval of the most recent reviewable push | ✅ Enabled (where supported) |
| Restrict who can push to matching branches | ✅ Enabled (prevent direct pushes to `main`) |
| Block force pushes | ✅ Enabled |
| Restrict deletions | ✅ Enabled |

Do not require `Authorize protected-component maintenance`: that job is intentionally skipped for ordinary pull requests.

**GitHub Actions Environment for `protected-maintenance`:**

| Setting | Required value |
|---|---|
| Environment name | `protected-maintenance` (exact) |
| Required reviewers | At least 1 eligible reviewer who is not the PR author |
| Deployment protection rules | Required reviewers and **Prevent self-review** enabled |
| Wait timer | Optional; consider a short delay (e.g. 5–15 min) to allow cancellation |

These settings cannot be configured through repository code or CI — they require administrator access to `Settings > Branches` (or `Settings > Rulesets`) and `Settings > Environments`.

> [!IMPORTANT]
> Maintenance authorization requires a recorded deployment approval. Configure both required reviewers and **Prevent self-review** before using this workflow.

## Upstream compatibility audit

The package maintains an automated compatibility audit that checks the package-maintained shadcn/ui compatibility shims under `registry/data-table/components/ui/` against the official shadcn/ui upstream sources. The audit is implemented in `scripts/ci/shadcn-compatibility-audit.js` and driven by the manifest in `scripts/ci/shadcn-compatibility-manifest.json`. It runs in CI through the `shadcn compatibility audit` workflow (`.github/workflows/shadcn-compatibility-audit.yml`).

### Purpose

The audit detects upstream changes that may require reviewing our compatibility shims. It is **audit-only**: it identifies review requirements but never modifies local component files. Upstream changes are signals for review, not instructions to copy upstream code.

### How upstream references are pinned

Each component in the manifest records an explicit upstream source URL pinned to a specific commit SHA on the official shadcn/ui repository (`shadcn-ui/ui`, branch `main`, style `new-york-v4`). Pinning to a commit SHA makes the audit reproducible and prevents it from silently following arbitrary upstream changes. The pinned commit is the **baseline**: it is the upstream revision that was last reviewed and accepted as compatible with the local shims.

### How the audit compares local shims against the baseline

Validation mode (runs on every push/PR) fetches and compares only the pinned baseline source for `table.tsx`, while the six manual entries are reported for manual review (validation does not fetch their sources). This is deterministic: it always uses `manifest.upstream.baselineCommit`, never a mutable upstream reference. Of the seven shims, only `table.tsx` uses the `structural` comparison strategy; the other six are `manual` and are not automatically compared. Validation verifies that the exported component names and rendered HTML elements of `table.tsx` remain compatible with the pinned upstream revision. An unchanged result means no structural difference was detected — it does not establish complete compatibility (e.g. prop or keyboard behavior changes are not captured by structural comparison).

### How to run the audit locally

**Validation mode** (compares local shims against the pinned baseline — deterministic, runs on every PR):

```bash
npm ci
node scripts/ci/shadcn-compatibility-audit.js
```

**Drift detection mode** (discovers the latest upstream commit and compares it against the baseline — reports whether upstream has changed since the baseline was reviewed):

```bash
npm ci
node scripts/ci/shadcn-compatibility-audit.js --drift
```

The audit fetches each pinned upstream source and compares it against the local shim (validation mode) or the baseline source (drift mode). It does not modify any files.

### CI jobs

The `shadcn compatibility audit` workflow (`.github/workflows/shadcn-compatibility-audit.yml`) runs two jobs:

1. **Validate** (runs on every push/PR to `main`): deterministic validation mode that compares local shims against the pinned baseline commit. Never follows mutable upstream references.
2. **Detect upstream drift** (runs on a weekly schedule and via manual dispatch): discovers the latest commit on the upstream branch and compares it against the baseline. Reports whether shadcn/ui has changed since the baseline was reviewed.

### How to interpret results

Exit status:
- `0` — no issues found.
- `1` — one or more structural differences or manifest validation failures (requires review).
- `2` — network or upstream retrieval failure, unreadable or unparsable local shims, or unreadable/malformed JSON manifest (distinguishable from compatibility findings).

Output categories:
- `[ok]` — no structural differences between the local shim and the pinned upstream source.
- `[manual-review]` — role-equivalent shim with no automated source comparison (see below).
- `[review-required]` — upstream structural difference detected (exported component names or rendered HTML elements differ). This is a signal for review, not an instruction to copy upstream code.
- `[upstream-error]` — failed to retrieve the pinned upstream source (network or availability problem).
- `[error]` — local file error (e.g. missing or unreadable local shim).

### Manifest validation

The manifest (`scripts/ci/shadcn-compatibility-manifest.json`) is validated on every audit run. It must:
- Contain exactly the seven expected component entries (button, checkbox, dropdown-menu, input, select, skeleton, table)
- Have no duplicate component names
- Validate local paths (must point to `.tsx` files)
- Validate comparison strategies (`structural` for `table`, `manual` for all other shims)
- Validate upstream repository format (exactly two non-empty segments `owner/repo`)
- Validate upstream commit SHA format (40-char hex)
- Validate upstream source URLs (must be HTTPS)

An invalid manifest fails CI with exit status 1.

### How drift mode discovers and compares the latest upstream commit

Drift detection mode (runs on a weekly schedule and via manual dispatch) does two things:

1. Discovers the latest commit SHA on the upstream `main` branch (`manifest.upstream.branch`) through the GitHub API.
2. For the structurally-compared component (`table.tsx`), fetches the upstream source at that latest commit and compares it against the **baseline structure** (the structure extracted from the pinned `baselineCommit` source).

Drift mode applies the same subset rule as validation mode: it reports only rendered HTML elements the baseline component renders that the latest upstream no longer renders (i.e., removed elements). Elements the latest upstream adds are **not** reported, since upstream may add wrapper elements without creating an incompatibility. Drift mode detects structural differences in `table.tsx` only — it does not detect every upstream change, and the six `manual` shims are not drift-compared. An unchanged result means no structural drift was detected — it does not establish complete compatibility. It never modifies local files; it only surfaces drift for review.

### Where the report exposes both commit SHAs

In drift mode, the audit prints a header line before the report:

```
drift detection: baseline=<baselineCommit>, latest=<latestCommit>
```

Each drift result also carries the `latest` commit in its `commit` field. Together these tell a maintainer exactly which two commits are being compared: the pinned baseline (`baselineCommit`) and the latest upstream (`latestCommit`).

### How to review an upstream change

When the audit reports `[review-required]` for a component in drift mode:

1. Note the two commits from the report header: `baseline=<baselineCommit>` and `latest=<latestCommit>`.
2. Open the upstream source at both commits and diff them (e.g. compare `{baselineCommit}/.../{component}.tsx` against `{latestCommit}/.../{component}.tsx` on `raw.githubusercontent.com` or GitHub's compare view).
3. Identify which exported components or rendered HTML elements changed (the report lists them).
4. Determine whether the upstream change affects the UI role the local shim serves.
5. If an update is warranted, open a dedicated maintenance PR with explicit maintainer authorization. Do not bundle the update with unrelated feature work.
6. Never automatically synchronize or overwrite local shim files.

### How to decide whether an upstream change requires a local compatibility update

Not every upstream change requires touching the local shims:

- If upstream only changed styling, class names, or internals that do not alter the exported component set or the rendered HTML elements, no local change is needed — the local shim still serves the same UI role. Changes to props or keyboard behavior can still require compatibility review even when exports and rendered elements are unchanged, though not every such change requires a local update.
- If upstream removed or renamed an exported component the local shim relies on, or removed an HTML element the local shim renders, the local shim may need review to remain compatible.
- Remember that six of the seven shims are `role-equivalent` minimal implementations, not verified upstream copies; their source diff is not meaningful and changes always require manual review.

Only `table.tsx` is eligible for automated structural comparison, and even then intentional simplifications (no `cn()`, no cva, no `className` prop, renders children directly) are not flagged as incompatibilities.

### Why the audit intentionally does not automatically synchronize or overwrite local components

The audit is audit-only: it identifies review requirements but never modifies local component files. Local compatibility shims are intentionally simplified and must not be automatically synchronized with upstream. Automatic synchronization would risk overwriting deliberate local simplifications, breaking the package's frontend and tests, and introducing silent upgrade hazards when shadcn/ui releases new versions. Any intentional update to a protected compatibility shim requires explicit maintainer authorization and a dedicated maintenance PR.

### How to update a local compatibility shim deliberately

Intentional updates to protected compatibility shims require:

1. Explicit maintainer authorization via the `protected-maintenance` GitHub Environment.
2. A dedicated maintenance PR (not bundled with unrelated feature work).
3. Verification that consumer-facing behavior and the registry dependencies remain compatible.

**Step-by-step:**

1. Open a dedicated maintenance PR that modifies only the protected shim(s) that require updating. Do not bundle unrelated feature work.
2. Add the label `maintenance: protected-component` to the PR.
   - **Run-initiator restriction:** When **Prevent self-review** is enabled on the `protected-maintenance` environment, GitHub prevents the user who initiated the workflow run from approving its deployment—even if that user is not the PR author. If an independent eligible reviewer adds the label, they become the run initiator and cannot approve that run; in that case, have the PR author push a commit (or re-trigger the workflow from the author's account) to start a new run that the independent maintainer can approve.
3. The `shadcn ownership` workflow detects the label and routes the PR to the `authorize-maintenance` job.
4. GitHub blocks the `authorize-maintenance` job until a required reviewer (configured by an administrator in the `protected-maintenance` environment) approves the deployment. The approving reviewer must not be the PR author.
5. After approval, the authorization is recorded in the workflow log (actor, timestamp, environment).
6. The `enforce-ownership` job reads the authorization and allows the protected-path change to proceed.
7. CODEOWNERS code-owner review (enforced by branch protection) still applies and must be satisfied separately.
8. All other required CI checks (tests, type check, lint, compatibility audit) must also pass.

**Investigating a failed authorization:**

- If the `Record authorization` step fails: check that GitHub recorded an unambiguous approval for `protected-maintenance` by an eligible reviewer other than the PR author. If reruns have left conflicting approval records, start a new workflow run.
- If the `Detect protected compatibility shim changes` step fails despite authorization: re-inspect the authorization env vars in the workflow log. The check is fail-closed on incomplete metadata.
- If the `authorize-maintenance` job is skipped: the `maintenance: protected-component` label was not present, or the event was not a pull request.

**Repository administrator requirements:**

The following settings must be configured by an administrator before any maintenance PR can be merged:

1. Create a GitHub Actions Environment named exactly `protected-maintenance` at `Settings > Environments`.
2. Enable **Prevent self-review** and add at least one eligible required reviewer who is not the PR author.
3. Enable branch protection on `main`: require pull requests, require the `Enforce shadcn component ownership` status check and CODEOWNER review, dismiss stale approvals, prevent force pushes, prevent branch deletion. Do not require `Authorize protected-component maintenance`, which is skipped for ordinary pull requests.

### Components requiring manual review

The following components are classified as `role-equivalent-shim` with `manual` comparison strategy. They are **not** verified upstream copies, so source diff is not meaningful. Changes to upstream always require manual compatibility review:

- `button.tsx` — minimal `<button>` shim; omits `cn()`, cva, and Radix UI primitives.
- `input.tsx` — minimal `<input>` shim; omits `cn()`, cva, and field wrapper pattern.
- `select.tsx` — minimal select shim; omits `cn()`, cva, Radix UI Primitives, and popover-based content.
- `dropdown-menu.tsx` — minimal dropdown menu shim; omits `cn()`, cva, and Radix UI Primitives.
- `checkbox.tsx` — minimal checkbox `<input>` shim; omits `cn()`, cva, and Radix UI Primitives.
- `skeleton.tsx` — minimal `<div>` shim; omits `cn()`, cva, animation, and pulse styling.

Only `table.tsx` is classified as `structurally-mirrors-upstream` and is eligible for automated structural comparison. Even then, intentional simplifications (no `cn()`, no cva, no `className` prop, renders children directly) are not flagged as incompatibilities.

## How generated artifacts should be updated

After changing `registry.json` or any file under `registry/data-table/components/`:

```bash
npm ci
npm run registry:validate
npm run registry:build
```

- `npm run registry:validate` — validates the registry manifest against the shadcn schema.
- `npm run registry:build` — runs `shadcn build`, which clears and regenerates `public/r/` from the registry sources.

CI verifies that `public/r/` artifacts are up to date with registry source; any change to registry sources must be accompanied by regenerated artifacts committed in the same change. Never edit `public/r/` by hand.

## Practical examples

**Allowed (package-owned, editable):**

- Adding a column filter control to `data-table-toolbar.tsx`.
- Changing row selection behavior in `use-data-table.ts`.
- Adding a new component under `components/data-table/`.

**Not allowed during ordinary development (protected, package-maintained):**

- Reformatting `table.tsx` to match a newer code style.
- Adding package-specific props or behavior to `button.tsx` / `table.tsx`.
- Replacing `table.tsx` with a custom table implementation.
- Editing `public/r/data-table.json` directly to fix a rendering issue.

**How to handle an upstream limitation:**

- Do not work around it by editing `components/ui/`.
- Open an issue documenting the limitation.
- Propose a dedicated maintenance task (or PR 2/PR 3 enforcement) to update the protected component with explicit maintainer authorization.
