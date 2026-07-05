---
id: issue-452
source_type: github_issue
source: .github-cache/open/issues/00452-core-issues-deleting-and-inserting-items-in-beginning-of-list.md
repo: /Users/jay/Documents/code/legendapp/legend-state
issue_number: 452
issue_url: https://github.com/LegendApp/legend-state/issues/452
issue_title: CORE ISSUES Deleting and Inserting Items in Beginning of List
triage_status: ready
severity: medium
approval: approved
implementation_status: done
base_ref: main@0456767a
agent_doc_version: 1
updated_at: 2026-07-02T18:01:41Z
---

# Issue

- Source: `.github-cache/open/issues/00452-core-issues-deleting-and-inserting-items-in-beginning-of-list.md`
- URL: https://github.com/LegendApp/legend-state/issues/452
- Title: CORE ISSUES Deleting and Inserting Items in Beginning of List
- Repo: `/Users/jay/Documents/code/legendapp/legend-state`
- Base: `main@0456767a`

# Triage

- Status: ready
- Severity: medium
- Confidence: high

Summary: Most reported record-derived list cases appear fixed by the current computed-array child cleanup, but `<For each={$.store} optimized>` still fails to render inserted object keys.

Decision: Target optimized object-list tracking/rendering first; treat computed `Object.values($.store)` list failures as likely covered unless a new regression disproves that.

# Evidence

- Issue repro uses `store: Record<string, Item>`, `list: () => Object.values($.store)`, descending numeric ids, and deleting/adding items at the beginning of the rendered list.
- Local read-only probe on current source: lower-level `$.list` raw and activated child reads update correctly through add-at-beginning, delete-at-beginning, and add-again.
- Local read-only React probe: `For` over `$.store`, `$.list`, `$.list optimized`, and observer-wrapped `$.list.map(...)` updated correctly; `For` over `$.store optimized` stayed `a,b,c` after adding `1000`.
- `src/react/For.tsx:34` uses `each.get(optimized)` when `optimized` is true, including for object records.
- `src/ObservableObject.ts:927` only marks optimized notifications for array length and Map/Set size changes; `src/batching.ts:249` suppresses optimized listeners unless that flag is true.
- Existing tests cover optimized Map insertion and non-optimized object deletion in `tests/react.test.tsx:756` and `tests/react.test.tsx:815`, but not optimized object key insertion/deletion.

# Plan

1. Add a focused failing React regression in `tests/react.test.tsx` for `<For each={obs.items} optimized>` where `items` is a plain object record and a new lower numeric id is inserted, then deleted.
2. Inspect whether the smallest correct boundary is `For` tracking choice for object records or optimized notification semantics for object key-count changes.
3. Fix only the reproduced repo-owned boundary while preserving current optimized array and Map behavior.
4. If the fix touches shared notification semantics, add a focused non-React listener test for optimized object key-count changes.
5. Validate with:
   - `bun test --timeout 50 tests/react.test.tsx`
   - `bun test --timeout 50 tests/tests.test.ts`
   - `npm test -- --runInBand tests/react.test.tsx`
   - `npm run typecheck`

# Run Log

- Blocked: 2026-07-02T17:27:38Z
- Reason: `approval` was `pending`; `run-agent-doc` requires `approval: approved` before implementation.
- Started: 2026-07-02T17:32:00Z
- Start state: branch `main`, commit `0456767a`
- Inspected: `src/react/For.tsx`, `src/ObservableObject.ts`, `src/globals.ts`, `src/batching.ts`, `tests/react.test.tsx`, `tests/tests.test.ts`
- Changed: `src/globals.ts`, `src/ObservableObject.ts`, `tests/react.test.tsx`, `tests/tests.test.ts`
- Reproduction:
  - `bun test --timeout 50 tests/react.test.tsx`: failed before fix with optimized object `For` rendering 2 items after adding `m0`
  - `bun test --timeout 50 tests/tests.test.ts`: failed before fix because optimized object listener did not fire on `key3` add
  - Follow-up core test failed before final tweak because same-size replacement `{key1,key2}` -> `{key1,key4}` did not notify optimized object listeners
- Validation:
  - `bun test --timeout 50 tests/react.test.tsx`: passed
  - `bun test --timeout 50 tests/tests.test.ts`: passed
  - `npm test -- --runInBand tests/react.test.tsx`: passed
  - `npm run typecheck`: passed
  - `bun test --timeout 5000`: passed, 1058 tests
  - `npm run lint:check`: passed
  - `npm run format:check`: passed

