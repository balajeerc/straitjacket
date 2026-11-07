# Coding Guidelines

## Keeping the code walkthrough up-to-date

- The code walkthrough lives in `agent_rules/03-code-walkthrough.md`.
- Split it by area (one file per subsystem) once it outgrows a single file.
- When making changes to source code, update the walkthrough for the area you touched.
- When updating a file, check whether the matching walkthrough section is affected — if so, update it.
- **IMPORTANT NOTE**: Only update the files under `agent_rules/`. Other copies
  such as `.claude/rules/`, `.clinerules` and `.kilocode/rules/` are symbolic
  links to the `agent_rules` directory.

## Use `aube`, never `npm`, `pnpm` or `yarn`

- aube is the package manager. Its supply-chain guards live in
  `aube-workspace.yaml`, and no other package manager reads them.
- Scripts run as `aube run <script>`: `aube run check`, `aube run build`,
  `aube test`.
- One-off binaries run as `aube exec <bin>`.
- Never run `npm install` or `pnpm install`. Either one resolves without the
  guards and writes a second lockfile.
- aube, Node and every other non-npm tool come from `mise.toml`. Run
  `mise install` after cloning.

## Always run `aube run check` before marking a task complete

- `aube run check` runs typecheck, format, lint, unused-code, duplication,
  dependency rules and tests-with-coverage.
- If it returns errors or warnings, fix them.
- `aube run fix` clears the mechanical ones — oxlint autofix plus Prettier. Run
  it first, then read what is left.
- Do not use `oxlint-disable` (or `eslint-disable`, which oxlint also honours)
  to silence a check. Make a genuine effort to fix the issue.
- If it reports code duplication, refactor the common code into a shared utility.
- Do not lower a coverage threshold to make the gate pass. The threshold is a
  ratchet; it only goes up.

## Keep functions and modules small and simple

- Extract as much logic as possible into pure functions in their own files.
- For a module `myThing.ts`, put its pure helpers in `myThing.utils.ts`.
- Abstract complex behaviour into named helpers rather than inlining it.
- If a function or module is over 120 lines, it is probably time to refactor.
  `max-lines-per-function` enforces this at 120, so it is a rule and not just
  advice. It is off in test files, where a `describe` block counts as one body.
- The lint config enforces the outer bounds: 500 lines per file, complexity 10,
  max depth 3, max 5 params, 70 statements. Treat those as the wall, not the
  target.
- Do not extract a single-use helper purely to get under a cap. A flat, linear
  function is often the honest shape; scattering it across files to satisfy a
  counter reads worse.

## Formatting

- Prettier owns formatting. oxlint does not.
- Line length is 100 columns, set by `printWidth` in `.prettierrc`.
- No line-length lint rule is enabled. A second cap would only ever disagree
  with Prettier's.
- `aube run check:format` is what fails the gate on unformatted code.

## Deferred work

- A deferral has to carry a date. An undated marker fails the gate.

  ```ts
  // TODO [2026-12-01]: drop the shim once the upstream fix ships
  ```

- On that date the gate fails and someone decides again. That is the point:
  an undated note is a decision nobody ever has to revisit.
- `src/deferredWork.test.ts` enforces it. It scans every tracked source file
  for `TODO`, `FIXME` or `XXX` at the start of a comment. Only the
  `[YYYY-MM-DD]` form is supported.
- It is a test, not a lint rule, because oxlint has no equivalent of
  `unicorn/expiring-todo-comments`.
- Do not enable `eslint/no-warning-comments`, `sonarjs/todo-tag` or
  `sonarjs/fixme-tag`. Each bans the marker outright, which leaves no form of
  the comment that passes — so the only ways through are deleting the note or
  disabling a rule, and neither leaves a record.
- The example lives here, in markdown, because the scan reads source comments
  and a comment demonstrating the marker would itself be an undated marker.

## Types

