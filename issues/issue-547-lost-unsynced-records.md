---
id: issue-547
source_type: github_issue
source: .github-cache/open/issues/00547-lost-unsynced-records-using-3-0-0-beta-31.md
repo: LegendApp/legend-state
issue_number: 547
issue_url: https://github.com/LegendApp/legend-state/issues/547
issue_title: Lost unsynced records using 3.0.0-beta.31
triage_status: ready
issue_type: bug
area: sync
severity: critical
urgency: critical
effort: m
confidence: high
repro_quality: strong
priority_score: 0
priority_reason: The reported data-loss scenarios are fixed and validated; the broader durable CRUD acknowledgement model is an accepted separate project.
next_action: done
approval: approved
implementation_status: done
base_ref: 49220e07482c17ad27b0086f04894b1f83502cd3
agent_doc_version: 1
updated_at: 2026-07-12T13:29:32Z
---

# Issue

Two immutable root-array replacements can share the empty pending path. If the first create fails and a later create succeeds, acknowledging the later root change clears the single persisted pending entry and loses the earlier unsynced record. The reporter reproduced this both after finite retries and around a reload with infinite retries. Mutating the array with `push` avoids the root-path collision but is only a workaround.

# Triage

- **Status:** ready
- **Decision:** Treat this as a repo-owned data-loss bug at the boundary between `syncedCrud` item-level outcomes and `syncObservable` path-level pending acknowledgements.
- **Scope:** Preserve failed CRUD creates across a later immutable root replacement and across persisted retry/reload, without changing the semantics of successful root sets or direct per-item mutations.
- **Why now:** The issue has a strong concrete repro, the maintainer confirmed the root-path collision, and current related retry coverage does not exercise an unchanged failed row plus a newly successful row sharing one root change.

# Evidence

- The issue's persisted metadata shows all root-array replacements stored under the same `pending['']` entry, and the maintainer confirmed that immutable full-array `set` triggers the problematic blank path.
- `src/sync/syncObservable.ts:541` preserves the original previous root value and `src/sync/syncObservable.ts:549` replaces the pending root value with the latest array, so multiple logical item operations remain represented by one pending entry.
- `src/sync-plugins/crud.ts:650`-`src/sync-plugins/crud.ts:688` diffs a root collection replacement item by item. An unchanged row whose earlier create exhausted retries is omitted from `itemsChanged`, while the newly added row is scheduled.
- `src/sync/syncObservable.ts:762`-`src/sync/syncObservable.ts:825` clears pending by the acknowledged change's `pathStr`. Because the successful CRUD item reports the original root change, a matching latest root value can clear `pending['']` even though another item represented by that root is still unsynced. This is a source-level inference matching the reporter's stored metadata and maintainer analysis.
- Prior array retry coverage now at `tests/crud.test.ts:3417` verifies that a later edit to the same failed item retries its create with the latest value; it did not cover a later root set that adds a different item while the failed item is unchanged.

# Plan

1. Add a focused `syncedCrud` array regression that uses immutable root `set`, local persistence with `retrySync`, a first create that exhausts retries, and a second create that succeeds. Assert that the first row is still scheduled as a create and that persisted pending metadata is not cleared until every unsynced row represented by the root change is acknowledged.
2. Add the reload variant from the report: restore the persisted root value and `pending['']` metadata before constructing the observable, then verify both unsynced rows are recovered and created rather than losing the earlier row.
3. Narrow the fix to the CRUD/pending acknowledgement boundary. Ensure an unchanged failed pending create present in a root collection replacement remains part of the create lane, or otherwise communicate partial item success so `syncObservable` cannot treat the shared root path as fully acknowledged.
4. Add guard coverage for successful immutable root sets and direct `push`/per-item changes so the fix neither duplicates already acknowledged creates nor delays clearing unrelated pending paths.
5. Run `bun test tests/crud.test.ts tests/persist.test.ts tests/sync-set.test.ts --timeout 200`, then `npm run typecheck` and `npm run lint:check`.

# Run Log

- Started: 2026-07-12T12:35:00Z
- Start state: branch `pr-638-render-context-fix`, commit `8ed7c4d616c895e8421774cfac103ac3b933244e`
- Initial dirty state: untracked issue/PR planning documents only; implementation files were clean.
- Inspected:
  - `src/sync-plugins/crud.ts`
  - `src/sync/syncObservable.ts`
  - `src/observableInterfaces.ts`
  - existing CRUD retry and sync pending tests
- Reproduced: focused immutable-array root test received create calls `['1', '2']` instead of `['1', '1', '2']`; the unchanged failed create was skipped.
- Confidence closure: an adjacent partial-failure test proved that a successful create could still clear the shared root pending path while its sibling failed.
- Changed:
  - `src/observableInterfaces.ts`
  - `src/sync-plugins/crud.ts`
  - `src/sync/syncObservable.ts`
  - `tests/crud.test.ts`
  - `tests/sync-set.test.ts`
- Validation:
  - Focused three-regression CRUD run: passed.
  - `bun test tests/crud.test.ts tests/persist.test.ts tests/sync-set.test.ts --timeout 200`: 213 passed; one pre-existing four-shape retry test exceeded the 200 ms per-test limit.
  - `bun test tests/crud.test.ts tests/persist.test.ts tests/sync-set.test.ts --timeout 1000`: 214 passed.
  - `bun test --timeout 1000`: 1,074 passed.
  - `npm run typecheck`: passed.
  - `npm run lint:check`: passed.
  - `npm run format:check`: passed.
