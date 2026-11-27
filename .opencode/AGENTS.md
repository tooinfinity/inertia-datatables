# OpenCode Instructions — Inertia Datatables

This repository is a Laravel package (`tooinfinity/inertia-datatables`): server-side DataTables for Laravel + Inertia 3 with React, TanStack Table v9, and shadcn/ui. It combines a PHP backend (src/) with a React frontend (registry/data-table/components/).

## Test commands

- Full validation: `composer test` (PHPStan, Pint check, Rector dry-run, Pest type-coverage at 100%, unit tests)
- Pest unit tests: `composer test:unit`
- Formatting check: `composer lint:check`
- Static analysis: `composer analyse`
- Workbench build: `composer build`
- Workbench server: `composer serve`

## Frontend

- Install JS deps: `bun install` (or `npm install`)
- Build frontend: `composer build` (runs `tsc && vite build`, output to `dist/`)

## Before commit or push

Always run registry validation and build before committing or pushing:
- `npm run registry:validate` — validates the registry manifest
- `npm run registry:build` — rebuilds `public/r` artifacts; must be committed when registry source changes

CI verifies that `public/r` artifacts are up to date with registry source, so any change to registry source files must be accompanied by regenerated artifacts committed in the same change.

## Local skills

- `package-scaffold`: adding package capabilities / service-provider wiring (commands, migrations, routes, config, views, assets, publish tags, workbench files).
- `package-testing`: adding or changing package tests with Pest 4/5 and Orchestra Testbench.
- `package-release`: changelog, release notes, tags, GitHub release workflow changes.
- `package-compatibility`: reviewing code/dependencies/CI against the PHP and Laravel support matrix.
- `package-generate-skill`: updating the bundled Boost skill from the package implementation, README, and examples.

## File boundaries

- Never commit `dist/`, `build/`, `vendor/`, `node_modules/`, `.idea/`, `.phpunit.cache` (all gitignored).
- Don't touch `composer.lock` / `package-lock.json` / `bun.lock` unless a dependency change is intended.
- Follow conventional commits (see `.commitlintrc.json`).
- Any new top-level directory or file must either be added to `.gitattributes` `export-ignore` (if not runtime package code) or be added to the expected entry list in `tests/Feature/ComposerArchiveTest.php`. `git archive HEAD` must match that list exactly, or `ComposerArchiveTest` fails.

## shadcn/ui Component Ownership and Protection

The `registry/data-table/components/ui/` directory contains seven package-maintained compatibility shims serving the same UI roles as shadcn/ui primitives (`button`, `input`, `dropdown-menu`, `select`, `checkbox`, `table`, `skeleton`). Of these, only `table.tsx` structurally mirrors the official shadcn/ui `Table` primitive; the others are not verified upstream copies. They are protected to preserve internal package stability during ordinary development. AI coding agents and contributors must not unintentionally modify, replace, refactor, or customize them.

Rules:

1. Protected compatibility shims are read-only during ordinary development.
2. Never modify, refactor, replace, rename, or reformat protected components as part of unrelated work.
3. Never introduce package-specific behavior into protected primitives.
4. Implement package-specific behavior in package-owned DataTable components under `registry/data-table/components/data-table/`.
5. Do not replace shadcn components with custom implementations.
6. Do not update protected components as a side effect of dependency upgrades.
7. Never manually edit generated registry artifacts under `public/r/`.
8. If a primitive lacks a capability the package needs, report the limitation and propose a separate maintenance task.
9. Intentional updates to protected primitives require explicit maintainer authorization and a dedicated maintenance PR.
10. Inspect the final Git diff and explicitly report changes affecting protected paths (`registry/data-table/components/ui/` and `public/r/`).

Protected paths: `registry/data-table/components/ui/` (package-maintained compatibility shims; `table.tsx` structurally mirrors the official shadcn Table), `public/r/` (generated artifacts). Package-owned, editable: `registry/data-table/components/data-table/`. `registry.json` is editable intentionally as the registry manifest source of truth.

Generated artifacts (`public/r/`) are produced by `npm run registry:validate` and `npm run registry:build` from `registry.json` and registry sources. Never edit them manually. CI enforcement and automated upstream drift detection are deferred to PR 2 and PR 3 of this effort.

## Contribution process

- For significant changes, open an issue first to discuss the approach.
- Fork, branch, code, test, commit, push locally. To open a PR, run `gh pr create --template-file .github/pull_request_template.md` so the PR follows the repo template.
- PRs must pass `composer test` and `composer lint:check`, include tests for changed behavior, update `CHANGELOG.md` and docs/README for user-facing changes, and rebase on `main`.