- `strict` is on. Do not widen it to make an error go away.
- No `any`, no non-null assertions, no unsafe member access — all are lint errors.
- Prefer a discriminated union over a bag of optional fields.
- `switch` over a union must be exhaustive. Adding a variant should break the
  build at every switch, not fall through at runtime.
- `noUncheckedIndexedAccess` is on. `arr[0]` is `T | undefined`. Guard it; do
  not assert it away.
- `exactOptionalPropertyTypes` is on. `{ a?: string }` will not accept an
  explicit `a: undefined`.
- Import types with `import { type Foo }`, not a bare import.
- The compiler is TypeScript 7. It has no programmatic API until 7.1, so a
  tool that loads `typescript` as a library needs a private TypeScript 6 —
  see `packageExtensions` in `aube-workspace.yaml`.

## Configuration and logging

- Read configuration from `env` in `src/env.ts`. Never `process.env` directly.
- Add a new variable to `src/env.ts` and `sample.env` in the same change.
- `console` is a lint error. Use `logger` from `src/logger.ts`.
- Prefer taking a `Logger` as a parameter over importing the singleton.

## Dependencies

- A new dependency is added only when its GitHub repository has at least 2,000
  stars, or the package is maintained under the `eslint-community` GitHub
  organisation (the curated exception for widely-downloaded eslint plugins that
  deliberately have small star counts).
  - Check before adding. Scoped npm names are not the repo name — resolve the
    real repository first with `npm view <package> repository.url`, then read
    its stars with `gh api repos/{owner}/{repo} --jq .stargazers_count`.
  - If a candidate is below 2,000 stars (and not `eslint-community`), do not
    install it silently. Report the star count to the user and ask for
    explicit permission before proceeding.
  - Third-party binaries are dependencies too, even though they are not in
    `package.json`. Apply the same check to the tool's repository, then pin an
    exact version in `mise.toml` and run `mise lock`. `mise.lock` records the
    checksum of every download. Never fetch `latest`, and never pipe a download
    into a shell.
- Install with scripts off: `aube add --ignore-scripts <package>`.
- After a fresh clone, run `mise install` and then `aube run hooks:install`.
  The git hooks are prek's, and nothing installs them for you.
- `paranoid: true` in `aube-workspace.yaml` turns on aube's strict bundle. Do
  not switch it off to make an install pass. It covers:
  - jailed builds;
  - a hard release-age gate;
  - strict integrity;
  - failing on unreviewed builds;
  - a fail-closed malicious-package check.
- `minimumReleaseAge` (30 days) constrains **resolution**, not just
  verification. A `^x.y.z` range pinned to a release from this week has no
  mature version to fall back to and the install fails outright.
  - Range a new dependency at the newest **matured** version, and let it drift
    upward on its own.
  - The same window applies to the versions pinned in `mise.toml`.
- Do not add to `trustPolicyExclude` in `aube-workspace.yaml` just to make an
  install pass. Each entry is a reviewed exception, pinned to an exact version.
- A package that needs its build step goes in `allowBuilds`, one at a time,
  after looking at what the step does. It then runs inside aube's build jail.
- `audit.ignore` in `aube-workspace.yaml` silences one advisory at a time, with
  the reasoning written beside it. `osv-scanner.toml` must waive the same
  advisories; a drift guard holds the two lists together.
  - Never raise `--audit-level` instead: that hides every future finding of
    that severity, not the one that was reviewed.
  - Never waive a `MAL-*` (malicious package) advisory. Remove the package.

### Recorded exceptions to the star threshold

- `oxlint-tsgolint` — 1,480 stars on `oxc-project/tsgolint`. Adopted with
  explicit sign-off on 2026-11-07. It is first-party to oxc (23k stars) and is
  the only way oxlint runs type-aware rules.
