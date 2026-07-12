---
id: pr-630
source_type: github_pr
source:
  repo: LegendApp/legend-state
  pr_number: 630
  cache: .github-cache/open/pulls/00630-fix-undoredo-clear-redo-stack-when-using-limit-option.md
pr_number: 630
pr_url: https://github.com/LegendApp/legend-state/pull/630
pr_title: 'fix(undoRedo): clear redo stack when using limit option'
review_status: ready-to-merge
risk: low
effort: xs
confidence: high
score: 96
next_action: merge
approval: pending
review_doc_version: 1
updated_at: 2026-07-12
---

# PR

- Source: cached PR metadata plus live GitHub diff and status
- URL: https://github.com/LegendApp/legend-state/pull/630
- Browser: https://github.com/LegendApp/legend-state/pull/630
- Title: fix(undoRedo): clear redo stack when using limit option
- Author: sgup
- Base: `LegendApp/legend-state:main`
- Head: `sgup/legend-state:fix/undoredo-limit-clears-redo-stack`

# Summary

- Fixes history corruption when `undoRedo(..., { limit })` receives a new edit after an undo. The PR removes discarded redo states before applying the configured history limit and adds focused regression coverage.

# Changes

## Clear redo history before limiting retained history

The current limit branch retains states after `historyPointer`. The PR first truncates that future branch, then applies the history-size limit, matching the existing unlimited-history behavior.

File: src/helpers/undoRedo.ts:61

```diff
+        history = history.slice(0, historyPointer + 1);
+
         if (options?.limit) {
             history = history.slice(Math.max(0, history.length - options.limit));
-        } else {
-            history = history.slice(0, historyPointer + 1);
         }
```

## Cover branching after undo with a limit

The new test exercises `A -> B -> C`, undo to `B`, then edit to `D`. It verifies that `C` is removed, undo returns to `B`, and redo now targets `D`.

File: tests/history.test.ts:297

```diff
+        undo();
+        expect(obs$.get()).toEqual({ value: 'B' });
+
+        obs$.value.set('D');
+        expect(redos$.get()).toBe(0);
+        expect(getHistory()).toEqual([{ value: 'A' }, { value: 'B' }, { value: 'D' }]);
```

# Solution Quality

- Approach: Accept as-is. Redo truncation and history limiting are separate invariants, and applying them in that order is the smallest correct fix.
- Tighter option: none material. The existing limit test already covers size truncation; the new test covers branching after undo.
- Maintainer polish: none.
- Architecture note: `undoRedo` has a separate falsy-initial-value defect in the current helper. It is outside this PR's stated history-branching scope and should be handled independently.

# Review Decision

- Status: ready-to-merge
- Risk: low
- Effort: xs
- Confidence: high
- Score: 96
- Next: merge
- Reason: The two-line behavioral change fixes the exact reproduced invariant at the correct boundary, preserves unlimited and limited history semantics, and adds direct regression coverage. No blocking findings remain.

# Findings

No blocking or non-blocking findings.

# Suggested Human Actions

1. Open https://github.com/LegendApp/legend-state/pull/630.
2. Confirm the repository's required checks or run `bun test tests/history.test.ts --timeout 50` on the PR head.
3. Merge manually if the checks are green.

# Suggested Comments

None.

# Validation

- Checked: cached PR metadata, live PR metadata, author diff, current `undoRedo` implementation, adjacent history tests, PR head ownership, and maintainer-modification permission.
- Ran: `gh pr diff 630 --repo LegendApp/legend-state | git apply --check` passed; `bun test tests/history.test.ts --timeout 50` passed on the current base with 12 tests and 88 assertions.
- Live state: GitHub reports `mergeable: true`, `rebaseable: true`, `maintainerCanModify: true`, and `mergeable_state: blocked`; no checks are currently reported.
- Not run: the new regression test on the PR head, full suite, build, lint, format, or CI.

# Self Review

- Confidence: 96% | Good: Exact bug, diff, history invariants, current tests, and live merge metadata were reviewed. | Caveat: The contributor branch was not checked out, so its added test was source-reviewed rather than executed.
