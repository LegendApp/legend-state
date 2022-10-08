## 0.19.4

- Feat: Added `useObservableReducer` hook, which is the same as `useReducer` but it updates an observable rather than triggering a render

## 0.19.3

- Fix: Fast Refresh not disposing `observe()` correctly
- Fix: React hooks error in Show when toggling if it has a children function
- Types: Improved types of For to handle computed observables better
- Types: Improved types of useObservable to support Promises

## 0.19.2

- Feat: `createObservableHook` for converting other hooks that use `useState` to return an observable

## 0.19.1

- Feat: Support two-way binding multiple props, starting with checked$ on input

## 0.19.0

This is a big one, with a breaking change to stop observing all React components automatically. See https://legendapp.com/dev/state/migrating for more details.

- Breaking: No longer observing all React components automatically. Please use `observer` or `useSelector` for observable tracking.
- Breaking: Primitives no longer have `value` - use the standard `get()` or `set()` instead
- Breaking: Removed `get(false)` in favor of `peek()`
- Deprecated: Bindable components will be phased out in favor of new reactive components. Import `{ legend }` on web or `{ Legend }` on react-native instead of Bindable.
- Feat: Added `observer` HOC component
- Feat: `reactive` components that let you pass an observable or selector to any prop [reactive-props](https://legendapp.com/dev/state/reactive-props)
- Feat: `useSelector` has options to control how often it renders and to reuse forceRender functions
- Fix: Improved types for TypeScript strict mode
- Fix: Local storage persistence removes item if undefined
- Fix: Rendering multiple obseravbles inside one element had key collision issues

## 0.18.8
- Fix: Array move detection further improved

## 0.18.7
- Feat: `observe` function can return false to prevent tracking
- Fix: Tracking was sometimes getting out of order with nested components and computed
- Fix: useSelector was triggering renders multiple times
- Fix: Array move detection was incorrect on inserts

## 0.18.6
- Fix: React-specific props were creating proxies unnecessarily

## 0.18.4
- Fix: Fast refresh issues with bindable components

## 0.18.3
- Fix: Fast refresh issues with direct rendering

## 0.18.2
- Fix: Rendering directly to JSX was not activating computeds
- Types: Improved typing of observable and useObservable to more correctly narrow down complex types

## 0.18.1
- Fix: Crash in Switch component in development

## 0.18.0
- Breaking: Renamed tracing functions to `use*` to match hook naming
- Fix: Improved automatic React hooking into dispatcher to not need a `useEffect` and more dependably cleanup
- Fix: Better handling JSX and DOM elements in observables
- Fix: Tracing functions were not always working correctly
- Fix: Errors building in Next.js
- Fix: Typing of Show component with Babel plugin enabled
- Feat: Support `computed` with a Promise

## 0.17.6
- Fix: React behavior disabled until it's activated by React rendering it

## 0.17.5
- Fix: Missing export of `useSelector`

## 0.17.4
- Fix: Improve `observe()` disposing

## 0.17.3
- Fix: Undefined observables were not rendering directly in React properly
- Fix: `observe()` was not updating listeners on each run

## 0.17.2
- Fix: Typo in mergeIntoObservable

## 0.17.1
- Fix: Wrapped React hook injection in try/catch because it was sometimes causing errors like when hydrating in Next.js

## 0.17.0

This is a big one, with mainly a breaking change to how primitives work, so see https://legendapp.com/dev/state/migrating for more details.

- Breaking: Primitives in state are now returned as observable objects like everything else, and you can use `get()` or `.value` to access/modify the value
- Breaking: Removed `obs()` function
- Breaking: `set()` no longer has a keyed version because it's not needed now that we can dot through undefined nodes
- Breaking: Renamed `useComputed` to `useSelector`
- Feature: Because primitives are returned as observables, we can now dot through undefined nodes
- Feature: Added `peek()` function, which is the same as `get(false)`
- Feature: `useComputed` returns a `computed` observable
- Feature: `useObserve` creates an `observe` context
- Feature: `computed` is now lazy and won't activate until its value is accessed for the first time
- Feature: `Show` has a `wrap` prop to wrap children, for example with <AnimatePresence>
- Feature: Allow observable with no parameters, initialized to undefined
- Feature: `verifyNotTracking()` to make sure that components never re-render
- Perf: Observables created as primitives use a class instead of a Proxy, to speed up the scenario of using tons of primitive observables
- Perf: Listeners that don't care about the value (like observe and React components) skip passing all the parameters to callbacks
- Fix: The new `enableLegendStateReact()` is more stable and works better with nested components
- Fix: Rendering observables directly is more stable, especially in React Native
- Fix: Modifying listeners in an `observe` was sometimes causing infinite loops

## 0.16.1
- Fix: A component going from tracking nodes to not tracking nodes was causing errors

## 0.16.0

See https://legendapp.com/dev/state/migrating for more details.

- Breaking: Removed `observer` HOC
- Feat: No longer need `observer` HOC - Call `enableLegendStateReact()` at the beginning of your app, and then all components automatically observe any accessed state
- Feat: `when` callback receives the current value as the parameter
- Feat: Add join to array functions that create shallow listeners

## 0.15.3
- Feat: Observables can easily switch back and forth between being an object or a primitive, and observable primitives have less overhead

## 0.15.2
- Fix: Crash when creating an observable starting undefined

## 0.15.1
- Fix: Assigning an object with function children

## 0.15.0

This is a big one with many breaking (but good) changes, so see https://legendapp.com/dev/state/migrating for more details. We're making a lot of breaking changes all once so it's not too impactful.

- Breaking: There are now three levels of safety: Unsafe, Default, Safe. "Default" is new and allows direct assignment to primitives but prevents directly assigning to everything else. The previous default behavior was "Unsafe" so you may see errors if you were directly assigning to objects/arrays/etc... Replace those with `.set(...)` or pass in `false` as the second parameter to `observable` to go back to "Unsafe" mode.
- Breaking: Renamed `ref()` to `obs()`
- Breaking: The array optimizations are now opt-in, because they can potentially have some unexpected behavior if modifying the DOM externally. You can enable them by using the `For` component with the `optimized` prop.
- Breaking: Replaced `shallow` with a `Tracking` namespace, to add Optimized tracking. Change `shallow` to `Tracking.shallow` to get the previous behavior, or `Tracking.optimized` on an array to get the optimized behavior.
- Breaking: Changed `observableBatcher` to export the batching functions directly instead of as a namespace
- Breaking: Removed `onChangeShallow`, `onTrue`, `onEquals`, and `onHasValue` in favor of the new `effect` and `when` which automatically track any accessed observables.
- Breaking: Renamed primitive observables' wrapping value from `current` to `value`.
- Breaking: Renamed `observableComputed` to `computed` and `observableEvent` to `event`.
- Breaking: Renamed the bindable components from `LS` to `Bindable` and they now export from '@legendapp/state/react-components' or '@legendapp/state/react-native-components'
- Feat: Observable primitives can be rendered directly in React
- Feat: Added `observe`, which can run arbitrary code while tracking all accessed observables.
- Feat: Added `when`, which can run functions when the predicate returns a truthy value.
- Feat: Added `Switch` component
- Feat: Support creating an observable with a Promise as a value, which will update itself when the promise resolves.
- Feat: A `lockObservable` function to prevent writes
- Fix: Observables with arrays at the root were not notifying listeners properly
- Fix: Accessing `current` (now `value`) on a primitive observable was not tracking as expected
- Fix: Improve types of Memo/Computed/Show components so that they require functions by default, and are expanded to not need functions when referencing the babel types.

## 0.14.5
- Feat: Allow passing observables directly to Show
- Fix: Usage of old observe() when if prop is an observable

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
