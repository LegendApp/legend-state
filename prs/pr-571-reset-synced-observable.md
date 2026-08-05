---
id: pr-571-reset-synced-observable
source_type: github_pr
source:
  repo: LegendApp/legend-state
  pr_number: 571
pr_number: 571
pr_url: https://github.com/LegendApp/legend-state/pull/571
pr_title: 'Fix: reset synced observable'
review_status: needs-author-changes
risk: high
effort: l
confidence: high
score: 73
next_action: request-changes
approval: pending
review_doc_version: 1
updated_at: 2026-07-27
---

# PR

- Source: GitHub PR #571 and current `main`
- URL: https://github.com/LegendApp/legend-state/pull/571
- Browser: https://github.com/LegendApp/legend-state/pull/571
- Title: Fix: reset synced observable
- Author: FelipeFlamarini
- Base: `main`
- Head: `fix/reset-double-call-and-isloaded-state`

# Summary

The PR captures a snapshot to make repeated reset restore an unmutated initial value, which addresses a plausible bug. Its `isLoaded` rule is incorrect for subscription-only sync and directly contradicts current tests that intentionally keep set-only state unloaded after reset. The branch conflicts and combines multiple reset contracts, so it should not be merged.

# Changes

- Clones `syncOptions.initial` once and clones that snapshot on reset.
- Sets `isLoaded` true after reset whenever there is no `get`.
- Adds a large reset test block.

# Maintainer Changes

None.

# Problem Area

- Boundary: reset across observable value, persistence metadata, remote loading, subscriptions, and future writes.
- Transitions checked: repeated reset; get/list; subscribe-only; set-only; empty initial; persistence clearing.
- Not covered: mutation between configuration and first sync, clone-unsupported values, reset racing in-flight get/set/subscribe callbacks.

# Solution Quality

- Approach: snapshotting may solve repeated reset, but the combined loaded-state heuristic is wrong.
- Tighter option: separately fix initial-value ownership and retain the existing remote-load accounting for `isLoaded`.
- Maintainer polish: split tests by contract and remove duplicate scenarios.
- Architecture note: “no `get`” does not mean “no remote load”; subscribe can establish initial readiness.

# Remaining Risks

- Subscription-only observables would become loaded before their first update.
- Set-only observables would change their existing post-reset contract.
- JSON cloning can coerce Dates and cannot faithfully clone all values.
- Late async callbacks may repopulate state after reset.

# Suggested Changes

1. Do not add the `!syncOptions.get` loaded-state shortcut.
2. Reproduce repeated-reset mutation independently and fix initial ownership with the supported value domain.
3. Add race tests for in-flight get/set/subscribe callbacks.

# Review Decision

- Status: needs-author-changes
- Risk: high
- Effort: l
- Confidence: high
- Score: 73
- Next: request-changes
- Reason: the branch changes readiness behavior incorrectly and conflicts with current intentional tests.

# Findings

1. Blocking: subscribe-only sync is misclassified as having no remote load.
2. Blocking: current tests explicitly expect set-only `isLoaded` to remain false after reset.
3. Blocking: the branch conflicts with current `syncObservable`.
4. Remaining risk: reset does not prove protection from late in-flight callbacks.

# Questions

- Should repeated reset restore the configuration-time snapshot or the latest configured initial value?

# Suggested Human Actions

1. Reject the branch as a combined fix.
2. Create separate issues for initial ownership and reset cancellation/readiness if current reproductions survive.

# Suggested Comments

The repeated-reset report is valuable, but `!get` is not a safe readiness test: subscription-only sync still has a remote load, and current set-only tests intentionally remain unloaded after reset. This needs to be split and reworked against current reset accounting.

# Validation

- Checked: live PR diff/state/comment, current reset implementation, syncedCrud list-to-get path, and current reset/readiness tests.
- Ran: no tests; current tests directly contradict the proposed readiness rule.
- Not run: repeated-reset reproduction, async race matrix, full suite.

# Self Review

- Confidence: 95% | Good: The review closes over get, list, subscribe, and set-only readiness transitions. | Caveat: The snapshot portion still needs an isolated reproduction.
