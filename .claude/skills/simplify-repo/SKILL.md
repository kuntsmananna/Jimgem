---
name: simplify-repo
description: Whole-repository version of /simplify. Walks every source file, batch by batch, reviewing for reuse, simplification, efficiency, altitude (logic at the right layer) and conformance to this project's coding standards, then applies behaviour-preserving fixes, verifies and commits each batch. Resumable across sessions. Use only when the user asks for a full-repo (or whole-directory) quality sweep, not for reviewing recent changes.
argument-hint: "[path ...] [--report-only] [--parallel] [--resume] [--max N]"
disable-model-invocation: true
---

# simplify-repo — a whole-repo /simplify

`/simplify` looks at the diff. This looks at **everything**: every source file,
in batches, against **this project's own standards**, and leaves the code
saying the same thing in fewer, clearer words. It is a quality pass, not a bug
hunt and not a redesign.

Arguments (`$ARGUMENTS`):

| Argument | Meaning |
|---|---|
| `path ...` | Only sweep these paths/globs (default: the whole repo). |
| `--report-only` | Review and write the report, change nothing. |
| `--parallel` | Review batches with read-only subagents, apply fixes yourself. |
| `--resume` | Continue a sweep from `.simplify-repo/ledger.md`. |
| `--max N` | Files per batch (default 8). |

Files beside this one:
- `inventory.sh` — lists reviewable files grouped into batches.
- `project.md` — **this repo's** exclusions, standards greps, verify commands
  and rules the sweep must not break. Read it in Phase 0; it overrides the
  defaults here.

## The rules that outrank everything below

1. **Behaviour stays identical.** Same output, same markup, same API shapes,
   same SQL results, same visuals. If a change could alter what a user,
   a caller or a test sees, it is not a simplification — log it in the report
   instead.
2. **The project's instructions win.** CLAUDE.md / AGENTS.md (root and nested)
   and `project.md` are the standard. Where the code looks odd, **search the
   docs for the reason before touching it** (grep the file name, the function,
   the class). These repos document deliberate decisions at length; a
   "simplification" that undoes one is a regression. If code and docs disagree,
   don't pick a side — report it.
3. **Keep the why-comments.** Comments that explain a decision, a trap or a
   measurement are part of the code. Delete only comments that restate the
   next line, are stale, or describe code that no longer exists. Never strip a
   comment just to make a file shorter.
4. **No bug fixing, no features, no dependency changes.** Bugs you notice go
   to the report (and are better found with `/code-review`). Don't add
   packages, don't upgrade them.
5. **Don't rename or move exported things casually.** If a symbol or file is
   named in CLAUDE.md / docs, or imported widely, leave the name alone unless
   the gain is large — and then update every reference **and the docs** in the
   same batch.
6. **Never edit excluded files** (generated output, content/copy, data files,
   already-applied migrations, lockfiles — see `project.md`).
7. **One batch, one commit.** Never leave the tree half-changed between
   batches; never commit a batch whose checks fail.

## Phase 0 — load the standard

1. Read, in full: root `CLAUDE.md`, `AGENTS.md` (and anything they `@`-import),
   every nested `CLAUDE.md` inside the sweep's scope, `project.md` beside this
   file, and the lint/format config (`eslint.config.*`, `.prettierrc*`,
   `tsconfig.json`, `.editorconfig`).
2. Distil a **standards digest**: a numbered list of concrete, checkable rules
   (naming, imports/aliases, where helpers live, styling tokens/utilities,
   error handling, comment style, framework idioms, "use X instead of Y").
   Keep each rule one line with its source (`CLAUDE.md: Styling`). This digest
   is what every batch is checked against; carry it forward in the ledger so a
   resumed or compacted session has it.
3. Note the **verify commands** from `project.md` (fast per-batch, full at the
   end). Make sure dependencies are installed (`node_modules` present, etc.);
   if they aren't, install them the way the project does (`npm ci`) before
   starting, or the checks are meaningless.
4. Check `git status`. If the tree is dirty with work that isn't this sweep's,
   stop and ask the user — never mix their changes into sweep commits.
   Work on the current branch; if it is the default branch (`main`/`master`),
   ask before starting.

