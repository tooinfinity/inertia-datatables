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

1. Explicit maintainer authorization.
2. A dedicated maintenance PR (not bundled with unrelated feature work).
3. Verification that consumer-facing behavior and the registry dependencies remain compatible.

CI enforcement of these boundaries (read-only checks on protected paths) and automated upstream drift detection are **deferred to PR 2 and PR 3** of this effort. This PR establishes the documentation and agent-instruction foundation only.

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
