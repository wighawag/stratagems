import {execFileSync, spawnSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, it, expect} from 'vitest';

/**
 * Every shared file this repo modifies is listed, with its reason, in
 * `.offshoot-divergences`, and every listed file is modified.
 *
 * WHAT IT IS THE COUNTERPART OF. `.offshoot-omissions` says which of the
 * stem's files this repo does not carry, and is checked both ways
 * (`offshoot-omissions.test.ts`, `scripts/check-omissions.mjs`). Nothing said
 * which of the files it DOES carry it changes, or why, and a list that is not
 * checked decays: measured on 2026-11-15 (step C of
 * work/plans/join-template-commit-reveal.md), three of the 49 modified files
 * were not modifications at all but the stem's own older versions, left by
 * cascade merges resolved "ours", and the game menu had gone two weeks without
 * its "Tables" entry. `scripts/check-stem-drift.mjs` now catches that case at
 * merge time; this catches the rest: a file that starts to differ without
 * anyone saying why, and a reason that outlives its difference.
 *
 * WHAT "THE STEM'S" MEANS HERE. The stem commit last merged, which is the merge
 * base of HEAD and the stem's branch (`stemBranch` in the `offshoot` branch's
 * `fanout.config.json`, on the `stem` remote). Fetching the stem therefore
 * changes nothing here until its new commits are merged. The working tree is
 * compared, not HEAD, so an edit fails before it is committed.
 *
 * WHY IT FAILS, RATHER THAN SKIPS, WITHOUT THE STEM. A guard that passes when
 * it cannot look is the guard that stopped looking without anyone noticing.
 * Every place this repo's suite runs (the main checkout, a worktree, the
 * cascade's `verify`) has the `stem` remote; a clone without it is told how to
 * add it.
 *
 * FORMAT. One file per line, its path then its reason: `<path>  <reason>`. `#`
 * starts a comment. A path with no reason is refused.
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const LIST = `${ROOT}.offshoot-divergences`;

function git(args: string[]): string {
	return execFileSync('git', args, {cwd: ROOT, encoding: 'utf8'}).trim();
}

function gitOk(args: string[]): string | undefined {
	const done = spawnSync('git', args, {cwd: ROOT, encoding: 'utf8'});
	return done.status === 0 ? done.stdout.trim() : undefined;
}

function stemRef(): string {
	const config =
		gitOk(['show', 'offshoot:fanout.config.json']) ??
		gitOk(['show', 'origin/offshoot:fanout.config.json']);
	if (!config) {
		throw new Error(
			'no `offshoot` branch (local or origin) holds fanout.config.json, so ' +
				"the stem's branch is unknown: git fetch origin offshoot:offshoot",
		);
	}
	const branch: string | undefined =
		JSON.parse(config).branches?.main?.stemBranch;
	if (!branch)
		throw new Error('fanout.config.json names no stemBranch for main');
	const ref = `stem/${branch}`;
	if (!gitOk(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])) {
		throw new Error(
			`${ref} is not here: git remote add stem ` +
				'git@github.com:wighawag/template-commit-reveal.git && git fetch stem',
		);
	}
	return ref;
}

interface Entry {
	path: string;
	reason: string;
	line: number;
}

function readList(): Entry[] {
	return readFileSync(LIST, 'utf8')
		.split('\n')
		.map((text, index) => ({
			text: text.replace(/#.*$/, '').trim(),
			line: index + 1,
		}))
		.filter(({text}) => text.length > 0)
		.map(({text, line}) => {
			const [path, ...rest] = text.split(/\s+/);
			return {path, reason: rest.join(' '), line};
		});
}

describe('offshoot divergences', () => {
	it('has a list to read', () => {
		expect(
			existsSync(LIST),
			'.offshoot-divergences should exist at the repo root',
		).toBe(true);
	});

	const entries = existsSync(LIST) ? readList() : [];

	it('gives every entry a reason, and lists each file once', () => {
		const bare = entries.filter((entry) => entry.reason.length === 0);
		expect(
			bare.map((entry) => `line ${entry.line}: ${entry.path}`),
			'these entries have no reason',
		).toEqual([]);
		const seen = new Set<string>();
		const twice = entries.filter(
			(entry) => seen.has(entry.path) || !seen.add(entry.path),
		);
		expect(
			twice.map((entry) => entry.path),
			'listed twice',
		).toEqual([]);
	});

	it("lists exactly the shared files that differ from the stem's", () => {
		const base = git(['merge-base', 'HEAD', stemRef()]);
		// A file in both the stem commit and the working tree whose content
		// differs. Renames count as a deletion (`.offshoot-omissions`) and an
		// addition (this repo's own), so they are not shared files here.
		const modified = git([
			'diff',
			'--name-only',
			'--no-renames',
			'--diff-filter=MT',
			base,
		])
			.split('\n')
			.filter((path) => path.length > 0)
			.sort();
		const listed = new Set(entries.map((entry) => entry.path));
		const unlisted = modified.filter((path) => !listed.has(path));
		expect(
			unlisted,
			`these files differ from the stem's (${base.slice(0, 8)}) and are not in ` +
				".offshoot-divergences: list each with the reason it must differ, or take the stem's " +
				`(git checkout ${base.slice(0, 8)} -- <path>)`,
		).toEqual([]);
		const differing = new Set(modified);
		const stale = entries
			.map((entry) => entry.path)
			.filter((path) => !differing.has(path));
		expect(
			stale,
			`these are listed in .offshoot-divergences but do not differ from the stem's ` +
				`(${base.slice(0, 8)}), or are not one of its files: remove them from the list`,
		).toEqual([]);
	});
});