# Diagnosis

- Problem: `<For each={record$} optimized>` did not re-render when a plain object record gained or lost keys, so inserted items were not rendered.
- Cause: Optimized listeners only received collection-change notifications for array length and Map/Set size changes; plain object key membership changes never set the optimized notification flag, so `batching.ts` suppressed the listener.
- Solution: Track object key-presence transitions and treat plain object key membership changes as optimized collection changes, matching the existing array/Map behavior.

# Changes

## Track Parent Key Presence

This gives the notifier a precise add/delete signal for plain object keys without changing existing callers.

`src/globals.ts:123`

```diff
+    const parentHadKey =
+        useSetFn || useMapFn ? parentValue.has(key) : Object.prototype.hasOwnProperty.call(parentValue, key);
...
+    const parentHasKey =
+        useSetFn || useMapFn ? parentValue.has(key) : Object.prototype.hasOwnProperty.call(parentValue, key);
+
+    return { prevValue, newValue, parentValue, parentHadKey, parentHasKey };
```

## Notify Optimized Object Listeners

This makes object records behave like optimized arrays and Maps for collection membership changes while preserving nested-field suppression.

`src/ObservableObject.ts:723`

```diff
+            parentHadKey,
+            parentHasKey,
...
+                parentHadKey !== parentHasKey,
```

`src/ObservableObject.ts:910`

```diff
+    let valueAsObj: Record<any, any> | undefined;
...
+        } else if (isObject(newValue)) {
+            valueAsObj = newValue;
...
+    } else if (valueAsObj) {
+        const keys = Object.keys(valueAsObj);
+        const prevValueAsObj = isObject(prevValue) ? prevValue : {};
+        const prevKeys = Object.keys(prevValueAsObj);
+        whenOptimizedOnlyIf =
+            keys.length !== prevKeys.length || keys.some((key) => !hasOwnProperty.call(prevValueAsObj, key));
+    } else if (isObject(parentValue)) {
+        whenOptimizedOnlyIf = !!parentKeyChanged;
```

## Add React Regression

This locks the issue path: optimized object `For` renders inserted keys and removes deleted keys.

`tests/react.test.tsx:848`

```diff
+    test('For with object optimized inserts and deletes keys', () => {
+        const items$ = observable<Record<string, TestObject>>({
+            m2: { label: 'B', id: 'B' },
+            m1: { label: 'A', id: 'A' },
+        });
...
+        items$.m0.set({ label: 'Z', id: 'Z' });
+        expect(items.length).toEqual(3);
...
+        items$.m0.delete();
+        expect(items.length).toEqual(2);
+    });
```

## Add Core Listener Coverage

This proves the fix is in shared optimized notification semantics, not only React `For`.

`tests/tests.test.ts:2684`

```diff
+    test('Key changes notify optimized object listeners', () => {
+        obs.test.onChange(handler, { trackingType: optimized });
+        obs.test.key3.set({ text: 'hello3' });
+        expect(handler).toHaveBeenCalledTimes(1);
+        obs.test.key1.text.set('hello1');
+        expect(handler).toHaveBeenCalledTimes(1);
+        obs.test.key3.delete();
+        expect(handler).toHaveBeenCalledTimes(2);
+        obs.test.set({ key1: { text: 'hello1' }, key4: { text: 'hello4' } });
+        expect(handler).toHaveBeenCalledTimes(3);
+    });
```

# Result

Fixed. Optimized object listeners now behave like optimized array/Map collection listeners for key membership changes. `<For each={record$} optimized>` updates when record keys are inserted, deleted, or replaced by a same-size key set, while nested field updates still do not trigger the optimized collection listener.

# Self Review

- Confidence: 99% | Good: Reproduced the remaining issue 452 path locally, fixed the shared optimized notification boundary, added same-size key replacement coverage, and validated with focused React/core tests plus full Bun/typecheck/lint/format. | Caveat: Did not run the external StackBlitz/repo manually.
- Scope: Limited to optimized object collection notifications and focused React/core regressions.
- Risk: Optimized object listener semantics are broader than before, but they now match collection membership behavior and avoid nested-field notifications.
- Tests: Focused Bun React/core tests, Jest React parity, full Bun suite, typecheck, lint, and format all passed.
