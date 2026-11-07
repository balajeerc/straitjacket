/**
 * Deferred work has to carry a date.
 *
 * The rule is in `agent_rules/02-coding-guidelines.md` under "Deferred work":
 * a deferral marker in a comment names the day it expires, and on that day the
 * gate fails and someone decides again. An undated marker is a decision nobody
 * ever has to revisit.
 *
 * This used to be `unicorn/expiring-todo-comments`, which oxlint does not
 * implement. Rather than drop the rule, it lives here: every tracked source
 * file, scanned for a marker at the start of a comment. Only the date form is
 * supported — `[YYYY-MM-DD]` straight after the marker.
 *
 * The markers are assembled from parts below, not written out, so that this
 * file does not trip its own scan.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const MARKERS = [
  ['TO', 'DO'],
  ['FIX', 'ME'],
  ['X', 'XX'],
].map((parts) => parts.join(''));

/** The extensions the linter covers. Markdown is excluded: the rule's own example lives there. */
const SOURCE_EXTENSIONS = new Set(['.cjs', '.js', '.mjs', '.ts']);

/*
 * A marker opening a comment: after `//`, after `/*`, or after the leading `*`
 * of a block-comment line. Mid-sentence mentions of the word are not markers.
 * The date, when present, must follow the marker directly.
 */
const MARKER_LINE = new RegExp(
  `(?://|/\\*+|^[\\t ]*\\*)[\\t ]*(?:${MARKERS.join('|')})\\b(?<rest>.*)$`,
  'gm'
);
const DATE_CONDITION = /^[\t ]*\[(?<date>\d{4}-\d{2}-\d{2})\]/;

interface Finding {
  readonly line: number;
  readonly problem: 'expired' | 'undated';
}

/** Today in UTC, as `YYYY-MM-DD` — the form the markers are written in. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

/** Every marker in `source` that has no date, or whose date is today or earlier. */
function deferralProblems(source: string, asOf: string): Finding[] {
  return [...source.matchAll(MARKER_LINE)].flatMap((match): Finding[] => {
    const date = DATE_CONDITION.exec(match.groups?.rest ?? '')?.groups?.date;
    const line = lineOf(source, match.index);

    if (date === undefined) {
      return [{ line, problem: 'undated' }];
    }

    return date <= asOf ? [{ line, problem: 'expired' }] : [];
  });
}

/* Same walk as `driftGuard.test.ts`: the repository, not a sandboxed copy of it. */
function findRepoRoot(start: string): string {
  let current = start;

  while (!readdirSync(current).includes('.git')) {
    const parent = dirname(current);

    if (parent === current) {
      throw new Error(`No .git directory found above ${start}`);
    }

    current = parent;
  }

  return current;
}

const repoRoot = findRepoRoot(fileURLToPath(new URL('.', import.meta.url)));

/** Tracked and not-yet-ignored files — what `git` would commit. */
function sourceFiles(): string[] {
  const listing = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '--deduplicate', '-z'],
    { cwd: repoRoot, encoding: 'utf8' }
  );

  return (
    listing
      .split('\0')
      .filter((path) => SOURCE_EXTENSIONS.has(extname(path)))
      // A file deleted from the working tree but not yet from the index is listed.
      .filter((path) => existsSync(join(repoRoot, path)))
  );
}

describe('deferral markers', () => {
  const [todo] = MARKERS;
  const marker = todo ?? '';

  it('flags an undated marker', () => {
    expect(deferralProblems(`// ${marker}: later`, '2026-01-01')).toEqual([
      { line: 1, problem: 'undated' },
    ]);
  });

  it('flags a marker on and after its date', () => {
    const source = `const a = 1;\n/* ${marker} [2026-01-01]: drop the shim */`;

    expect(deferralProblems(source, '2026-01-01')).toEqual([{ line: 2, problem: 'expired' }]);
    expect(deferralProblems(source, '2026-06-01')).toEqual([{ line: 2, problem: 'expired' }]);
  });

  it('accepts a marker dated in the future', () => {
    expect(deferralProblems(` * ${marker} [2026-12-01]: drop the shim`, '2026-11-30')).toEqual([]);
  });

  it('ignores the word mid-sentence', () => {
    expect(deferralProblems(`// the ${marker} list is empty`, '2026-01-01')).toEqual([]);
  });

  it('finds source files to scan, so an empty listing is not read as clean', () => {
    expect(sourceFiles()).toContain('src/deferredWork.test.ts');
  });

  it('has no undated or expired deferral in any source file', () => {
    const asOf = today();
    const problems = sourceFiles().flatMap((path) =>
      deferralProblems(readFileSync(join(repoRoot, path), 'utf8'), asOf).map(
        (finding) => `${path}:${String(finding.line)} ${finding.problem}`
      )
    );

    expect(problems).toEqual([]);
  });
});
