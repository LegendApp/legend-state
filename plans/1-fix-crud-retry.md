# Fix CRUD Create Retry Lane

## Goal

Fix the `syncedCrud` bug where a create that has failed can transition incorrectly to the update path, while preserving the existing behavior for edits made while the initial create is still in flight.

## Core Invariant

Initial create in flight preserves existing behavior. After the first create failure, create owns create/update for that id until one of these happens:

- create succeeds
- a remote `get`, `list`, or `subscribe` row confirms the item exists
- the local item is deleted

After first failure, retry payloads must come from the current observable item, not from accumulated create/update diffs.

## State Model

Use a small pending-create state map instead of a bare `Set`.

```ts
type PendingCreate = {
    hasFailed: boolean;
    change?: ChangeWithPathStr;
    promise?: Promise<unknown>;
    cancelled?: boolean;
};
```

No separate `latestValue`, `latestFullValue`, or `dirty` state. The current observable item is the source of truth for post-failure create retries. The original create change is retained so a later leaf edit that retries the create is still associated with the pending create lane.

## Implementation Plan

1. Replace pending create tracking with `Map<string, PendingCreate>`.
2. Change retry ids in `retrySet` from a hardcoded create prefix to action-specific ids:

```ts
`${action}_${itemKey}`
```

3. Add narrow retry callbacks/options to `retrySet`; do not change global `runWithRetry`.
4. Mark `pendingCreate.hasFailed = true` from the create attempt failure path before the next retry is scheduled.
5. When a create first enters `hasFailed`, cancel queued same-id update retries. Do not merge their payloads.
6. While `hasFailed` is true:
    - if no retry create attempt is currently in flight, route the next local edit back through `create`
    - if a retry create attempt is already in flight, wait for that create before updating so edits not included in the in-flight create payload are preserved
    - before each scheduled create retry, rebuild the outbound create payload from the current full local item
7. Rebuild retry payload through a helper that handles `value`, object, `Map`, and array modes:
    - read current item from the observable value
    - if the item no longer exists, cancel pending create state
    - clone the item
    - apply `transform.save`
    - send that payload to `create`
8. If a local delete happens for a pending failed create, cancel pending create state and queued create retry. The row is not known to exist remotely, so no remote delete is needed.
9. When `get`, `list`, or `subscribe` returns a row for that id, clear pending create state and cancel queued create retry.
10. On create success, clear pending create state and allow future edits to update normally.

## Guardrails

- Do not make all pending creates wait on a promise path.
- Do not globally defer updates until creates complete.
- Do not add broad create-result/update elision logic.
- Do not merge update retry payloads into create payloads.
- Do not change `updatePartial` undefined-key behavior unless a focused regression proves it is required.
- Do not change global `runWithRetry`.

## Tests

Add focused regression coverage for these transitions:

- Initial in-flight create still allows update.
- Create fails without retry; a later edit calls `create` again and does not call `update`.
- Create fails with retry scheduled; the next create retry uses the latest full value.
- A retry create attempt is in flight after a prior failure; a later edit waits for create before updating.
- A stale queued update retry cannot overwrite a post-failure create retry.
- A local delete cancels pending failed-create state without issuing an update/delete for an unknown remote row.
- Remote `subscribe` row clears/cancels pending create retry state.
- Remote `list` row clears/cancels pending create retry state.
- Remote `get` row clears/cancels pending create retry state.
- Transformed create retry rebuilds the latest transformed payload.

## Validation

Run focused tests first, then the full CRUD and Keel suites:

```sh
bun test tests/crud.test.ts --timeout 200
bun test tests/keel.test.ts --timeout 200
npm run typecheck
```
