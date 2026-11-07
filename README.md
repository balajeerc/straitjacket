# ts-agentic-template

A starting point for a TypeScript project that will be worked on with coding
agents. It carries the dev tooling, the lint/check pipeline, and the agent
rules and skills — and almost no application code.

## What's in it

### Dev tooling

| Tool                   | Role                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| **mise**               | pins Node, aube, prek, gitleaks and osv-scanner; `mise.lock` holds every download's checksum          |
| **aube**               | the package manager, in `paranoid` mode, with its guards in `aube-workspace.yaml` (see below)         |
| **TypeScript 7**       | `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax`, ES2022 |
| **Vitest**             | `*.test.ts` beside the code; coverage thresholds; `*.integration.test.ts` held back                   |
| **Stryker**            | mutation testing — asks whether a test would have _failed_, not just whether it ran the line          |
| **oxlint**             | type-aware (via `oxlint-tsgolint`), carried over from typescript-eslint `strict-type-checked` + caps  |
| **oxlint vitest**      | lints the tests themselves: no assertion, focused, disabled, conditional `expect`                     |
| **Prettier**           | formatting, checked by the gate; oxlint enables no formatting rules                                   |
| **knip**               | unused files, exports and dependencies — in both default and production mode                          |
| **jscpd**              | copy-paste detection at a 0% threshold                                                                |
| **dependency-cruiser** | circular imports, orphans, and your module boundaries                                                 |
| **zod**                | `src/env.ts` — the environment, parsed and validated at boot                                          |
| **pino**               | `src/logger.ts` — structured logs; `no-console` is a lint error                                       |
| **commitlint**         | Conventional Commits, on `commit-msg`                                                                 |
| **prek**               | git hooks: `pre-commit` runs `aube run check`; `pre-push` runs the slow half                          |
| **gitleaks**           | secret scan over the whole history, on `pre-push`                                                     |
| **aube audit**         | lockfile vulnerabilities on `pre-push`, with a reviewed ignore list                                   |
| **osv-scanner**        | a second vulnerability scan, plus OSV's malicious-package advisories, on `pre-push`                   |

### Agent setup

```
AGENTS.md               # cross-tool entry point; a pointer, guarded by a test
agent_rules/            # the rules — the one real copy
├── 01-overview.md          what this project is (fill in)
├── 02-coding-guidelines.md house style + the `aube run check` rule
├── 03-code-walkthrough.md  the map agents navigate by
└── 04-committing.md        commit message conventions

.claude/rules  -> agent_rules   # symlinks, so every assistant reads one file
.clinerules    -> agent_rules
.kilocode/rules-> agent_rules

.claude/settings.json   # a read-only-command allowlist, to cut permission prompts
.claude/hooks/
└── format-edited-file.sh   # PostToolUse: oxlint --fix + prettier, per edit
.claude/skills/
├── code-audit/         # structural audit: naming, placement, cohesion
├── add-dependency/     # the star check, the maturity window, scripts off
└── write-tests/        # house test conventions, and surviving mutation
```

Edit `agent_rules/` only. The three rule paths are symlinks to it.

`AGENTS.md` is the exception: a file cannot symlink to a directory, so it is a
hand-written pointer at `agent_rules/`. `src/driftGuard.test.ts` asserts it
still names every rule file and no others.

**The edit-time hook is the highest-leverage piece here.** `aube run check`
reports mechanical problems only once a task is finished, by which point the
fix is a diff across many files competing for attention with real findings.
Fixing formatting and autofixable lint at the moment of the edit keeps the
check's output about things that need judgement.

The hook calls `node_modules/.bin` directly, never a package manager. A package
manager's `exec` may decide the tree is stale and install before running — from
a hook that fires on every edit, with nobody watching.

## Getting started

```bash
mise install                          # Node, aube, prek, gitleaks, osv-scanner
aube install --ignore-scripts
aube run hooks:install                # the git hooks; nothing installs them for you
aube run check
```

`aube run hooks:install` is a separate step on purpose. Nothing installs git
hooks as a side effect of a dependency install — that would be a lifecycle
script, and installs run with scripts off. Without it, the hooks never run.
`ls .git/hooks` should show `pre-commit`, `commit-msg` and `pre-push`; check
that if a commit sails through with a failing check.

Then:

1. Set `name` in `package.json`.
2. Fill in `agent_rules/01-overview.md` — what this project is.
3. Keep `agent_rules/03-code-walkthrough.md` current as the code appears.
4. Add your module boundaries to Section 2 of `.dependency-cruiser.cjs`.
5. Put your real variables in `src/env.ts` and `sample.env`.
6. Replace `src/index.ts`.

## Commands

