# Legend-State

Legend-State is a super fast and powerful state library for JavaScript apps with four primary goals:

### 1. <span className="text-lg">🦄</span> As easy as possible to use

There is no boilerplate and there are no contexts, actions, reducers, dispatchers, sagas, thunks, or epics. It doesn't modify your data at all, and you can just call `get()` to get the raw data and `set()` to change it.

In React components you can call `use()` on any observable to get the raw data and automatically re-render whenever it changes.

```jsx
// Create an observable object
const state$ = observable({ settings: { theme: 'dark' } })

// Just get and set
const theme = state$.settings.theme.get();
state$.settings.theme.set('light')

// observe re-runs when accessed observables change
observe(() => {
    console.log(state$.settings.theme.get())
})

const Component = function Component() {
    // use() makes this component re-render whenever it changes
    const theme = state$.settings.theme.use()

    return <div>Theme: {theme}</div>
}
```

### 2. <span className="text-xl">⚡️</span> The fastest React state library

Legend-State beats every other state library on just about every metric and is so optimized for arrays that it even beats vanilla JS on the "swap" and "replace all rows" benchmarks. At only `4kb` and with the massive reduction in boilerplate code, you'll have big savings in file size too.

<p>
    <img src="https://www.legendapp.com/img/dev/state/times.png" />
</p>

See [the documentation](https://www.legendapp.com/open-source/state/fast) for more details.

### 3. 🔥 Fine-grained reactivity for minimal renders

Legend-State lets you make your renders super fine-grained, so your apps will be much faster because React has to do less work. The best way to be fast is to render less, less often.

```jsx
function FineGrained() {
    const count$ = useObservable(0)

    useInterval(() => {
        count$.set(v => v + 1)
    }, 600)

    // The text updates itself so the component doesn't re-render
    return (
        <div>
            Count: <Memo>{count$}</Memo>
        </div>
    )
}
```

### 4. 💾 Powerful persistence

Legend-State includes a powerful persistence plugin system for local caching and remote sync. It easily enables offline-first apps by tracking changes made while offline that save when coming online, managing conflict resolution, and syncing only small diffs. We use Legend-State as the sync systems in [Legend](https://legendapp.com) and [Bravely](https://bravely.io), so it is by necessity very full featured while being simple to set up.

Local persistence plugins for the browser and React Native are included, and a remote sync plugin for Firebase will be ready soon.

```js
import { ObservablePersistLocalStorage } from '@legendapp/state/persist-plugins/local-storage'
import { persistObservable } from '@legendapp/state/persist'

const state$ = observable({ store: { bigObject: { ... } } })

// Persist this observable
persistObservable(state$, {
    persistLocal: ObservablePersistLocalStorage,
    local: 'store' // Unique name
})
```

## Install

`npm install @legendapp/state` or `yarn add @legendapp/state`

## Example

```jsx
import { observable, observe } from "@legendapp/state"
import { persistObservable } from "@legendapp/state/persist"

// Create an observable object
const state$ = observable({ settings: { theme: 'dark' } })

// get() returns the raw data
state$.settings.theme.get() === 'dark'

// observe re-runs when any observables change
observe(() => {
    console.log(state$.settings.theme.get())
})

// Assign to state$ with set
state$.settings.theme.set('light')

// Automatically persist state$. Refresh this page to try it.
persistObservable(state$, { local: 'exampleState' })

// Components re-render only when accessed observables change
// This is the code for the example on your right ----->
function Component() {
    const theme = state$.settings.theme.use()
    // state$.settings.theme is automatically tracked for changes

    const toggle = () => {
        state$.settings.theme.set(theme =>
            theme === 'dark' ? 'light' : 'dark'
        )
    }

    return (
        <div
            className={theme === 'dark' ? 'theme-dark' : 'theme-light'}
        >
            <div>Theme: {theme}</div>
            <Button onClick={toggle}>
                Toggle theme
            </Button>
        </div>
    )
}
```

## Highlights

- ✨ Super easy to use 😌
- ✨ Super fast ⚡️
- ✨ Super small at 4kb 🐥
- ✨ Fine-grained reactivity 🔥
- ✨ No boilerplate
- ✨ Designed for maximum performance and scalability
- ✨ React components re-render only on changes
- ✨ Very strongly typed with TypeScript
- ✨ Persistence plugins for automatically saving/loading from storage
- ✨ State can be global or within components

[Read more](https://www.legendapp.com/open-source/state/why/) about why Legend-State might be right for you.

## Documentation

See [the documentation site](https://www.legendapp.com/open-source/state/).

## Community

Join us on [Slack](https://join.slack.com/t/legendappcommunity/shared_invite/zt-1mfjknpna-vUL2s1qOuNeZL12~t2RruQ) to get involved with the Legend community.

## 👩‍⚖️ License

[MIT](LICENSE)

---

Legend-State is created and maintained by [Jay Meistrich](https://github.com/jmeistrich) with [Legend](https://www.legendapp.com) and [Bravely](https://www.bravely.io).

<p>
    <a href="https://www.legendapp.com"><img src="https://www.legendapp.com/img/LogoTextOnWhite.png" height="56" alt="Legend" /></a>
    <span>&nbsp;&nbsp;&nbsp;&nbsp;</span>
    <a href="https://www.bravely.io"><img src="https://www.legendapp.com/img/bravely-logo.png" height="56" alt="Bravely" /></a>
</p>
