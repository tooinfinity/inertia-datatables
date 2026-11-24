# shadcn/ui Component Ownership

This document establishes the explicit ownership and modification policy for shadcn/ui components, package-owned DataTable components, and generated registry artifacts in `tooinfinity/inertia-datatables`.

It exists so that AI coding agents and contributors never unintentionally modify, replace, refactor, or customize verified upstream shadcn/ui components during ordinary feature development.

## Component ownership boundaries

| Directory / File | Ownership | Policy |
|---|---|---|
| `registry/data-table/components/ui/` | Package-owned compatibility shims mirroring shadcn/ui primitives (`table.tsx` is upstream-derived) | Protected from casual modification; changes only via a dedicated maintenance task |
| `registry/data-table/components/data-table/` | Package | Editable — package-specific DataTable functionality lives here |
| `public/r/` | Generated artifacts | Never edit manually; regenerate from `registry.json` / registry sources |
| `registry.json` | Package | Editable intentionally — single source of truth for the shadcn registry |

## Verified upstream component provenance

The `registry/data-table/components/ui/` directory contains compatibility shims that mirror shadcn/ui primitives, distributed to consumers as registry dependencies (`button`, `input`, `dropdown-menu`, `select`, `checkbox`, `table`, `skeleton`).

They are **not** verbatim copies of the official shadcn/ui components:

- They do not use the `cn()` utility, `class-variance-authority` (cva), or Radix UI Primitives that official shadcn/ui components rely on.
- They are minimal, package-maintained implementations.

### `registry/data-table/components/ui/table.tsx`

`table.tsx` structurally mirrors the official shadcn/ui `Table` primitive (semantic elements `Table`, `TableHeader`, `TableBody`, `TableFooter`, `TableHead`, `TableRow`, `TableCell`, `TableCaption`) but is simplified: it has no `cn()` utility, no `className` prop, and renders `children` directly.

**Classification:** upstream-derived compatibility shim. It is treated as a protected primitive because it mirrors an official shadcn/ui component and is distributed to consumers as the `table` registry dependency. Do not refactor or reformat it as part of unrelated work.

## Package-owned component responsibilities

Package-specific DataTable functionality must be implemented in:

```
registry/data-table/components/data-table/
```

This includes `data-table.tsx`, `data-table-toolbar.tsx`, `data-table-pagination.tsx`, `data-table-column-header.tsx`, `data-table-column-visibility.tsx`, `data-table-empty.tsx`, `use-data-table.ts`, `types.ts`, `table-features.ts`, and `cell-formatters.ts`.

Do not solve package requirements by modifying protected shadcn primitives in `components/ui/`. If a shadcn primitive lacks a capability the package needs, report the limitation and propose a separate maintenance task rather than embedding package-specific behavior into an upstream primitive.

## Generated registry artifacts

`public/r/` (`registry.json` and `data-table.json`) are generated from the authoritative registry source (`registry.json` and the files under `registry/data-table/components/`).

- Never manually edit files under `public/r/`.
- `registry.json` is the single source of truth for the shadcn registry.
- Rebuild artifacts after changing the manifest or any distributed source file.

## Why upstream components are protected

Verified upstream shadcn/ui components must:

- Preserve their upstream implementation.
- Retain upstream-compatible APIs.
- Avoid package-specific behavior.
- Avoid unrelated formatting or refactoring.
- Remain unchanged during ordinary feature development.

They are protected because they are distributed to consumers as registry dependencies. Casual modification risks breaking consumer installations, diverging from upstream behavior, and creating silent upgrade hazards when shadcn/ui releases new versions.

## How to identify protected components

A component is protected when it lives under:

```
registry/data-table/components/ui/
```

and mirrors a shadcn/ui primitive (`table`, `button`, `input`, `select`, `dropdown-menu`, `checkbox`, `skeleton`). Components under `registry/data-table/components/data-table/` are package-owned and editable.

When in doubt, check `registry.json`'s `registryDependencies` list: any component named there is a shadcn primitive provided by `components/ui/` and should be treated as protected.

## How intentional upstream changes will be handled

Intentional updates to protected shadcn/ui components require:

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

**Not allowed during ordinary development (protected, upstream-derived):**

- Reformatting `table.tsx` to match a newer code style.
- Adding package-specific props or behavior to `button.tsx` / `table.tsx`.
- Replacing `table.tsx` with a custom table implementation.
- Editing `public/r/data-table.json` directly to fix a rendering issue.

**How to handle an upstream limitation:**

- Do not work around it by editing `components/ui/`.
- Open an issue documenting the limitation.
- Propose a dedicated maintenance task (or PR 2/PR 3 enforcement) to update the protected component with explicit maintainer authorization.