| Command                          | What it does                                                     |
| -------------------------------- | ---------------------------------------------------------------- |
| `aube run check`                 | the gate — typecheck, format, lint, knip, jscpd, depcruise, test |
| `aube run fix`                   | oxlint autofix + Prettier write. Run this before reading errors. |
| `aube run typecheck`             | `tsc --noEmit` (TypeScript 7)                                    |
| `aube run lint`                  | oxlint, type-aware; warnings fail                                |
| `aube run format`                | Prettier, writes                                                 |
| `aube test` / `test:watch`       | Vitest                                                           |
| `aube run test:coverage`         | Vitest with thresholds enforced                                  |
| `aube run test:mutation`         | Stryker — mutation score, gated by `stryker.conf.mjs`            |
| `aube run build`                 | emits `dist/` with declarations                                  |
| `aube run check:vulnerabilities` | `aube audit`, with the reviewed ignore list applied              |
| `aube run scan:osv`              | osv-scanner over `aube-lock.yaml`, same ignore list              |
| `aube run scan:secrets`          | gitleaks over the whole git history                              |
| `aube run hooks:install`         | installs the prek git hooks (needed after a fresh clone)         |

### The gate is two git hooks

There is no CI. The whole gate is local:

| Hook         | Runs                                                           |
| ------------ | -------------------------------------------------------------- |
| `commit-msg` | commitlint                                                     |
| `pre-commit` | `aube run check` — the entire thing, not a staged-files subset |
| `pre-push`   | secret scan, `aube audit`, osv-scanner, build, mutation tests  |

They are declared in `prek.toml`. Every hook is a `local` one that calls a
script this repository defines; no hook code is fetched from anywhere.

**Both hooks are bypassable.** `git commit --no-verify` and
`git push --no-verify` walk straight past them, and nothing downstream will
notice. This is a gate you choose to keep, not one imposed on you — worth
knowing before trusting a green branch you did not watch go green.

`aube run test:mutation` is deliberately **not** in `aube run check` — a
mutation run scales with suite size in a way a commit gate cannot absorb.
`pre-push` is where it runs.

### Verifying the verification

Three of the guards here exist for the failure mode specific to agentic coding:
output that looks verified without being verified.

- **Mutation testing** answers the question coverage cannot. Coverage says the
  line ran. Stryker changes the line and checks whether anything fails. A
  surviving mutant is a missing assertion.
- **oxlint's vitest rules** catch the tests that pass by construction — no
  assertion at all, `it.only` parking the rest of the suite, an `expect` behind
  an `if` that the fixture never takes. None of that shows up in a test run.
- **`src/driftGuard.test.ts`** turns the "change these two together" rules into
  assertions: `src/env.ts` against `sample.env`, `src/` against the walkthrough's
  module map, the agent-rule mirrors against `agent_rules/`, the two scanners'
  ignore lists against each other. Those rules are prose, and prose fails
  silently.

## Every opinionated choice in here

None of this is a default. Each line is a position someone took, and each one
can be reversed — see _Removing what you don't want_.

### Package management

- **`aube`, never `npm`, `pnpm` or `yarn`.** The lockfile and every
  supply-chain guard assume it.
- **`paranoid: true`.** aube's strict bundle:
  - the release-age gate fails instead of falling back;
  - approved build scripts run jailed;
  - an unreviewed build fails the install;
  - the malicious-package check fails closed when OSV is unreachable.
- **Installs run with `--ignore-scripts`.** A dependency's install script is
  arbitrary code running as you, with your home directory — and every
  credential in it — in reach.
- **A package that genuinely needs its build step is allowlisted one at a
  time**, in `allowBuilds`, after someone looks at what the step does. Even
  then it runs in aube's jail: no network, writes confined to the package.
- **New dependencies need ≥2,000 GitHub stars**, or `eslint-community`
  maintenance, or first-party status under a project that clears the bar on its
  own. Below that: stop, report the count, ask. Granted exceptions are written
  down in `agent_rules/02-coding-guidelines.md`, not just granted.
- **Nothing published in the last 30 days.** Range a new dependency at the
  newest _matured_ version and let it drift upward on its own.
- **Third-party binaries are pinned and checksum-verified**, never `curl | sh`
  against a moving `latest`. `mise.toml` pins an exact version, at least 30
  days old; `mise.lock` holds the checksum, plus the signer where the project
  publishes one.
- **Vulnerability exceptions are per-advisory and reasoned**, in `audit.ignore`
  and mirrored in `osv-scanner.toml` — not a lowered severity threshold. A drift
  guard holds the two lists together.
- **A waiver that waits on a fix expires.** It carries `ignoreUntil` in
  `osv-scanner.toml`: the day after the fix clears the 30-day gate. On that
  date the commit gate fails until the bump lands.

