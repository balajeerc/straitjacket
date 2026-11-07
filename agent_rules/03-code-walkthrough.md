# Source Code Walkthrough

## Module map

```
src/
├── index.ts              # entry point; wires env + logger, exposes `run`
├── env.ts                # parsed, validated process environment (zod)
├── env.utils.ts          # pure helpers for env.ts
├── env.test.ts
├── env.utils.test.ts
├── logger.ts             # the pino logger singleton
├── driftGuard.test.ts    # asserts the repo still agrees with itself
├── deferredWork.test.ts  # fails on an undated or expired deferral marker
└── index.test.ts
```

This map is enforced. `src/driftGuard.test.ts` fails when a file under `src/`
is missing from it, or when it names a file that no longer exists.

## Conventions

- Document the ones a reader cannot infer from the code: units, timezones,
  sign conventions, what is authoritative when two sources disagree.
- Record WHY a non-obvious decision was made, not just what it was. The reason
  is what stops it being undone by the next person.

## Areas

### Environment — `src/env.ts`

- `env` is the only sanctioned way to read configuration.
- Never read `process.env` directly outside this file.
- The schema is parsed once, at import time. A bad variable fails at boot.
- The error names the offending variable.
- `parseEnv` is exported for tests, so the failure path is testable without
  mutating the real `process.env`.
- Adding a variable means editing `src/env.ts` **and** `sample.env` together.

### Environment helpers — `src/env.utils.ts`

- `formatIssues` renders Zod issues as one indented `path: message` line each.
- It lives in its own file so a test can drive it with a nested schema.
- The real schema is flat, so a `ZodError` from it never has a nested path —
  inline, the dotted join was a line no test could pin down. Mutation testing
  is what surfaced that; see `agent_rules/02-coding-guidelines.md`.

### Drift guards — `src/driftGuard.test.ts`

- Turns the "keep X and Y in step" rules into assertions.
- Guards seven pairings today:
  - every key in the `src/env.ts` schema is documented in `sample.env`, and
    the reverse;
  - every file under `src/` appears in the module map above, and the reverse;
  - every agent-rules mirror (`.claude/rules`, `.clinerules`,
    `.kilocode/rules`) still serves the same content as `agent_rules/`, file by
    file;
  - `AGENTS.md` links every rule file and no others — it is a pointer rather
    than a symlink, because a file cannot point at a directory;
  - every number quoted in the table in `agent_rules/02-coding-guidelines.md`
    matches the config that holds it;
  - the advisories waived in `aube-workspace.yaml` (`audit.ignore`) are exactly
    the ones waived in `osv-scanner.toml` — two scanners, one reviewed list;
  - every rule in sonarjs's recommended set is configured in `.oxlintrc.json`,
    or named there in an "instead of" comment beside its native stand-in.
    JSONC cannot spread the plugin's config, so a new recommended rule would
    otherwise arrive switched off.
- It also fails when a waiver in `osv-scanner.toml` reaches its `ignoreUntil`
  date. osv-scanner would resurface the advisory on its own, but only at
  `pre-push`; failing the commit gate first means the bump is due while the
  work is still local. Dates compare as `YYYY-MM-DD` strings, as in
  `deferredWork.test.ts`.
- Commented-out entries count on both sides of the env comparison. `sample.env`
  comments out anything with a default; requiring the two files to agree on
  _whether_ a key is commented would fail on the template as shipped.
- The config numbers are read as text, not by importing each config. Most of
  them could not be imported anyway — `.oxlintrc.json` carries comments,
  `stryker.conf.mjs` is plain JS, `aube-workspace.yaml` is YAML — and one
  mechanism reads better than three. Prettier owning the formatting is what
  keeps the patterns stable.
- A probe that stops matching fails the same way a drifted number does: loudly,
  naming the setting.
- It finds the repo root by walking up to `.git`, not by counting `..` from
  `import.meta.url`. Stryker copies the project into a sandbox before mutating
  it, and these are assertions about the repository, not about the copy.
- Add a guard here whenever a rule is written as "change these two together".

### Deferred work — `src/deferredWork.test.ts`