## Phase 1 — inventory and ledger

1. Run `bash .claude/skills/simplify-repo/inventory.sh [--max N] [paths...]`.
   It lists every reviewable source file, grouped into batches by directory,
   in a stable order.
2. **Repo-wide greps first.** Run each standards grep listed in `project.md`
   once over the scope and keep the hits. They become pre-flagged candidates
   in the batches that own those files — cheaper than rediscovering them file
   by file. A hit is a candidate, not a verdict: check the docs for an
   exception before changing it.
3. Map **duplication across the repo**: list the shared helper modules
   (`lib/`, `utils/`, `components/` shared pieces, CSS utilities) with a
   one-line summary of what each exports. Reuse findings depend on knowing
   what already exists; build this once, append to it as you learn.
4. Write `.simplify-repo/ledger.md` (create the directory):

   ```markdown
   # simplify-repo ledger
   Scope: <paths or "whole repo">  ·  Mode: <apply | report-only>  ·  Started: <date>

   ## Standards digest
   1. ... (source)

   ## Shared helpers
   - src/lib/money.ts — currency, count, withSign ...

   ## Batches
   - [ ] src/lib#1 (8 files)
     src/lib/a.ts, src/lib/b.ts, ...
   - [ ] src/components#1 (8 files)
     src/components/Header.astro, ...
   ```

   Every batch lists its files on the line under it: a resume matches work
   done **by file**, because new files can shift batch boundaries.

   and `.simplify-repo/report.md` with empty sections: *Bugs noticed*,
   *Behaviour-changing ideas*, *Docs vs code disagreements*, *Skipped (and
   why)*, *Cross-cutting suggestions*.
5. Order the batches **shared code first** (lib/utils/styles/shared
   components, then features, then pages/routes, then scripts): fixes in
   helpers often make callers simpler, and new reuse targets appear early.
6. Tell the user the plan in a few lines: number of files and batches, the
   order, the verify commands, roughly how long. For more than ~40 batches,
   suggest a narrower scope first. Then start — don't wait unless something in
   Phase 0 needed an answer.

`--resume`: read the ledger (digest, helpers, batches), run
`git log --oneline --grep '^simplify-repo('` to confirm the last ticked batch
is committed (un-tick it if not), then re-run the inventory. Files listed
under ticked batches are done; rebuild the unticked part of the ledger from
the new inventory minus those files (this picks up files added since), and
continue with the first unticked batch. Use the digest from the ledger, but
re-read CLAUDE.md if `git log` shows it changed since the sweep started.

## Phase 2 — per batch

For each batch, in ledger order:

### 2a. Read

- Read **every file in the batch completely** — no skimming, no partial
  reads of files under ~1500 lines.
- For each exported symbol you might change, find its callers
  (`grep -rn "<name>"`). For each import, know what it gives you. You can't
  judge reuse or altitude from one file in isolation.

### 2b. Review — five lenses

Check every file against all five, and write findings as
`file:line — lens — what — fix`.

1. **Standards** — every rule in the digest, plus the pre-flagged grep hits.
   Syntax and idiom too: the project's import style and alias, its naming,
   the framework's current idioms (read the framework's bundled docs if the
   project says its version differs from what you know), consistent
   async/error handling, the project's formatting where no formatter enforces
   it.
2. **Reuse** — logic that duplicates an existing helper, a constant restated
   instead of imported, a utility class reimplemented with ad-hoc styles, the
   same 5+ lines repeated across files in this batch or ones already swept.
   Fix by calling what exists. Extract a new shared helper only when there are
   **3+ real call sites** and it has an obvious home.
