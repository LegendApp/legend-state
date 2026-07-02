---
id: issue-424
source_type: github_issue
source: .github-cache/open/issues/00424-deleting-items-in-a-store-observable-record-string-item-does-not-update-derived-.md
repo: /Users/jay/Documents/code/legendapp/legend-state
issue_number: 424
issue_url: https://github.com/LegendApp/legend-state/issues/424
issue_title: Deleting items in a store Observable<Record<string, Item>> does not update derived lists correctly
triage_status: ready
severity: medium
approval: approved
implementation_status: done
base_ref: main@9c2b513f
agent_doc_version: 1
updated_at: 2026-07-02T16:28:39Z
---

# Issue

- Source: `.github-cache/open/issues/00424-deleting-items-in-a-store-observable-record-string-item-does-not-update-derived-.md`
- URL: https://github.com/LegendApp/legend-state/issues/424
- Title: Deleting items in a store `Observable<Record<string, Item>>` does not update derived lists correctly
- Repo: `/Users/jay/Documents/code/legendapp/legend-state`
- Base: `main@9c2b513f`

# Triage

- Status: ready
- Severity: medium
- Confidence: high

Summary: Deleting a non-tail item from a record-backed `Object.values(...)` computed list can leave activated array index child observables stale.

Decision: Reproduce at the computed array child/index layer first. Treat React `<For>` as a downstream integration symptom, not the root boundary.

# Evidence

- Issue repro shape: `itemList: () => Object.values(state$.items)`, then `itemDerivedList`, `filteredList`, and `sortedList` derive from that list.
- External repro `src/state.ts` deletes the first record item and says `state$.itemList.peek()` inside the same batch partially fixes indexes.
- External repro renders `state$.itemDerivedList` and `state$.filteredList` via `<For>`.
- Current direct probe of `.get()`/`.map()` values after deleting `ID_1` and `ID_3` returned correct arrays, so raw computed values are not the failing surface.
- Lower-level probe reproduced the core mismatch without React: after activating `state$.itemList[0..4].id.get()`, deleting `ID_1` made `state$.itemList.get()` return `ID_2..ID_5` but index children read `ID_2, ID_3, ID_4, ID_5, ID_5`.
- Temporary React render probe reproduced the same symptom through `<For each={state$.itemList}>`; React exposes the stale index children but is probably not the root cause.
- `src/react/For.tsx:83` passes `(each as Observable<any[]>)[i]` to children, so it naturally inherits any stale computed-array child/index behavior.
- Existing tests cover some computed array link deletion cases, but not activated numeric children of `Object.values(record)` after deleting a non-tail source item.

# Plan

1. Add a focused failing regression in `tests/computed.test.ts`:
   - record store
   - `itemList: () => Object.values(state$.items)`
   - activate `state$.itemList[0..n].id.get()`
   - delete first item
   - assert activated index children and raw `.get()` both read `ID_2, ID_3, ID_4, ID_5`
2. Add derived-list assertions for `itemDerivedList` / `filteredList` if the base computed-array child test passes too narrowly.
3. Inspect/fix computed array child-node reuse/activation in `src/ObservableObject.ts` / related tracking code so shifted indexes do not keep stale child values.
4. Add a `tests/react.test.tsx` `<For>` integration regression only if the lower-level fix passes but rendered lists can still fail.
5. Validate with focused tests first:
   - `bun test --timeout 50 tests/computed.test.ts`
   - `bun test --timeout 50 tests/react.test.tsx`

# Run Log

- Blocked: 2026-07-02T13:31:23Z
- Reason: `approval` is `pending`; `run-agent-doc` requires `approval: approved` before execution.
- Started: 2026-07-02T13:36:52Z
- Start state: branch `main`, commit `9c2b513f`
- Inspected:
  - `src/ObservableObject.ts`
  - `tests/computed.test.ts`
- Changed:
  - `src/ObservableObject.ts`
  - `tests/computed.test.ts`
- Validation:
  - `bun test --timeout 50 tests/computed.test.ts`: failed before fix with stale `ID_5` at deleted index `4`, passed after fix
  - `bun test --timeout 50 tests/react.test.tsx`: passed
  - `npm run typecheck`: passed
  - `bun test --timeout 50`: failed only because unrelated async/Babel tests exceed the 50ms timeout
  - `bun test --timeout 5000`: passed, 1056 tests
  - `npm test -- --runInBand tests/computed.test.ts tests/react.test.tsx`: passed
  - `npm run lint:check`: passed
  - `npm run format:check`: passed
- Safety check:
  - Verified `parent.functions` is the extracted function/link table read before raw property access.
  - Added coverage that removed array indexes clear their function/child entries, can recreate when the computed array grows, and clear again across tail and repeated middle deletes.
  - Added object-link delete/re-add coverage to make sure adjacent computed-link behavior still returns `undefined` after delete and reattaches after re-add.
  - Confirmed out-of-range reads may create inert child nodes, but the important stale-link invariant is that `functions` stays cleared.
- Minimization:
  - Replacing the shrink cleanup with a one-line delete in the previous-array scan failed the regression.
  - Removed the extra `deletedChildren` bookkeeping; focused computed, React, and typecheck validation still passed.
  - Rejected sparse-array-specific cleanup as too much code for a rare edge; kept the straightforward tail-range cleanup.

