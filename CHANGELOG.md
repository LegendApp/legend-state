## 1.11.1

- Removed the deprecation warning about reactive props since that might affect a lot of people and we can migrate that more slowly.

## 1.11.0

- This version displays deprecation warnings to prepare for version 2.0 release which will remove the deprecated features. See https://legendapp.com/open-source/state/migrating/ for details on migration or disabling the warning.

## 1.10.3

- Fix: Reactive elements were not supporting observable children

## 1.10.2

- Types: Improve types of useObservableQuery - By @bram209 https://github.com/LegendApp/legend-state/pull/182

## 1.10.1

- Types: Types of Map and Set were not correct if at the root of an observable
- Fix: `size` property of Map was not an observable

## 1.10.0

- Feat: `proxy` supports three modes like computed: proxy to a computed plain object, proxy to an observable, proxy to a two-way computed
- Feat: `proxy` sets raw values on parents and notifies when proxied children change
- Fix: optimize batching so that modifying a child after modifying its parent merges into the existing change rather than creating a new change
- Fix: `Show` was not passing value to children when children is a function

## 1.9.0

- Feat: Nested computeds set their value on the raw object so that `get()` on the parent will include the values of child computeds

## 1.8.1

- Feat: Added findIDKey and optimized to internal
- Fix: Added more safety around dev-only assertions because they were throwing errors in some build systems

## 1.8.0

- Feat: Support Suspense with `useSelector(state, { suspend: true })` or `state.use({ suspend: true })`

## 1.7.3

- Types: Improved types of proxy so it can have complex mapped types

## 1.7.2

- Fix: opaqueObject was not blocking looping through objects in constructor https://github.com/LegendApp/legend-state/issues/163

## 1.7.1

Fix: the change to add SessionStorage was crashing when run server-side in Next.js

## 1.7.0

- Feat: Add `ObservablePersistSessionStorage`. -By @minorgod https://github.com/LegendApp/legend-state/pull/164

## 1.6.4

- Types: `Selector` now allows `ObservableEvent`
- Types: `ObservableWriteable` was not exactly correct after the change to add Promise to `set`

## 1.6.3

- Fix: `useObservableNextRouter` was throwing warnings on some route changes
- Fix: `enableDirectPeek` set now matches normal set behavior with promise and function extraction and all
- Types: Package is now built in TypeScript strict mode

## 1.6.2

- Types: Improved types of Computed, Memo, and the babel transform
- Types: Improved handling of null and undefined in observables

## 1.6.1

- Types: Improve handling of optional properties in observable constructor
- Types: Add missing Promise type in set function

## 1.6.0

- Feat: `set` automatically unwraps promises

## 1.5.1

- Fix: Optional properties in observables were causing TS warnings

## 1.5.0

- Feat: add Reactive components, with configuration for React and React Native, to replace Legend components
- Fix: Improved types of useObservableQuery -By @sheldon-welinga https://github.com/LegendApp/legend-state/pull/146
- Fix: babel transform was breaking Memo/Computed with observable child

## 1.4.0

- Feat: Returning an observable in a computed creates a two-way link to the target observable.
- Feat: `computed` is supported as a child of an observable
- Feat: `proxy` is like a `computed` but given a key, usable by indexing into an object with a string key
- Feat: Functions and computeds in the hierarchy of the constructing object in an observable are extracted into observable metadata so that setting the observable does not delete them.
- Feat: `Memo` and `Computed` support observables as children
- Feat: `reactiveComponents` makes multiple reactive components at once from the children of the target object
- Feat: Reactive components and `reactive` makes children reactive if it's a functions
- Fix: `useObserve` updates the compute and set functions when re-run
- Fix: Direct setting with `_` was not working with falsy values
- Change: Reactive props will now start with `$` instead of ending with `$`. Both work for now, but `prop$` will be deprecated in a later version.
- Perf: `useSelector` skips creating a hook if it's inside an `observer`

## 1.3.6

- Fix: Setting a primitive observable to the same value was still notifying listeners

## 1.3.5

- Fix: array.find was returning `[]` instead of `undefined` when it found no matches

## 1.3.4

