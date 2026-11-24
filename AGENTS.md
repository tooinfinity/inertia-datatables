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

1. Protected shadcn/ui primitives are read-only during ordinary development.
2. Never modify, refactor, replace, rename, or reformat protected components as part of unrelated work.
3. Never introduce package-specific behavior into protected primitives.
4. Implement package-specific behavior in package-owned DataTable components under `registry/data-table/components/data-table/`.
5. Do not replace shadcn components with custom implementations.
6. Do not update protected components as a side effect of dependency upgrades.
7. Never manually edit generated registry artifacts under `public/r/`.
8. If a primitive lacks a capability the package needs, report the limitation and propose a separate maintenance task.
9. Intentional updates to protected primitives require explicit maintainer authorization and a dedicated maintenance PR.
10. Inspect the final Git diff and explicitly report changes affecting protected paths (`registry/data-table/components/ui/` and `public/r/`).

Protected paths: `registry/data-table/components/ui/` (package-maintained shadcn primitives; `table.tsx` structurally mirrors the official shadcn Table), `public/r/` (generated artifacts). Package-owned, editable: `registry/data-table/components/data-table/`. `registry.json` is editable intentionally as the registry manifest source of truth.

Generated artifacts (`public/r/`) are produced by `npm run registry:validate` and `npm run registry:build` from `registry.json` and registry sources. Never edit them manually. CI enforcement and automated upstream drift detection are deferred to PR 2 and PR 3 of this effort.

## Changelog Maintenance

Every change that affects package behavior, functionality, public APIs, compatibility, or developer experience MUST include an appropriate changelog entry.

### Requirements

1. **Update the changelog in the same PR** for every:
   - `feat`: new features or capabilities.
   - `fix`: bug fixes and regressions.
   - `perf`: meaningful performance improvements.
   - `refactor`: only when the change affects observable behavior, public APIs, or developer-facing usage.
   - `deprecate`: newly deprecated functionality.
   - `remove`: removed or breaking functionality.
   - `security`: security fixes or improvements.
   - `docs`: only when documentation changes affect package usage or important developer guidance.

2. **Use the existing changelog format and conventions.**
   - Inspect `CHANGELOG.md` before editing.
   - Preserve its structure, headings, ordering, and writing style.
   - Do not introduce a new changelog format or tool without approval.

3. **Write meaningful entries.**
   - Describe what changed from the package user's perspective.
   - Explain the impact or benefit when relevant.
   - Mention breaking changes, migration steps, or compatibility implications explicitly.
   - Avoid implementation details, internal refactoring noise, and vague entries such as "Various fixes".

4. **Avoid duplicate entries.**
   - Check existing entries before adding a new one.
   - Update an existing entry when appropriate instead of creating duplicates.
   - Do not add an entry for changes that have no user-visible or developer-facing impact.

5. **Keep entries under the correct version section.**
   - Follow the repository's existing unreleased/versioning convention.
   - Never invent a release version.
   - Do not move entries into a released version unless explicitly instructed.

6. **Include changelog verification in the completion report.**
   - State whether the changelog was updated.
   - Identify the section where the entry was added.
   - Explain briefly why no entry was necessary when the change is intentionally excluded.

### Definition of Done

A feature, bug fix, or other changelog-worthy change is not complete until its corresponding changelog entry has been included in the same PR.

Do not create a separate changelog-only PR for a change that can be documented in its implementation PR.