# Diagnosis

- Problem: A record-backed `Object.values(...)` computed array could shrink correctly at the raw `.get()` level while an already-activated trailing index child still returned the old last item.
- Cause: Deleted array children were deactivated only partially, and their extracted function/link entry could remain on the parent; after array shrink cleanup, accessing the old out-of-range index could recreate the child from the stale target.
- Solution: Fully deactivate deleted children, clear their parent function entry, and delete trailing child nodes when arrays shrink so shifted indexes and out-of-range reads reflect the current computed array.

# Changes

## Clear stale computed-array child links

Solved the recreated stale tail index by fully deactivating deleted children and removing their extracted function entry, so a later out-of-range read cannot relink to the old target.

File: `src/ObservableObject.ts:378`

```diff
-    child.linkedToNodeDispose?.();
-    child.activatedObserveDispose?.();
+    deactivateNode(child);
+    child.parent?.functions?.delete(child.key);
```

## Remove trailing child nodes when arrays shrink

Solved activated out-of-range array indexes retaining old child nodes after a computed array becomes shorter. Sparse-array-specific optimization was rejected to keep the core path simple.

File: `src/ObservableObject.ts:345`

```diff
+        if (isArr && length < lengthPrev && parent.children) {
+            for (let i = length; i < lengthPrev; i++) {
+                const key = i + '';
+                const child = parent.children.get(key);
+                if (child) {
+                    handleDeletedChild(child, prevValue?.[i]);
+                    parent.children.delete(key);
+                }
+            }
+        }
```

## Add regression coverage

Locks the reported `Object.values(record)` shape so activated index children match the shortened raw computed array after deleting the first source record item. It also asserts stale entries clear before out-of-range reads, recreate when the array grows, and clear again across tail and repeated middle deletes.

File: `tests/computed.test.ts:2116`

```diff
+        state$.items.ID_1.delete();
+
+        expect(readRaw()).toEqual(['ID_2', 'ID_3', 'ID_4', 'ID_5']);
+        expect(itemListNode.functions?.has('4')).toEqual(false);
+        expect(itemListNode.children?.has('4')).toEqual(false);
+        expect(readChildren()).toEqual(['ID_2', 'ID_3', 'ID_4', 'ID_5', undefined]);
+        expect(itemListNode.functions?.has('4')).toEqual(false);
+
+        state$.items.ID_6.set({ id: 'ID_6', value: 6 });
+
+        expect(readRaw()).toEqual(['ID_2', 'ID_3', 'ID_4', 'ID_5', 'ID_6']);
+        expect(state$.itemList[4].id.get()).toEqual('ID_6');
+        expect(itemListNode.functions?.has('4')).toEqual(true);
+
+        state$.items.ID_6.delete();
+
+        expect(readRaw()).toEqual(['ID_2', 'ID_3', 'ID_4', 'ID_5']);
+        expect(itemListNode.functions?.has('4')).toEqual(false);
+        expect(itemListNode.children?.has('4')).toEqual(false);
+
+        state$.items.ID_3.delete();
+
+        expect(readRaw()).toEqual(['ID_2', 'ID_4', 'ID_5']);
+        expect(itemListNode.functions?.has('3')).toEqual(false);
+        expect(itemListNode.children?.has('3')).toEqual(false);
```

## Add adjacent computed-link safety coverage

Verifies the broader computed-link path remains safe: deleting a source key produces `undefined` for that computed object child, and re-adding the source key reattaches correctly.

File: `tests/computed.test.ts:2036`

```diff
+        expect(comp.a.id.get()).toEqual('a');
+
+        obs.a.delete();
+
+        expect(comp.get()).toEqual({ b: { id: 'b', text: 'hib' } });
+        expect(comp.a.id.get()).toEqual(undefined);
+
+        obs.a.set({ id: 'a2', text: 'hia2' });
+
+        expect(comp.a.id.get()).toEqual('a2');
```

# Result

Fixed. Deleted computed-array children now fully deactivate, clear the parent extracted function entry, and stale trailing child nodes are removed when arrays shrink. The shrink cleanup is intentionally a simple tail-range scan; sparse-array-specific handling was left out as too much complexity for a rare edge. Added regression coverage for the reported `Object.values(record)` list behavior, grow/shrink/repeated-delete variants, and adjacent computed-link delete/re-add behavior.

# Self Review

- Confidence: 98% | Good: The fix targets the reproduced stale child/link path, covers grow/shrink/repeated-delete variants, passes full Bun validation, and passes focused Jest/React/typecheck/lint/format checks. | Caveat: It intentionally skips manual external-app reproduction and rare sparse-array-specific optimization.
- Scope: Limited to array child cleanup in `src/ObservableObject.ts` plus focused computed regressions.
- Risk: Core observable array internals are sensitive, but the production diff is narrow and the full Bun suite passed.
- Tests: `bun test --timeout 50 tests/computed.test.ts`, `bun test --timeout 50 tests/react.test.tsx`, `bun test --timeout 5000`, focused `npm test`, `npm run typecheck`, `npm run lint:check`, and `npm run format:check` passed.