- `eslint-plugin-sonarjs` — 1,305 stars on `SonarSource/SonarJS`. Adopted with
  explicit sign-off on 2026-11-07. It runs as an oxlint JS plugin and covers
  what no native rule does: cognitive complexity, ReDoS, and the Node security
  rules. Its `eslint` peer is marked optional in `aube-workspace.yaml`, because
  oxlint hosts it and ESLint is never loaded.
- Add to this list rather than quietly installing. An exception nobody wrote
  down is indistinguishable from the rule not being followed.

## Tests

- Unit tests live beside the code as `*.test.ts` and must be hermetic.
- Tests that need a real external service are `*.integration.test.ts` — excluded
  from the default suite, given their own config and script when the project
  grows some.
- Coverage has a floor, checked by `aube run check`. Deleting or skipping a test
  to get to green fails the gate instead.

### Lint is part of the test suite

- oxlint's vitest rules run on every `*.test.ts` file.
- It fails a test with no assertion, a focused or disabled test, an `expect`
  behind an `if`, and two tests with the same name in one block.
- Those are the failures a test run cannot report, because each of them makes
  the run pass.
- Do not silence one. A test that trips a rule here is a test that is not
  checking what its name says it checks.

### Mutation testing

- `aube run test:mutation` runs Stryker. The `pre-push` hook runs it.
- It changes the source one small edit at a time and reruns the suite: `>`
  becomes `>=`, a string becomes `""`, a branch is dropped.
- A mutant that **survives** is a line no test pins down. Coverage cannot see
  this — the line ran, nothing asserted on what it did.
- Read a survivor as a missing assertion, not as a line to delete.
- If a line is unkillable because the only caller cannot reach the interesting
  case, extract it to `*.utils.ts` and test it directly. That is how
  `src/env.utils.ts` came to exist.
- The `break` threshold in `stryker.conf.mjs` is a ratchet. It only goes up.
- It is deliberately not in `aube run check`: that runs on every commit, and a
  mutation run does not fit in a commit gate.

### The numbers, and what actually holds them

Every number below is quoted in prose somewhere in this file or the README, and
enforced by a config file. `src/driftGuard.test.ts` reads both and fails when
they disagree, so a cap cannot be relaxed in a config while the rules still
claim the old value.

| Setting                         | Value | Held in               |
| ------------------------------- | ----- | --------------------- |
| `max-lines-per-function`        | 120   | `.oxlintrc.json`      |
| `max-lines` (per file)          | 500   | `.oxlintrc.json`      |
| `complexity`                    | 10    | `.oxlintrc.json`      |
| `max-depth`                     | 3     | `.oxlintrc.json`      |
| `max-params`                    | 5     | `.oxlintrc.json`      |
| `max-statements`                | 70    | `.oxlintrc.json`      |
| `coverage.thresholds` (%)       | 80    | `vitest.config.ts`    |
| `thresholds.break` (mutation %) | 90    | `stryker.conf.mjs`    |
| `printWidth` (columns)          | 100   | `.prettierrc`         |
| `minimumReleaseAge` (days)      | 30    | `aube-workspace.yaml` |

Change the config and this table together. Both directions are checked: a row
with no probe behind it fails just as loudly as a probe with no row.

### Drift guards

- `src/driftGuard.test.ts` holds the "change these two things together" rules,
  as assertions.
- Today:
  - `src/env.ts` against `sample.env`, both directions;
  - `src/` against the walkthrough's module map, both directions;
  - the agent-rules mirrors (`.claude/rules`, `.clinerules`, `.kilocode/rules`)
    against `agent_rules/`, every file;
  - `AGENTS.md` against the contents of `agent_rules/`;
  - the numbers table above against the configs that hold each number;
  - `audit.ignore` in `aube-workspace.yaml` against `osv-scanner.toml`;
  - sonarjs's recommended rules against the ones `.oxlintrc.json` configures
    or replaces.
- Add a guard there whenever a rule is written as "keep X and Y in step". Prose
  gets followed nine times in ten, and the tenth failure is silent.
