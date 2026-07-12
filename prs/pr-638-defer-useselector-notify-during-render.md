---
id: pr-638-defer-useselector-notify-during-render
source_type: github_pr
source:
  repo: LegendApp/legend-state
  pr_number: 638
  local_branch: pr-638-render-context-fix
pr_number: 638
pr_url: https://github.com/LegendApp/legend-state/pull/638
pr_title: 'fix: defer useSelector notify during render to avoid "Cannot update a component" react error'
review_status: ready-to-merge
risk: low
effort: xs
confidence: high
score: 96
next_action: merge
approval: pending
review_doc_version: 2
updated_at: 2026-07-12T11:22:38Z
---

# PR

- Source: GitHub PR #638 plus local maintainer follow-up
- URL: https://github.com/LegendApp/legend-state/pull/638
- Browser: https://github.com/LegendApp/legend-state/pull/638
- Title: fix: defer useSelector notify during render to avoid "Cannot update a component" react error
- Author: DorianMazur
- Base: `main`
- Head: GitHub `LegendApp/legend-state:fix/update-observable-during-react-render`; local `pr-638-render-context-fix`

# Summary

The original PR correctly identified the React warning, but its first solution deferred every `useSelector` notification and forced broad async test changes. The current local branch narrows the behavior: only Legend-owned render scopes mark work as render-time, and `useSelector` defers notifications only while that scope is active.

The source approach is now good. The final branch shape should keep implementation and regression tests together, with this PR review document as the final docs commit.

# Changes

## Tracks Legend-owned render scopes

`reactGlobals.renderDepth` and `runInRender` create a small, nesting-safe marker for synchronous Legend-owned render work. The helper restores the depth in `finally`, so thrown selectors or nested scopes do not poison later updates.

File: src/react/react-globals.ts:1

```diff
 export const reactGlobals = {
     inObserver: false,
+    renderDepth: 0,
 };
+
+export function runInRender<T>(fn: () => T): T {
+    reactGlobals.renderDepth++;
+    try {
+        return fn();
+    } finally {
+        reactGlobals.renderDepth--;
+    }
+}
```

## Defers only scoped render notifications

`useSelector` now keeps ordinary updates synchronous. It queues and coalesces a microtask only when a notification is caused by a marked Legend render scope, and the queued callback re-checks `notify` so unmounted selectors are ignored.

File: src/react/useSelector.ts:37

```diff
+    const scheduleNotify = () => {
+        if (notify) {
+            if (reactGlobals.renderDepth > 0) {
+                if (!notifyQueued) {
+                    notifyQueued = true;
+                    queueMicrotask(() => {
+                        notifyQueued = false;
+                        notify?.();
+                    });
+                }
+            } else {
+                notify();
+            }
+        }
+    };
```

## Marks each render-time hook path

Render scopes wrap the Legend hook paths that can synchronously publish observable updates during render: `useSelector` selector execution, dependency publication from `useObservable`, dependency publication and initial setup from `useObserve`, dependency publication from `useObserveEffect`, and transformed hook execution from `createObservableHook`.

File: src/react/useObserve.ts:78

```diff
     if (depsObs$) {
-        depsObs$.set(deps! as any[]);
+        runInRender(() => depsObs$.set(deps! as any[]));
     }

     if (!ref.current.dispose) {
-        ref.current.dispose = observe<T>(
+        ref.current.dispose = runInRender(() =>
+            observe<T>(
```

File: src/react-hooks/createObservableHook.ts:42

```diff
+        try {
+            overrideHooks(refObs);
+            runInRender(() => fn(...args));
+        } finally {
+            React.useState = _useState;
+            React.useReducer = _useReducer;
+        }
```

## Keeps fix tests with the behavior

The test updates now prove the key timing contract: normal `useSelector` notifications stay synchronous, render-scope writes do not emit React warnings, queued render updates coalesce, queued work after unsubscribe is ignored, and render depth restores after errors.

File: tests/react.test.tsx:648

```diff
+    test('useSelector notifies synchronously outside render', () => {
+        const obs = observable('hi');
+        const { result } = renderHook(() => useSelector(obs));
+
+        act(() => {
+            obs.set('hello');
+        });
+        expect(result.current).toEqual('hello');
+    });
```

File: tests/react-globals.test.ts:3

