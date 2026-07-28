---
id: issue-552-persistence-collection-mutations
source_type: github_issue
source: https://github.com/LegendApp/legend-state/issues/552
repo: LegendApp/legend-state
issue_number: 552
issue_url: https://github.com/LegendApp/legend-state/issues/552
issue_title: "[Bug] Persistence issues with collection mutations (Array.push, Map.delete) and initial values"
triage_status: ready
issue_type: bug
area: persist
severity: high
urgency: critical
effort: s
confidence: high
repro_quality: strong
priority_score: 92
priority_reason: The root-array corruption is a stable-release data-integrity blocker; the other two reported behaviors are fixed or intentional.
next_action: review
approval: approved
implementation_status: done
base_ref: cd6ee1ba85dd8725bf862797606050ff14b76e93
agent_doc_version: 1
updated_at: 2026-07-27
---

# Issue

The first indexed mutations of an initially undefined root array were persisted into an object-shaped cache. The persistence plugins had no root container to update, and an indexed change does not encode whether the missing root was an array or a numeric-keyed object.

# Triage

- **Release blocker:** Yes for root-array corruption.
- **Decision:** Persist the full transformed root when the observable and persisted root container types differ, then resume incremental path writes.
- **Initial values:** An initial value is an in-code fallback, not an eager storage write. Persistence starts with the first change.
- **Map deletion:** The reported root `Map.delete` path passes on current main and needs no source change.

# Evidence

- The exact root-array reproduction stored `{"0":"item1","1":"item2","2":"item3"}` before the fix.
- The emitted indexed changes contain child path types but cannot encode the missing root container type.
- LocalStorage, AsyncStorage, MMKV, and IndexedDB all apply the shared prepared changes, so fixing the preparation boundary avoids plugin-specific inference.
- Focused current-main tests showed root Map deletion stores the remaining Map correctly and an untouched initial array does not write to storage.

# Problem Area

- Boundary: converting observable path changes into changes that can be applied to an existing persisted root.
- Invariants:
  - A missing or differently shaped persisted root cannot receive ambiguous child changes.
  - Save transforms still run on the full fallback value.
  - Once root types agree, ordinary path-level persistence remains incremental.
  - Initial state alone does not create a persisted table.

# Changes

- Track the raw persisted root type after local load.
- When a nested local change targets a differently typed observable root, replace that local change batch with one full-root change before applying the configured save transform.
- Update the tracked persisted root type after a successful root write.
- Add exact regressions for first root-array pushes, root Map deletion, and initial-value behavior.

# Validation

- `bun test tests/persist.test.ts --timeout 1000` — passed.
- `npm run typecheck` — passed during focused validation.

# Remaining Risks

- This fix intentionally uses a coarse full-root persistence write only for a root container-type transition. Very large collections pay that one-time cost; later writes remain incremental.
- Custom persistence plugins that mutate their returned root into another container type without a root write are outside the plugin contract and may make the tracked type stale.
- Eagerly persisting initial defaults would be a separate behavior change and should not be bundled into this corruption fix before 3.0 stable.

# Result

Initially undefined root arrays now persist as complete arrays on their first indexed mutation. The other two reported behaviors are classified: current Map deletion is correct, and initial values remain non-eager defaults.

# Self Review

- Confidence: 97% | Good: exact failure, shared-boundary fix, transform preservation, and adjacent contract coverage. | Caveat: the first type-transition write is necessarily full-root because child changes do not encode the missing root type.