- Enforces the dated-deferral rule in `agent_rules/02-coding-guidelines.md`.
- It replaces `unicorn/expiring-todo-comments`, which oxlint does not implement.
- Scans what `git ls-files` lists (tracked plus untracked-but-not-ignored), for
  the extensions the linter covers. Markdown is skipped on purpose.
- A marker counts only at the start of a comment. The word mid-sentence is not
  a deferral.
- Dates compare as `YYYY-MM-DD` strings in UTC. A marker expires **on** its
  date, not the day after.
- The markers are assembled from parts in the source, so the file does not
  trip its own scan.
- The scanner is tested against inline samples first. A pattern that silently
  matches nothing would otherwise read as a clean repository.

### Logging — `src/logger.ts`

- `no-console` is a lint error. `logger` is the way out.
- Production emits newline-delimited JSON. That is what log shippers parse.
- Development uses `pino-pretty`, which is a **devDependency**. It must never be
  reachable on the production path.
- Use `logger.child({ requestId })` to carry context down a call path.
- Prefer passing a `Logger` as a parameter over importing the singleton. A
  function that receives what it talks to is one a test can drive.

### Lint — `.oxlintrc.json`

- oxlint replaced ESLint. The config was carried over rule by rule from the
  effective ESLint set; each section is labelled with where its rules came
  from.
- Type-aware rules run on `oxlint-tsgolint`, built on the TypeScript 7
  compiler.
- `categories.correctness` is on as well. It is oxlint's "definitely wrong
  code" set.
- sonarjs runs as a JS plugin (`jsPlugins`). It was briefly dropped in the
  move to oxlint, then brought back as a recorded star-threshold exception.
  - JS plugins are alpha in oxlint and run in Node. The full run is still
    under a second.
  - oxlint hands JS plugins no type information. sonarjs's type-aware rules
    run anyway and catch what the syntax shows — `slow-regex` flags a
    catastrophic regex literal — but miss whatever only a type would reveal.
  - Where a native rule covers a sonarjs rule outright, the native rule runs
    and the sonarjs one stays off. Those native rules are tagged "instead of
    sonarjs/…". sonarjs's same-name copies of core rules (`no-fallthrough`,
    `no-unused-vars`, …) are off for the same reason.
  - Some overlaps under different names remain — `sonarjs/no-exclusive-tests`
    beside `vitest/no-focused-tests`, for one. A fault there draws two
    reports, as it did under ESLint.
  - Where the native rule is only a partial stand-in (the loop-counter,
    parameterized-test, specific-assertion and exception-test rules), both
    run.
  - `todo-tag` and `fixme-tag` are off: they ban the marker that
    `src/deferredWork.test.ts` allows with a date. `redundant-type-aliases` is
    off as it was under ESLint.
  - `no-os-command-from-path` is off in test files. A test run already trusts
    `PATH` for `node` and `aube`.
  - `inverted-assertion-arguments` and `no-same-argument-assert` understand
    `assert` and chai, not vitest's `expect`.
- perfectionist and eslint-plugin-n were dropped. Where a native rule is close,
  it is listed under "Closest equivalents" beside the rule it replaces.
- What was lost, with no native equivalent:
  - perfectionist's ordering of import statements, exports and type members.
    The names inside a single import are still sorted, by
    `eslint/sort-imports`;
  - `n/no-unsupported-features/*` — the runtime is pinned by `mise.toml`;
  - `unicorn/better-regex`, `consistent-destructuring`, `no-for-loop`,
    `prefer-switch`, `no-array-push-push`.
- Two type-aware sonarjs rules stay native, because their sonarjs versions
  would run without types:
  - `sonarjs/bitwise-operators` — `oxc/bad-bitwise-operator` catches the
    guard patterns (`obj & obj.prop`, `opts | {}`); tsc rejects `&` and `|`
    on booleans outright;
  - `sonarjs/void-use` — `eslint/no-void`, statements excepted.
- `unicorn/expiring-todo-comments` was not lost. It moved to
  `src/deferredWork.test.ts`.
- `no-restricted-syntax` is not supported, so the `process.env` ban is
  `node/no-process-env`, switched off for `src/env.ts` alone.

### Entry point — `src/index.ts`

- `run(log, name)` takes its logger as a parameter. That is the pattern to copy.
- `main()` is the only place that reaches for the module-level singleton.