3. **Simplification** — dead code (unused exports, variables, params, branches
   that can't run, commented-out code), needless indirection or wrappers,
   nested conditionals that flatten with early returns, hand-written loops
   that are a single standard method, redundant type annotations/casts,
   over-general code serving one caller, state that can be derived.
   Confirm "unused" with a repo-wide grep (including dynamic/string usage,
   config files, tests and scripts) before deleting.
4. **Efficiency** — only clear, local wins: work repeated inside a loop or
   render that can be hoisted, N+1 queries/requests that batch trivially,
   rebuilding something on every call that can be built once, sequential
   awaits that are independent. No speculative micro-optimisation.
5. **Altitude** — is each piece at the right level?
   - *Layer*: business rules in UI components that belong in the domain/lib
     layer; data access outside its module; server-only code reachable from
     client code; a component knowing about details two levels below it.
   - *Abstraction*: an abstraction with one user and no prospect of a second
     (inline it); copy-paste that wants a parameter; a god-function doing
     three jobs (split only where the parts have names).
   - *Comments*: a comment explaining *what* where the name could say it
     (rename locally or drop it); a missing *why* on something genuinely
     surprising (add one short line — don't write essays).
   Altitude moves are the biggest and riskiest; only do them when the
   destination is obvious from the project's own layout and docs. Otherwise
   report them under *Cross-cutting suggestions*.

### 2c. Decide

Apply a finding only if it is **behaviour-preserving, clearly better, and
conformant** to the docs. When unsure, it goes to the report, not the code.
Keep the diff proportional: many small clear wins beat one sweeping rewrite.
A batch with nothing worth changing is a good outcome — say so and move on.

With `--report-only`: write every finding to the report under its batch and
skip 2d–2e.

### 2d. Apply and verify

1. Make the edits.
2. Run the **fast checks** from `project.md` on the batch (lint on the
   touched files, typecheck, the tests closest to them). If the batch touched
   a shared helper, run the tests that cover it.
3. If a check fails, fix your change or revert that part
   (`git checkout -- <file>`) — never "fix" a failure by weakening a check,
   disabling a rule, adding `any`/`@ts-ignore`, or skipping a test.
4. `git diff` and re-read your own diff once, asking: does every hunk keep
   behaviour identical? Revert any hunk you can't defend.

### 2e. Record and commit

1. Tick the batch in the ledger with a one-line summary
   (`- [x] src/lib — 3 dup formatters → money.ts, dropped 2 dead exports`),
   or `no changes` if none. Add anything new to *Shared helpers* and to the
   report.
2. Commit the batch together with the ledger and report:
   `git add -A <batch files> .simplify-repo && git commit -m "simplify-repo(<batch-id>): <summary>"`
   following the repo's commit-message conventions and any required trailers.
   Batches with no code changes still tick the ledger; commit the ledger
   update with the next batch rather than on its own.
3. Every ~5 batches give the user a one-line progress note
   (`12/25 batches · 31 files changed · 4 items in the report`).

### `--parallel`

For large sweeps, dispatch up to 3–4 batches at a time to read-only review
subagents (`Explore`, or a project reviewer agent if one fits). Give each the
standards digest, the shared-helpers list, its batch's file list, the
pre-flagged grep hits for those files, and the five lenses above, and ask for
findings only, in the `file:line — lens — what — fix` format. **Subagents
never edit.** You then verify each finding yourself (treat them as claims),
apply, check and commit batch by batch exactly as in 2c–2e. Edits stay
sequential so two batches never fight over a shared file.

## Phase 3 — finish

1. Run the project's **full verification** from `project.md` (and CLAUDE.md's
   "verify" section, if it has one). Everything must pass. If the project asks
   for visual checks after UI changes, do them for the pages your edits
   touched.
2. Follow the project's shipping rules from `project.md` / CLAUDE.md — a
   version bump, a changelog entry, doc updates — **once**, in a final commit,
   not per batch.
3. Push only if the session's or project's instructions say to push the
   working branch; never push to the default branch or open a PR unless asked.
4. Report to the user, briefly:
   - files reviewed, batches, files changed, commits;
   - the most significant changes, grouped by lens (a few lines each);
   - what's in `.simplify-repo/report.md` that needs **their** decision —
     bugs noticed, behaviour-changing ideas, docs/code disagreements,
     cross-cutting refactors;
   - verification results, stated plainly.
5. Ask whether to keep `.simplify-repo/` (useful for the next sweep's
   `--resume` or as a record) or remove it in a final commit.