```diff
+describe('runInRender', () => {
+    test('tracks nested scopes and restores after errors', () => {
+        expect(reactGlobals.renderDepth).toBe(0);
```

# Maintainer Changes

## Narrowed the original deferral

The PR initially deferred every `useSelector` notification through `queueMicrotask`. The maintainer version defers only notifications produced inside `runInRender`, preserving synchronous updates for normal observable writes and reducing app compatibility risk.

## Covered all Legend-owned render paths

The follow-up extends the render marker beyond `useSelector` itself to the Legend hooks that can publish observable changes during render: `useObservable` dependency updates, `useObserve` dependency updates and initial setup, `useObserveEffect` dependency updates, and `createObservableHook` execution.

## Tightened cleanup and scheduling behavior

The local changes keep queued notifications coalesced, re-check `notify` at microtask execution time so unmounted selectors are not notified, and restore temporary React hook overrides in `createObservableHook` with `finally`.

## Reworked tests around the real contract

The maintainer changes restore ordinary tests to synchronous `act` where updates should still be synchronous, add warning-free regression coverage for each changed hook path, add coalescing and unsubscribe coverage, and add direct `runInRender` restoration coverage.

# Solution Quality

- Approach: Ready to merge after the final branch rewrite/push/CI check. Scoped render-depth is the right tradeoff here because it fixes Legend-owned hook behavior without hiding arbitrary user render writes.
- Correctness: The scope is nesting-safe and exception-safe. Notification versioning remains immediate, while only the React subscription callback is deferred for marked render scopes.
- Compatibility: Ordinary external observable writes keep the existing synchronous `useSyncExternalStore` behavior. Apps that relied on immediate outside-render updates should not see the blanket delay introduced by the original PR.
- Performance: The hot path adds a branch. Render-scope notifications allocate at most one microtask per selector before flush because of `notifyQueued`.
- Tests: The current test suite targets the real behavior and should stay in the fix commit, not in a separate test-only follow-up. The PR doc belongs in a final docs commit.
- Architecture note: This intentionally does not try to protect all user render-time `.set()` calls. That broader behavior would be more invasive and could mask app bugs.

# Suggested Changes

None.

# Review Decision

- Status: ready-to-merge
- Risk: low
- Effort: xs
- Confidence: high
- Score: 96
- Next: merge
- Reason: No blocking findings remain. The maintainer changes make the implementation narrower than the original PR, keep tests with the behavior, and preserve the existing synchronous update contract outside Legend-owned render scopes.

# Findings

No blocking findings.

# Questions

None.

# Suggested Human Actions

1. Rewrite the local commits above `5b004bbca0e38934ae1c0f64824cbaf288a5e996` into a fix commit with tests and a final PR-doc commit.
2. Re-run focused validation after the rewrite.
3. Push the cleaned local branch to `LegendApp/legend-state:fix/update-observable-during-react-render`.
4. Open https://github.com/LegendApp/legend-state/pull/638, confirm the remote PR is mergeable, wait for CI, then merge manually if green.

# Suggested Comments

None.

# Validation

- Checked: cached PR metadata, `gh pr view 638`, `gh pr diff 638 --name-only`, local diff above `5b004bbca0e38934ae1c0f64824cbaf288a5e996`, and changed source/test files.
- Previously passed on this branch: `bun test tests/react.test.tsx tests/reactive-observer.test.tsx --timeout 300` — 91 tests.
- Previously passed on this branch: `bun test tests/react-globals.test.ts --timeout 300` and `npm test -- --runInBand tests/react-globals.test.ts`.
- Previously passed on this branch: `bun test --timeout 1000` — 1,069 tests.
- Previously passed on this branch: `npm test -- --runInBand` — 25 suites and 1,069 tests.
- Previously passed on this branch: `npm run format:check`, `npm run typecheck`, `npm run lint:check`, `git diff --check`, `npm run build`, and `npm run checksize`.
- Passed after the requested history rewrite: `bun test tests/react.test.tsx tests/reactive-observer.test.tsx tests/react-globals.test.ts --timeout 300` — 92 tests.
- GitHub: the remote PR currently reports `DIRTY`; remote checks do not yet validate the local maintainer cleanup.

# Self Review

- Confidence: 96% | Good: The review reflects the final intended implementation, the maintainer changes, the remote PR state, the known validation, and the requested commit split. | Caveat: Final confidence depends on re-running validation after the history rewrite and seeing the pushed PR pass CI.
