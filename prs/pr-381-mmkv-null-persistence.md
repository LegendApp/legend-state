---
id: pr-381-mmkv-null-persistence
source_type: github_pr
source:
  repo: LegendApp/legend-state
  pr_number: 381
pr_number: 381
pr_url: https://github.com/LegendApp/legend-state/pull/381
pr_title: 'Fix persisting null with ObservablePersistMMKV'
review_status: needs-author-changes
risk: medium
effort: s
confidence: high
score: 64
next_action: maintainer-rework
approval: pending
review_doc_version: 1
updated_at: 2026-07-27
---

# PR

- Source: GitHub PR #381 and current `main`
- URL: https://github.com/LegendApp/legend-state/pull/381
- Browser: https://github.com/LegendApp/legend-state/pull/381
- Title: Fix persisting null with ObservablePersistMMKV
- Author: simontreny
- Base: `main`
- Head: `fix-persisting-null-with-mmkv`

# Summary

The issue remains real: `safeStringify(null)` returns `null`, which MMKV rejects because `set` requires a string, number, or boolean. The PR avoids the exception by deleting the key, but deletion does not persist `null`; on reload it is indistinguishable from absence and can restore the configured initial value.

# Changes

- Deletes the MMKV table when the root cached value is `null`.
- Adds no tests.
- Uses the legacy `delete` API directly and predates the current v3/v4 compatibility helper.

# Maintainer Changes

None.

# Problem Area

- Boundary: encoding root observable values into MMKV and decoding them after process restart.
- Transitions checked: non-null to null, null reload, absent key with initial value, delete-table semantics, MMKV v3/v4 API.
- Not covered: executable plugin test with mocked storage, metadata nulls, nested null values.

# Solution Quality

- Approach: suppresses the exception but violates null persistence semantics.
- Tighter option: store the JSON string `"null"` and let the existing parser restore `null`.
- Maintainer polish: use the current MMKV compatibility abstraction.
- Architecture note: `null` is data; `undefined`/delete is absence.

# Remaining Risks

- Deleting on null resurrects initial data after restart.
- No test distinguishes null from an absent key.
- Direct `storage.delete` is incompatible with the current v4 path.

# Suggested Changes

1. Encode root null as the string `"null"`.
2. Add a round-trip test with a non-null initial value.
3. Cover both current MMKV API shapes through the existing helper/mocks.

# Review Decision

- Status: needs-author-changes
- Risk: medium
- Effort: s
- Confidence: high
- Score: 64
- Next: maintainer-rework
- Reason: the reported exception is valid, but the proposed behavior loses the persisted null value.

# Findings

1. Blocking: deletion makes null indistinguishable from missing persistence.
2. Blocking: the stale code path calls the wrong API for MMKV v4.
3. Blocking: no reload regression test is included.

# Questions

None.

# Suggested Human Actions

1. Reimplement as explicit null serialization in the persistence worktree.
2. Supersede the old PR after a round-trip test passes.

# Suggested Comments

The MMKV error is real, but deleting the key does not persist null and can restore the initial value on next launch. Please store the JSON string `"null"` and add a restart-style round-trip test.

# Validation

- Checked: live PR diff/state, current MMKV v3/v4 adapter, `safeStringify`, `safeParse`, and delete semantics.
- Ran: no plugin test yet.
- Not run: MMKV mock round trip, full suite, React Native build.

# Self Review

- Confidence: 96% | Good: The review distinguishes null data from key absence and checks the current API. | Caveat: A storage mock is still required to validate both MMKV versions.
