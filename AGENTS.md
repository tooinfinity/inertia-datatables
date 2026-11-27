# Inertia Datatables

This repository is a Laravel package. Keep the package focused, idiomatic, and easy for Laravel developers to install, test, and maintain.

## Package Conventions

- Use Laravel-native package APIs and the existing service provider shape before adding abstractions.
- Keep package names, namespaces, Composer metadata, publish tags, documentation, and examples aligned with `tooinfinity/inertia-datatables`.
- Add only the files and dependencies needed for the package behavior being implemented.
- Prefer explicit Laravel package code over helper abstractions unless the extension point is real.
- Keep tests focused on observable package behavior through public APIs, service provider wiring, commands, routes, published resources, and documentation promises.

## Quick Commands

- Full validation: `composer test`
- Formatting check: `composer lint:check`
- Static analysis: `composer analyse`
- Pest tests: `composer test:unit`
- Workbench build: `composer build`
- Workbench server: `composer serve`
- Registry validation: `npm run registry:validate` — validates the registry manifest
- Registry build: `npm run registry:build` — rebuilds `public/r` artifacts; must be committed when registry source changes

## Before commit or push

Always run `npm run registry:validate` and `npm run registry:build` before committing or pushing. CI verifies that `public/r` artifacts are up to date with registry source, so any change to registry source files must be accompanied by regenerated artifacts committed in the same change.

## Local Skills

- `package-scaffold`: use when adding package capabilities or wiring them through the service provider, including commands, migrations, routes, config, views, translations, assets, middleware, publish tags, workbench files, and console-only behavior.
- `package-testing`: use when adding or changing package tests with Pest 4/5 and Orchestra Testbench.
- `package-release`: use when preparing changelog, release notes, tags, or GitHub release workflow changes.
- `package-compatibility`: use when reviewing code, dependencies, or CI against the PHP and Laravel support matrix.
- `package-generate-skill`: use when updating the bundled Boost skill from the package implementation, README, and examples.

## Repository Hygiene

- `dist/`, `build/`, `vendor/`, `node_modules/`, `.idea/`, `.phpunit.cache` are gitignored build artifacts — never commit them.
- Follow conventional commits (see `.commitlintrc.json`).
- Any new top-level directory or file added to the repo must either be added to `.gitattributes` `export-ignore` (if it is not runtime package code) or be added to the expected entry list in `tests/Feature/ComposerArchiveTest.php` (if it should ship in the Composer archive). `git archive HEAD` must produce exactly the entries listed there, or `ComposerArchiveTest` fails.

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

Generated artifacts (`public/r/`) are produced by `npm run registry:validate` and `npm run registry:build` from `registry.json` and registry sources. Never edit them manually.

## Changelog Maintenance

Release Please owns the generated release changelog. Do not manually duplicate release-note entries in implementation PRs.

### Requirements

1. Use Conventional Commits for PR titles and commit messages. The repository's PR-title workflow enforces the configured conventional format.
2. Release Please collects releasable changes from commit history and maintains the release PR and `CHANGELOG.md`.
3. Describe user-visible changes clearly in commit subjects and bodies. Include breaking-change details using the Conventional Commits `!` marker or a `BREAKING CHANGE:` footer.
4. Do not manually add, move, or version changelog entries in ordinary implementation PRs.
5. Update manually maintained documentation only when it is not release-note content.
6. Review the generated changelog in each Release Please PR before merging it. Correct inaccurate or unclear release notes through the source commit message or the release PR when appropriate.

### Definition of Done

Implementation PRs must have accurate Conventional Commit titles. Release PRs must contain the generated changelog and correct version update.

## Release strategy (source of truth)

Release versions are derived exclusively from Git tags on the `main` branch. `composer.json` declares no explicit `version` field, so Packagist infers each package version from the matching Git tag.

- **Release branch:** `main`. All changes merge to `main`; a release is cut by tagging a commit on `main`.
- **Only real tag:** `v0.0.1` (released 2026-10-08). `CHANGELOG.md`'s `[Unreleased]` section compares `v0.0.1...HEAD`. There is no `v0.1.0` tag; the phantom `[v0.1.0]` released section was removed from the changelog.
- **Version scheme:** Semantic Versioning, calculated from Conventional Commits by Release Please.
- **Conventional commits:** PR titles are enforced by `.github/workflows/lint-pr-title.yml`. Use `feat:` for minor changes, `fix:` for patches, and `!` or a `BREAKING CHANGE:` footer for breaking changes. A `breaking` type alone is not the breaking-change indicator.
- **Changelog:** Release Please generates and maintains `CHANGELOG.md` through its release PR. The post-release `update-changelog.yml` workflow is removed to prevent duplicate updates.
- **Distribution:**
  - Composer/Packagist: package `tooinfinity/inertia-datatables`, auto-updated from GitHub tags.
  - shadcn registry: `registry.json` is the source of truth; `public/r/` artifacts are generated by `npm run registry:build` and served from `raw.githubusercontent.com/tooinfinity/inertia-datatables/main/public/r/data-table.json`.
- **Release automation requirements:** Release Please generates release PRs, changelog entries, version bumps, tags, and GitHub releases. Publishing (Composer/Packagist) remains separate from release creation and must not expose publishing credentials to untrusted PR workflows.