### Types

- **`strict`, and then some**: `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride`, `noUnusedLocals`,
  `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`.
- **`noUncheckedIndexedAccess` is the highest-value one.** `arr[0]` is
  `T | undefined`, and since non-null assertions are a lint error, the fix has
  to be a real guard rather than an assertion.
- **`verbatimModuleSyntax`** makes `import { type Foo }` a compile requirement
  rather than a lint preference, so `tsc` alone catches it.
- **`noUncheckedSideEffectImports`** so a typo'd `import './setup'` fails at
  compile time instead of on the machine that runs it.
- **`moduleDetection: "force"`** — every file is a module, whether or not it
  happens to export anything today.
- **No `any`, no non-null assertions, no unsafe member access.** All errors.
- **TypeScript 7.** The native compiler, for `tsc` and for type-aware lint
  alike. It has no programmatic API until 7.1, so dependency-cruiser gets a
  private TypeScript 6 through `packageExtensions` in `aube-workspace.yaml`.
  Without it, the cruise checks 0 modules and passes.
- **Discriminated unions over bags of optional fields**, and a `switch` over a
  union must be exhaustive. Adding a variant should break the build everywhere.

### Lint and format

- **Prettier owns formatting; oxlint never does.** 100 columns. No line-length
  lint rule is enabled; a second cap would only ever disagree with Prettier's.
- **oxlint, type-aware.** The config was carried over rule by rule from
  typescript-eslint `strict-type-checked` + `stylistic-type-checked`,
  `@eslint/js` recommended, promise, and the curated unicorn rules. oxlint's
  `correctness` category is on as well.
- **sonarjs runs as an oxlint JS plugin.** JS plugins are alpha, and they get
  no type information, so sonarjs's type-aware rules see only what the syntax
  shows. Where a native rule covers a sonarjs rule, the native one runs
  instead. A drift guard fails when an upgrade adds a recommended rule nobody
  configured.
- **perfectionist and eslint-plugin-n were dropped.** The closest native rules
  stand in for them. What was lost outright is listed in the walkthrough.
- **The caps are the wall, not the target**: 120 lines per function, 500 per
  file, complexity 10, depth 3, 5 params, 70 statements.
- **`console` is an error.** `logger` is the way out.
- **`process.env` is an error everywhere except `src/env.ts`**, the file whose
  whole job is to parse it.
- **Deferrals carry a date.** `// TODO [2026-12-01]: ...`, enforced by
  `src/deferredWork.test.ts`. A rule that bans the marker outright stays off on
  purpose: it leaves no form of the comment that passes, so the only ways
  through are deleting the note or disabling a rule.
- **No `oxlint-disable` to silence a finding.** Fix it, or change the rule
  deliberately and say why. An unused disable directive is itself an error.
- **`denyWarnings`.** A warning is a failure; the severity only changes the
  wording.

### Tests

- **Unit tests sit beside the code** as `*.test.ts`, and must be hermetic.
- **Integration tests are a separate suite**, `*.integration.test.ts`, excluded
  from the default run.
- **Coverage has a floor and it is a ratchet.** It only goes up. Deleting or
  skipping a test to reach it fails the gate instead.
- **Mutation testing is a gate too.** Coverage says the line ran; Stryker
  changes the line and asks whether anything would have failed.
- **The tests themselves are linted.** No-assertion tests, `it.only`, `it.skip`,
  an `expect` behind an `if`, duplicate titles — all errors, because none of
  them show up in a test run.
- **An unkillable mutant is a design signal**, not a threshold to lower:
  extract the logic to `*.utils.ts` and test it directly. That is why
  `src/env.utils.ts` exists.

### Structure

- **Pure helpers live in `<name>.utils.ts`** beside their consumer.
- **Dependencies are parameters.** `run(log, name)` takes its logger; only
  `main()` reaches for the module-level singleton.
- **Configuration is parsed once, at boot**, by zod in `src/env.ts`. A bad
  variable fails there, naming itself, rather than mid-request.
- **Logs are newline-delimited JSON in production.** `pino-pretty` is a
  devDependency and must never be reachable on the production path.

### Documentation and agents

- **`agent_rules/` is the one real copy.** `.claude/rules`, `.clinerules` and
  `.kilocode/rules` are symlinks to it; `AGENTS.md` is a pointer at it. Never
  edit a mirror.
- **The walkthrough is enforced, not aspirational.** A file under `src/` that is
  missing from its module map fails a test.
- **Numbers quoted in the rules are checked against the configs that hold
  them**, so prose and config cannot drift apart while both read authoritative.
- **Procedures are skills, not paragraphs.** `add-dependency` and `write-tests`
  encode what would otherwise be prose an agent skims once.

