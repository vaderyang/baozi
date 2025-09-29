# Repository Guidelines

## Project Structure & Module Organization
- `app/` contains the React front-end (scenes, components, menus) with UI-focused tests in `app/test/`.
- `server/` hosts the Koa-based API, background workers, migrations, and Jest suites in `server/test/`.
- `shared/` provides TypeScript utilities, validation, and editor helpers shared across environments, with matching tests in `shared/test/`.
- `plugins/` and `__mocks__/` extend functionality and testing, while `public/` serves static assets and `docs/` aggregates product and contributor references.

## Build, Test, and Development Commands
- `yarn dev:watch` runs backend rebuilds plus the Vite dev server; use when iterating locally.
- `yarn dev:backend` rebuilds the server on file changes, and `yarn vite:dev` starts the web client only.
- `yarn build` produces production bundles (`build/`), and `yarn clean` clears artifacts.
- `yarn lint` (oxlint) and `yarn format:check` (Prettier) gate style; `yarn format` can auto-fix.
- `yarn test`, `yarn test:app`, `yarn test:server`, and `yarn test:shared` execute Jest projects; `make test` seeds a PostgreSQL container first.

## Coding Style & Naming Conventions
- All code is TypeScript-first; prefer `.tsx` for React and `.ts` elsewhere.
- Prettier enforces two-space indentation, trailing commas, and double quotes in JSON—run before committing.
- Follow PascalCase for components/classes (`app/components/Navigation.tsx`) and camelCase for functions/variables; keep filenames aligned with exported symbols.
- Favor module boundaries already established: reuse helpers in `shared/` instead of duplicating in `app/` or `server/`.

## Testing Guidelines
- New features require Jest coverage in the directory matching the runtime (UI, server, or shared).
- Name test files `*.test.ts(x)` and keep fixtures in colocated `__mocks__/` helpers.
- Run `yarn test` before submitting; for focused work, invoke the scoped project command.
- Ensure time-sensitive assertions set `TZ=UTC` (handled automatically by scripts) and mock network/storage interactions via provided factories.

## Commit & Pull Request Guidelines
- Match the existing Conventional-style log: `fix: adjust auth redirect (#10237)` or `chore(deps): bump aws-sdk (#10231)`.
- Reference GitHub issues or discussions in commit bodies; keep PRs scoped to a single concern with a clear checklist of migrations, env vars, and screenshots when UI changes apply.
- Confirm lint, build, and tests pass locally; note any skipped steps and justify them in the PR description.
