## 0.14.4
- Fix: Some issues in remote persistence plugins (not yet released)

## 0.14.3
- Fix: Some issues in remote persistence plugins (not yet released)

## 0.14.2
- Fix: Old versions of React Native were crashing because of using `React.` without importing it

## 0.14.1
- Fix: `For` component with children re-renders with the latest children correctly

## 0.14.0
- Feature: A `For` component for easy rendering with array optimizations
- Fix: Improve performance of observer
- Fix: Support `_id` or `__id` field names for array optimizations
- Fix: Mixing shallow and non-shallow listeners in a component could have not mixed correctly

## 0.13.2
- Types: Renamed exported types for improved clarity

## 0.13.1
- Fix: Exported components were losing className/style when not using bind prop

## 0.13.0
- Breaking Change: Removed observe() and prop(), favoring get() and ref(). get() tracks by default and ref() does not.
- Feat: Support ref to a path on an undefined value
- Fix: A crash when calling get() on an observable with undefined parents
- Types: Enforce bind prop to not be a primitive

## 0.12.1
- Types: Improved types of exported components

## 0.12.0
- Feat: Allow direct assignment, with warnings to catch accidental errors, and an optional "safe" mode
- Feat: input components with `bind` prop that automatically binds an observable to value and onChange
- Feat: Support keyed ref: `obs.ref('key')`
- Feat: `onChange` has a `runImmediately` option
- Fix: `.ref()` and `.get()` inside an `observer` do reference counting so they don't untrack too aggressively
- Fix: `delete()` was notifying listeners with the value undefined, but the key not yet deleted
- Fix: `observer` was sometimes missing updates occurring between render and mount

## 0.11.0-beta.7
- Fix: New set option with function parameter was breaking persistence
- Fix: Component useEffect was getting called before observer could listen for changes

## 0.11.0-beta.6
- Fix: Babel plugin adds imports only once, only if not already imported

## 0.11.0-beta.5
- Feat: `set()` can take a function to easily compute it relative to the previous value

## 0.11.0-beta.4
- Feat: Added `traceListeners` and `traceUpdates` functions (exported from @legendapp/state/trace). Call them within an observer. `traceListeners` logs the path of all tracked observables, while `traceUpdates` logs details of each observable change that causes a render.

## 0.11.0-beta.3
- Fix: observer was not working the first time in StrictMode
- Fix: observer was not cleaning up old listeners when the the tracked observables changed