- Feat: (experimental) `enableDirectPeek` enables a property on observables named _ as a shorthand for peek(), and assigning to it modifies the underlying object without notifying listeners of changes.

## 1.3.2

- Fix: `reactive` was not working with some external packages like NativeBase

## 1.3.0

See [https://legendapp.com/open-source/state/experiments/](https://legendapp.com/open-source/state/experiments/) for details about the new features in this version.

- Feat: Ability to globally add functions/properties to observables
- Feat: (experimental) `enableDirectAccess` enables a property on observables named $ as a shorthand for get/set
- Feat: (experimental) `enableReactUse` enables a `use()` function on all observables to get the value of an observable and track it for changes within a React component
- Feat: (experimental) `enableReactDirectRender` replaces `enableLegendStateReact` (will be deprecated in a later version)
- Fix: `afterBatch` was running after all recursive batches rather than just the current batch
- Fix: Circular reference detection was failing on null values

## 1.2.11

- Fix: detection of circular references was having false positives if references existed in multiple places in the hierarchy
- Fix: Crash in proxy trap with nested calls to assign (part 2)

## 1.2.10

- Fix: Crash in proxy trap with nested calls to assign

## 1.2.9

- Perf: A small optimization in For to skip Object.assign if there's no itemProps
- Perf: Change merge of pending data on load to use setAtPath instead of mergeIntoObservable
- Misc: Add some warnings when setting an observable directly

## 1.2.8

- Fix: Remove peerDependencies which was causing issues in some environments

## 1.2.7

- Fix: Potential crash in persistence if pathTypes comes from persistence undefined

## 1.2.6

- Fix: _arr in fieldTransforms not working for strings

## 1.2.5

- Fix: peerDependencies to make next optional

## 1.2.4

- Types: Fix types of Switch so that it works better with booleans

## 1.2.3

- Types: Fix types of Map get so that it returns an Observable of the correct type

## 1.2.2

- Fix: When persisting, changes to a node are ignored if a later change modifies a parent node (as can happen when deleting nodes)

## 1.2.1

- Feat: Support Map in the For component
- Change: TrackingType "optimize" parameter is changed to a symbol to avoid conflict with Map get. It will still work for now, but please `import { optimize } from "@legendapp/state"` and use that instead.
- Change: The For component's `eachValues` prop is deprecated in favor of just working with the `each` prop. It will still work for now, but please change `eachValues` to `each`.

## 1.2.0

- Feat: Added support for observable Map, WeakMap, Set, WeakSet

## 1.1.0

- Perf: Listeners are batched uniquely so that each listener will fire only once for all of the changes within a batch
- Change: Array filter and find return the observable instead of the raw data.

## 1.0.0

After an unexpectly large number of changes while in RC, 1.0 includes tons of improvements and fixes that can broadly be categorized as:

- Improved persistence plugin system
- Added two-way `computed`
- Performance improvements
- A few minor breaking changes - see https://legendapp.com/open-source/state/migrating/

See https://legendapp.com/open-source/legend-state-v1/ for more details.

## 1.0.0-rc.34

- Fix: Reactive FlatList `data$` prop was not working correctly #66

## 1.0.0-rc.33

- Perf: Improve performance of arrays
- Perf: Improve performance of useSelector when passing an observable directly
- Perf: Improve performance of the For component

## 1.0.0-rc.32

- Change: `useObserve` runs the function less often
- Change: `when` checks truthiness instead of readiness. Use `whenReady` if you want empty objects and arrays to not count.
- Change: `afterBatch` runs after the batch instead of at the end of a batch, which is more useful
- Perf: Changes are internally batched by node instead of by listener, resulting in fewer `onChange` calls

## 1.0.0-rc.31

- Feat: Add a sortValues function to For for use with eachValues

## 1.0.0-rc.30

- Feat: Add support for a _keyExtractor field to return an arbitrary key value on arrays
- Change: internals is exported as an object instead of a separate export path

## 1.0.0-rc.29

- Fix: Prevent batches from running recursively
- Fix: The second "reaction" paremeter in `observe` sometimes had an incorrect `previous` value

## 1.0.0-rc.27

- Fix: `getPrevious()` in onChange was sometimes incorrect during a batch

## 1.0.0-rc.26

- Perf: Removed IndexedDB preloader because it's actually slower because of the time it takes to copy the data across the Web Worker bridge

## 1.0.0-rc.23

- Perf: Miscellaneous micro-optimizing

## 1.0.0-rc.22

- Feat: Add a useObservableNextRouter hook for Next.js
- Perf: Persistence plugins queue into a microtask to bundle saves together

## 1.0.0-rc.21

- Feat: Added `eachValues` prop to For to map the values of an object

## 1.0.0-rc.20

- Fix: useSelector now uses useSyncExternalStore under the hood to support Suspense better

## 1.0.0-rc.19

- Fix: mergeIntoObservable was sometimes deleting undefined fields

## 1.0.0-rc.17

- Perf: Sped up IndexedDB plugin and removed the preloader because it was actually slower

## 1.0.0-rc.16

- Fix: Fast Refresh sometimes resetting observables -By @GiFarina

## 1.0.0-rc.14

- Perf: Running notifications in large objects sped up

## 1.0.0-rc.10

- Fix: `afterBatch` was not working correctly if run from within a batch

## 1.0.0-rc.4

- Feature: Added two way `computed`

## 1.0.0-rc.2

- Feature: `batch` has a new `onComplete `batch(callback, onComplete)` parameter to run a function after the batch commits. This can be useful for cleaning up a temporary state while batching.
- Fix: onChange with `initial` option fires immediately rather than going through batching process
- Fix: Applying pending changes on load was writing back to local persistence unnecessarily
- Perf: Improve performance of `mergeIntoObservable` by just doing a `set` if a target property is empty and doesn't need merging logic
- Perf: Improve persistence overall by using more targeted approaches than `mergeIntoObservable`

## 1.0.0-rc.1

- Fix: Incrementing a value from 0 with a function (`value.set((prev) => prev + 1)`) was not firing a callback the first time


## 1.0.0-rc.0

- Breaking: `onChange` function changed to take an options object as a second parameter with a new `initial` option that makes it fire immediately with the current value.
- Breaking: `onChange` callback receives an object parameter instead of many arguments. This adds more flexibility for callers who care about different values in the change object.
- Fix: `mergeIntoObservable` was not working correctly in some edge cases.
- Fix: IndexedDB persistence improved for many edge cases, with some fixes and performance improvements
- Fix: Persistence layers overall improved with more stability and better performance

## 0.23.1

- Fix: Not notifying on change of dates

## 0.23.0

- Breaking: Improved the criteria of when to notify up parents for changes on objects to run only when something inside it has changed, so setting/assigning the same object onto itself will not notify. It's unlikely but possible that may be a breaking change for you if you depended on things re-computing/re-rendering even if nothing changed.
- Breaking: Removed automatically treating DOM nodes and React elements as opaque objects - it added most likely unnecessary extra code and is easily solved in a more generic way. If you're storing those in observables, wrap them in `opaqueObject(...)`.
- Feature: Added `is*` functions to export
- Perf: Batching was never clearing its safety timeouts, so thousands of changes at once could have been slow

### Persistence
- Breaking: Changed ignoreKeys to be an array to be easier to use
- Breaking: Remove the flexibility for saving arrays and basic objects (can do that with itemID now).
- Feature: IndexedDB supports adjustData, prefixID, itemID, fieldTransforms
- Fix: IndexedDB `loadTable` not being considered loaded if no data was available
- Fix: Tons of miscellaneous IndexedDB fixes

## 0.22.5

### Persistence
- Fix: There was no way to subscribe to updates of dateModified

## 0.22.4

- Change: When returns the value directly, rather than a Promise, if it's already resolved on the first run

### Persistence
- Fix: mergeIntoObservable not working if source object has only symbol keys

## 0.22.3

- Fix: Not notifying on array change with the same length but ids added or removed

## 0.22.2

### Persistence
- Fix: IndexedDB preloader not loading correctly if it has to await the promise

## 0.22.1

### Persistence
- Fix: Changes deep in an object were not saving to IndexedDB correctly
- Fix: Metadata not saving properly from remote changes

## 0.22.0

- Breaking: Local Storage is no longer used as default persistence (to reduce build size for those not using it). Please configure persistence at the beginning of your application: https://legendapp.com/open-source/state/persistence/
- Breaking: Moved persist plugins to /persist-plugins export path
- Breaking: Internals of persistence plugins were changed to better support async loading and metadata. If you had made your own persistence plugin the changes should be straightforward, or create an Issue and we'll help migrate it.
- Breaking: `when` behavior tweaked to not be triggered by empty objects or empty arrays
- Feature: `ObservablePersistIndexedDB` for persisting to IndexedDB
- Fix: `useObserveEffect` not working right in React StrictMode
- Types: Improved typing of `For`

## 0.21.18

- Fix: `getObservableIndex` not working on index 0
- Fix: `useObserve` not working properly in StrictMode in React 18

## 0.21.17

- Fix: `useObservableQuery` was causing re-renders when using mutation

## 0.21.16

- Fix: `useObservableQuery` still not working right in StrictMode

## 0.21.15

- Fix: `useObservableQuery` not working in StrictMode

## 0.21.14

- Feat: Added `useObserveEffect`
- Fix: Added useReducer overriding to `createObservableHook`

## 0.21.13

- Feat: Added a `usePersistedObservable` hook
- Feat: Added an optional second parameter to observe for an untracked callback function
- Feat: Added helpers: `pageHash` and `pageHashParams` (replaces `useHash`)
- Fix: `useObservableQuery` was sometimes not working because it was not loading the correct Context
- Types: Improved types for strict mode

## 0.21.12

- Feat: For remote persistence plugins: Add options to disable local or remote sync, support loading remote even if there's no local

## 0.21.11

- Feat: Added useObservableQuery hook
- Feat: Added local persistence options, starting with mmkv configuration
- Change: Removed persist option from useObservable. It was a bad idea - it imported the whole /persist export. A better solution will come in an update soon.

## 0.21.10

- Fix: `createObservableHook` was not working with initialState as a function
- Perf: Reduce number of renders by not notifying if setting with an unchanged object or array

## 0.21.9

- Fix: A circular import warning in the react export

## 0.21.8

- Fix: `useSelector` was not cleaning up when components when components re-rendered from a source other than observables
- Types: Improved types for strict mode https://github.com/LegendApp/legend-state/pull/56

## 0.21.7

- Feat: Added another way to use the `Switch` component, with multiple `Show` children, that renders the first `Show` that matches
- Types: Improved types for strict mode https://github.com/LegendApp/legend-state/pull/52

## 0.21.6

- Feat: Added `opaqueObject` to make an element in an observable act as a primitive, not proxying its properties or notifying for changes.
- Feat: Added some helpers: `observableFetch`, `currentTime`, `currentDay`
- Feat: Added some hooks: `useFetch`, `useHash`, `useHover`, `useIsMounted`, `useMeasure`

## 0.21.5

- Feat: Add `getObservableIndex` function to use with the observable argument to `For`

## 0.21.4

- Fix: `reactive` was overriding the given function, causing problems if wrapping an external component and conditionally rendering the original component
- Fix: `useObservableReducer` was not working with non-function arguments

## 0.21.3

- Fix: History not saving the initial object creation
- Fix: Crash when modifying an array was that included as initial value to an observable

## 0.21.2

- Fix: React Native Switch was not two-way binding properly

## 0.21.1

- Feat: Added a deps array to useComputed so it can be updated if dependencies change
- Feat: Added reactive types for SVGs

## 0.21.0

See https://legendapp.com/open-source/state/migrating for more details.

- Breaking: Changed observable `onChange` callback to take an array of changes rather than a single changed value because batched changes were only showing the most recently changed child value.
- Breaking: Rename react-components export from legend to Legend
- Feat: `trackHistory` creates an observable that tracks a version history of a target observable
- Feat: persistObservable caches pending changes offline so if they're not successfully saved remotely, it attempts to sync them after remote persistence is loaded
- Feat: Allow mergeIntoObservables to delete by using a symbol

## 0.20.5

- Fix: Types of React Native components were not supporting refs properly

## 0.20.4

- Fix: Reactive components not forwarding refs properly

## 0.20.3

- Fix: Tracing functions crashing if component is not an observer

## 0.20.2

- Fix: mergeIntoObservable was overwriting object children with undefined values

## 0.20.1

- Fix: `observer` was not auto-memoizing after the rewrite in 0.20.0
- Fix: `For` which a child function auto-observes

## 0.20.0

- Breaking: Changed behavior of `observe` and `useObserve` so that they have a callback parameter, useful for observing an event and doing something only when it changes. It also has a new `previous` parameter to compare to the previous run which depends on a return value, so the previous behavior using the return value is moved into the callback parameter. If you were returning false to cancel observing, you can now use `e.cancel = true`. And if you were returning a cleanup function you can use `e.onCleanup = () => ...`. It also adds a `num` param to know how many times it's run.
- Breaking: Renamed event `dispatch` to `fire`
- Breaking: Removed deprecated hooking into internal dispatcher
- Breaking: Removed deprecated Bindable components
- Feat: Added a callback parameter to `useObserve`, useful for observing an event and doing something only when it changes
- Feat: Added useMount and useUnmount lifecycle hooks to encourage getting away from useEffect
- Feat: `useObserve` has a second callback parameter which will run after the selector. This can be useful for passing an `observable` or `event` as the first parameter.
- Fix: `reactive` and `observe` components were sometimes not retaining their static properties (like id). They now use a Proxy wrapper instead of an HOC, which reduces component tree depth and avoids any other bugs from wrapping components and forwarding refs.
- Fix: `event` was not working correctly in selectors
- Fix: The two-way binding components are always controlled, even if the `value$` is undefined
- Types: Improved types of `computed` and `useComponent` to accept a Promise

## 0.19.8

- Fix: Reactive components were sometimes not working in React Native https://github.com/LegendApp/legend-state/issues/32

## 0.19.7

- Feat: Added `itemProps` to `For` component to pass extra props to items
- Fix: Setter functions on primitives are auto-bound so you can pass them to event handlers
- Fix: Directly rendering primitive observables was erroring in getNode sometimes

## 0.19.6

- Feat: Observable booleans have a `toggle()` function
- Perf: Observable primities are a simple function instead of a class, reducing code size and should be a bit faster
- Types: Improved typings of For component

## 0.19.5

- Fix: Persisting primitives

## 0.19.4

- Feat: Added `useObservableReducer` hook, which is the same as `useReducer` but it updates an observable rather than triggering a render https://github.com/LegendApp/legend-state/issues/20

## 0.19.3

- Fix: Fast Refresh not disposing `observe()` correctly https://github.com/LegendApp/legend-state/issues/25
- Fix: React hooks error in Show when toggling if it has a children function
- Types: Improved types of For to handle computed observables better
- Types: Improved types of useObservable to support Promises

## 0.19.2

- Feat: `createObservableHook` for converting other hooks that use `useState` to return an observable

## 0.19.1

- Feat: Support two-way binding multiple props, starting with checked$ on input

## 0.19.0

This is a big one, with a breaking change to stop observing all React components automatically. See https://legendapp.com/open-source/state/migrating for more details.

- Breaking: No longer observing all React components automatically. Please use `observer` or `useSelector` for observable tracking.
- Breaking: Primitives no longer have `value` - use the standard `get()` or `set()` instead
- Breaking: Removed `get(false)` in favor of `peek()`
- Deprecated: Bindable components will be phased out in favor of new reactive components. Import `{ legend }` on web or `{ Legend }` on react-native instead of Bindable.
- Feat: Added `observer` HOC component
- Feat: `reactive` components that let you pass an observable or selector to any prop [reactive-props](https://legendapp.com/open-source/state/reactive-props)
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

This is a big one, with mainly a breaking change to how primitives work, so see https://legendapp.com/open-source/state/migrating for more details.

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

See https://legendapp.com/open-source/state/migrating for more details.

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

This is a big one with many breaking (but good) changes, so see https://legendapp.com/open-source/state/migrating for more details. We're making a lot of breaking changes all once so it's not too impactful.

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