- Post-run review: the retained root entry can replay a successfully acknowledged sibling after reload if another sibling still fails, particularly when `list` is asynchronous or the server replaces a client UUID with a server-generated ID. The task was reopened because this is a correctness gap, not merely an architectural follow-up.
- Maintainer decision: release the targeted fix for the reported data-loss scenarios now and track durable item-level CRUD acknowledgements as a separate longer-term project.

# Diagnosis

- Problem: An offline-created array row could disappear from retry metadata after a later immutable root set successfully created a different row.
- Cause: Root collection diffing ignored an unchanged terminally failed create, while every CRUD result reported the same root path; a successful sibling could therefore make `syncObservable` clear `pending['']` for both rows.
- Solution: Requeue failed creates still present in a root collection, associate them with the current root change, and report terminally failed changes so pending clearing requires every operation sharing that path to succeed.

# Changes

## Preserve failed creates in root collection replacements

An unchanged row with a terminal create failure now re-enters the create lane during a later root replacement, using the current root change as its acknowledgement boundary.

File: `src/sync-plugins/crud.ts:589`

```diff
+const existingPendingCreate = pendingCreates.get(id);
+if (existingPendingCreate?.hasFailed && !existingPendingCreate.promise && change.path.length === 0) {
+    existingPendingCreate.change = change;
+}
 const pendingCreate = beginPendingCreate(id, change);
```

File: `src/sync-plugins/crud.ts:693`

```diff
 const isDiff = !prevAsObject || !deepEqual(value, prev);
+const isFailedCreateRetry = isFailedCreateReadyToRetry(value?.[fieldId]);

-if (isDiff) {
+if (isDiff || isFailedCreateRetry) {
```

## Keep shared pending paths when any operation fails

CRUD reports terminally failed changes separately. The sync layer aggregates those failures and refuses to clear matching pending paths while still allowing successful sibling paths to complete.

File: `src/sync-plugins/crud.ts:305`

```diff
-return runWithRetry(paramsWithChanges, retry, action + '_' + itemKey, runAttempt);
+return runWithRetry(paramsWithChanges, retry, action + '_' + itemKey, runAttempt).catch((error) => {
+    params.update({ value: {}, failedChanges: [change] });
+    throw error;
+});
```

File: `src/sync/syncObservable.ts:777`

```diff
+const failedPathStrs = new Set(failedChanges.map((change) => change.pathStr));
 ...
-if (!change || !deepEqual(pendingEntry.v, change.valueAtPath)) {
+if (failedPathStrs.has(key) || !change || !deepEqual(pendingEntry.v, change.valueAtPath)) {
```

## Cover reconnect, partial failure, reload, and path selectivity

Regression tests cover the exact immutable root-set sequence, retaining root pending after partial failure, restoring root pending after reload, and clearing successful sibling paths independently.

File: `tests/crud.test.ts:3190`

```diff
+test('array root set retries an unchanged failed create before clearing pending', async () => {
+    // First create fails; a later root set adds a second row.
+    expect(createCalls.map((value) => value.id).sort()).toEqual(['1', '1', '2']);
+    expect(syncState(obs$).getPendingChanges()).toEqual({});
+});
```

File: `tests/sync-set.test.ts:514`

```diff
+test('failed changes keep only their pending paths when sibling changes succeed', async () => {
+    expect(state$.getPendingChanges()).toEqual({
+        note: { p: 'init', t: ['object'], v: 'local' },
+    });
+});
```

# Remaining Risk

The current implementation prevents the shared root pending entry from being deleted while any CRUD operation on that path fails. It does not persist which individual records already succeeded.

A remaining failure sequence is therefore possible:

1. Root array pending contains records A and B.
2. A fails remotely while B succeeds.
3. `pending['']` is correctly retained to protect A, but it still contains both A and B.
4. The app reloads before A succeeds.
5. Pending replay can run before an asynchronous `list` resolves, so B may be submitted to `create` again.

This is especially risky when the server changes B's client UUID to a server-generated ID, because the pending client record cannot be reliably deduplicated against the remote result by ID.

# Accepted Follow-up Project

1. Add a failing regression where A fails, B succeeds, the app reloads, `list` resolves asynchronously, and only A may be retried.
2. Include a server-assigned-ID variant so a successful client UUID cannot be replayed as a second create after its canonical ID changes.
3. Persist item-level CRUD acknowledgement state using a stable mutation ID, retaining the configured `fieldId` only for client-item correlation because the server may replace that ID.
4. Remove successful records from the retry payload while retaining failed records, without weakening generic path-level pending behavior for non-CRUD sync plugins.
5. Rerun the focused sync/persistence suites and the full repository validation.

# Result

Fixed the reported data-loss scenarios. Immutable array root replacements now retry an unchanged failed create, and successful siblings cannot delete a shared pending path while another operation fails. The remaining partial-success/reload risk is explicitly accepted for this release and will be addressed by a separate durable CRUD operation-ledger project.

# Self Review

- Confidence: 98% in the reported fix; 85% in wider problem-area closure | Good: exact data-loss repro, partial-failure retention, reload recovery without prior partial success, path selectivity, and the full suite pass. | Caveat: partial success followed by reload may duplicate an already-created sibling.
- Scope: Completes the reported issue's failed-create retry and path-level failure retention; durable item-level acknowledgement persistence is intentionally separate.
- Risk: A retained root pending payload contains successful and failed records together; asynchronous reload can replay both, and server-assigned IDs make deduplication unsafe.
- Tests: 1,074 repository tests, typecheck, lint, and formatting passed.
- Follow-up: Create a separate project for a durable operation ledger, including partial-success/reload, asynchronous list, server-ID canonicalization, and idempotency coverage.
