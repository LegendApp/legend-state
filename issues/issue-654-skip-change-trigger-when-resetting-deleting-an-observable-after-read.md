---
id: issue-654
source_type: github_issue
source: .github-cache/open/issues/00654-skip-change-trigger-when-resetting-deleting-an-observable-after-read.md
repo: /Users/jay/Documents/code/legendapp/legend-state
issue_number: 654
issue_url: https://github.com/LegendApp/legend-state/issues/654
issue_title: Skip change trigger when resetting/deleting an observable after read
triage_status: ready
severity: low
approval: approved
implementation_status: done
base_ref: main@31dac24a
agent_doc_version: 1
updated_at: 2026-07-02T13:17:45Z
---

# Issue

- Source: `.github-cache/open/issues/00654-skip-change-trigger-when-resetting-deleting-an-observable-after-read.md`
- URL: https://github.com/LegendApp/legend-state/issues/654
- Title: Skip change trigger when resetting/deleting an observable after read
- Repo: `/Users/jay/Documents/code/legendapp/legend-state`
- Base: `main@31dac24a`

# Triage

- Status: ready
- Severity: low
- Confidence: high

Summary: The issue asks how to react to an `onChange` value and then clear the observable without the cleanup causing a second change callback.

Decision: Answer with the existing `setSilently` API. No product-code change is needed unless docs should add this recipe.

# Evidence

- Issue hook calls `observable$.delete()` inside `onChange`, which triggers a second change with `value === undefined`.
- `src/helpers.ts:225` exports `setSilently(value$, newValue)`, which writes through `setNodeValue` without notification.
- `index.ts:18` exports `setSilently` from the package root.
- Local probe: replacing `observable$.delete()` with `setSilently(observable$, undefined)` clears the value and leaves the listener at one call.

# Plan

1. Draft a GitHub response showing `setSilently(observable$, undefined)` in the hook.
2. Mention that `delete()` is intentionally observable, while `setSilently` is the escape hatch for cleanup/update-without-notify.
3. Optional follow-up: add this as a docs recipe if repeated questions appear.
4. Validate with a focused test or `bun -e` probe if changing code/docs.

# Run Log

- Blocked: 2026-07-02T13:16:00Z
- Reason: `approval` is `pending`; `run-agent-doc` requires `approval: approved` before execution.
- Started: 2026-07-02T13:17:45Z
- Start state: branch `main`, commit `9c2b513f`
- Inspected:
  - `src/helpers.ts`
  - `index.ts`
- Changed:
  - task document only
- Validation:
  - `bun - <<'EOF' ... EOF`: passed; `setSilently(exchange$, undefined)` cleared the value and produced one listener call.

# Result

No product-code change needed. The existing `setSilently` API supports this pattern; use it to clear the exchange observable without notifying listeners.

# Self Review

- Confidence: 95% | Good: answers the requested pattern with an existing exported API and verified behavior. | Caveat: docs may still need a recipe if this comes up often.
- Scope: drafted support answer; no implementation diff needed.
- Risk: `setSilently` bypasses all listeners, so it should be used only for intentional cleanup.
- Tests: focused `bun` probe passed.
- Follow-up: consider docs recipe for consume-and-clear exchange values.

# GitHub Follow-up

I think setSilently is what you're looking for? It sets without triggering any listeners.

```ts
import { setSilently } from '@legendapp/state';

setSilently(observable$, undefined);
```

Is that what you're looking for? Or are you looking for more like a middleware to intercept and modify changes before they flow through?
