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

## Contribution process

- For significant changes, open an issue first to discuss the approach.
- Fork, branch, code, test, commit, push locally. To open a PR, run `gh pr create --template-file .github/pull_request_template.md` so the PR follows the repo template.
- PRs must pass `composer test` and `composer lint:check`, include tests for changed behavior, update `CHANGELOG.md` and docs/README for user-facing changes, and rebase on `main`.