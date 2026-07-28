---
id: issue-441-reset-empty-initial
source_type: github_issue
source: https://github.com/LegendApp/legend-state/issues/441
repo: LegendApp/legend-state
issue_number: 441
issue_url: https://github.com/LegendApp/legend-state/issues/441
issue_title: Resetting store clears localstorage but does not re-render app
triage_status: ready
issue_type: bug
area: sync
severity: high
urgency: critical
effort: s
confidence: high
repro_quality: strong
priority_score: 94
priority_reason: Reset failing to restore and notify an empty initial collection is observable stable-API behavior.
next_action: review
approval: approved
implementation_status: done
base_ref: cd6ee1ba85dd8725bf862797606050ff14b76e93
agent_doc_version: 1
updated_at: 2026-07-27
---

# Issue

A value-form `initial: {}` became the mutable backing object of the synced observable. Adding records mutated the configured initial object itself, so `reset()` later set the observable to the same populated reference and neither cleared tracked values nor notified consumers.

# Triage

- **Release blocker:** Yes. This changes the documented reset behavior and visible React output.
- **Decision:** Snapshot value-form initial state when sync is configured and create a fresh supported value for every reset. Continue invoking function-form initial values for each reset.
- **Rejected shortcut:** JSON serialization would drop functions, reject cycles, and narrow supported values despite Legend's Date/Map/Set support.

# Evidence

- The current-main regression tracked `Object.values(obs$.get()).length`; after adding one item and calling `reset()`, the last observed length remained `1`.
- The same failure occurred on the first reset, not only after repeated resets.
- `syncState.reset()` passed `syncOptions.initial` back to `set`, but that object had already been mutated through the observable.
- PR #571 identified the same area, but its clone approach introduced serialization and loading-state concerns.

# Problem Area

- Boundary: ownership and lifetime of `SyncedOptions.initial`.
- Invariants:
  - Value-form initial state is a reusable template, not mutable runtime state.
  - Function-form initial state is called again for reset.
  - Every reset provides fresh arrays, plain objects, Maps, Sets, and Dates.
  - Map keys and Set members retain their native identity.
  - Functions are preserved and cyclic supported collections do not recurse forever.
  - Reset continues to clear persistence and notify tracked readers.

# Changes

- Snapshot the configured value-form initial state before persistence or user mutations can alter it.
- Recreate supported mutable containers with cycle tracking for each reset.
- Use the same fresh initial-value resolver for `reset()` and `sync({ resetLastSync: true })`.
- Add an exact `Object.values` tracking regression across two resets.
- Add coverage that Date, Map, Set, and function values survive reset without JSON serialization, while Map keys and Set members retain identity.

# Validation

- Exact regression failed before the fix with observed length `1` and passes after it.
- Non-JSON reset coverage passes.
- Existing function-form initial tests pass.
- `npm run typecheck` passes.

# Remaining Risks

- Non-plain class instances, Promises, Temporal values, and other opaque objects are retained by reference. Legend does not deep-track their internals; applications needing fresh instances should use function-form `initial`.
- Map values are cloned, while Map keys and Set members retain identity so native lookup semantics survive reset. Applications that need fresh object keys or Set members should use function-form `initial`.
- This fixes value restoration and notifications. Subscription restart and `isLoaded` timing remain governed by the existing reset lifecycle and its dedicated tests.

# Result

Reset now restores an empty value-form initial object with a fresh identity and notifies tracked `Object.values` consumers on the first and subsequent resets without narrowing reset to JSON-serializable state.

# Self Review

- Confidence: 96% | Good: exact tracked repro, repeated reset coverage, non-JSON values, function-form compatibility, and no loading-state rewrite. | Caveat: opaque custom instances remain caller-owned by design.