### Process

- **Conventional Commits**, enforced on `commit-msg`.
- **`pre-commit` runs the entire `aube run check`**, not a staged-files subset.
  The edit-time hook is what keeps that from being slow to act on.
- **`pre-push` runs the slow half**: secret scan, two vulnerability scans,
  build, mutation tests.
- **There is no CI, and both hooks are bypassable.** That is a deliberate trade
  for a template meant to be cloned into environments that may not have a
  runner — not an oversight. Wiring `aube run check` and the `pre-push` list
  into whatever runner you have is the one thing worth adding back.

### Deliberately not here

- **Biome** — it lacks the type-aware rules this config is built on.
- **Other ESLint plugins as JS plugins** — perfectionist and eslint-plugin-n
  could load the same way sonarjs does. Each one is another alpha dependency,
  so each has to earn its place; so far only sonarjs has.
- **lint-staged** — the gate is the whole check, not the changed files.
- **`eslint-plugin-jsdoc`** — the house comment style is prose-in-header, not
  API docs. Enforcing JSDoc syntax would fight it.
- **markdownlint, cspell** — both considered, both below the star bar, neither
  earning an exception.
- **`publint` / `@arethetypeswrong/cli`** — add when the project publishes.

## Supply-chain guards

They live in `aube-workspace.yaml`. `aube config list` is how you confirm a
setting is live.

One lives in `.npmrc` instead, because aube does not read it from the
workspace file: `verify-deps-before-run=error`. A script run fails when
`node_modules` drifts from the lockfile, rather than installing first — an
install from inside a git hook would rewrite the lockfile mid-commit.

| Setting              | Effect                                                               |
| -------------------- | -------------------------------------------------------------------- |
| `paranoid`           | aube's strict bundle — jailed builds, hard age gate, fail-closed OSV |
| `minimumReleaseAge`  | refuse releases under 30 days old (value is in **minutes**)          |
| `blockExoticSubdeps` | transitive deps must come from the registry, not git or tarballs     |
| `trustPolicy`        | refuse an update whose publisher trust level dropped                 |
| `trustPolicyExclude` | reviewed exceptions, pinned to an exact version                      |
| `allowBuilds`        | the only packages permitted to run install scripts                   |
| `audit.ignore`       | advisories `aube audit` has been told to ignore, each one reviewed   |
| `packageExtensions`  | dependency-cruiser's private TypeScript 6 (TS 7 has no API yet)      |
| `overrides`          | floors that pull a matured fix into a transitive dependency          |

On top of those, aube itself does the following on its own:

- checks newly resolved packages against OSV's malicious-package advisories;
- challenges lookalike, low-download and newly registered names on `aube add`.

Two consequences to plan around:

- `minimumReleaseAge` constrains **resolution**, not just verification. A
  `^x.y.z` range pinned to a release from this week has no mature version to
  fall back to, and the install fails outright. Range a new dependency at the
  newest **matured** version and let it drift upward on its own.
- `aube update` refreshes direct dependencies only. A fix deeper in the graph
  goes in `overrides`, as a floor on the vulnerable range. Do not use
  `aube audit --fix=update`: it was seen resolving a release younger than the
  age gate.
- `trustPolicy: no-downgrade` fires on transitive deps you did not choose.
  `trustPolicyExclude` is the escape hatch, and each entry is pinned to an exact
  version so the next release has to be re-reviewed. Do not grow that list just
  to make an install pass.

There is no Dependabot. `aube outdated` is the manual equivalent; anything it
proposes still has to clear the 30-day window and the star bar. The same
applies to the binaries in `mise.toml`.

## Removing what you don't want

Everything is independent:

- Don't want duplication checks? Drop `check:code-duplication` from `check` and
  remove `jscpd`.
- Don't want the git hooks? Delete `prek.toml` and run `prek uninstall`.
- Don't want Conventional Commits? Delete `commitlint.config.js` and the
  `commitlint` hook in `prek.toml`.
- Only using one assistant? Delete the other two rule symlinks.
- Finding a rule too noisy for your codebase? Switch it off in
  `.oxlintrc.json`, with a comment saying why.
- Mutation testing too slow once the suite grows? Drop the `mutation` hook from
  `prek.toml` and run `aube run test:mutation` on a schedule instead. Occasional
  runs still recalibrate the suite; deleting it entirely does not.
- Don't want a local secret scan? Delete the `secrets` hook in `prek.toml`,
  `scan:secrets`, and `gitleaks` in `mise.toml`.

## Add when you publish

Nothing here assumes the project ships to a registry. When it does, add
`publint` and `@arethetypeswrong/cli` to `aube run check` — they catch broken
`exports` maps and type resolution that no test exercises.
