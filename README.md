# Legend-State

Legend-State is a super fast and powerful state manager for JavaScript apps with two primary goals:

### 1. <span className="text-xl">🦄</span> As easy as possible to use

There is no boilerplate and there are no actions, reducers, selectors, dispatchers, sagas, thunks, or epics. Observables are just normal objects that you can listen to for changes.

```jsx
// Create an observable object
const state = observable({ settings: { theme: 'dark' } })

// Observables work like any other object
state.settings.theme === 'dark' // true

// Listen anywhere for changes
state.settings.theme.onChange((theme) => { ... })

// A simple React hook that re-renders when state changes
const theme = useObservables(() => state.settings.theme)
```

### 2. <span className="text-xl">⚡️</span> The fastest React state library

Legend-State beats every other state library on just about every metric and is so optimized for arrays that it even beats vanilla JS on the swap benchmark. At only `3kb` and with the massive reduction in boilerplate code, you'll have big savings in file size too.

<p>
    <img src="https://www.legendapp.com/img/dev/state/times.png" />
</p>

See [the documentation](https://www.legendapp.com/dev/state) for more details.

## Install

`npm install @legendapp/state` or `yarn add @legendapp/state`

## Example

```jsx
// Create an observable object
const state = observable({ settings: { theme: 'dark' } })

// Observables work like any other object
state.settings.theme === 'dark'  // true
Object.keys(state.settings)      // ['theme']

// Listen anywhere for changes
state.settings.theme.on('change', (theme) => { ... })

// You can only modify the state safely
state.settings = 'Bug'            // ❌ Error to prevent 🔫 footguns
state.settings.theme.set('light') // ✅ Set safely

// Automatically persist state
persistObservable(state, { local: 'exampleState' })

// Components re-render only when specified observables change
function Component() {
    const [ theme ] = useObservables(() => [ state.settings.theme ])
    const toggle = () => {
        state.settings.theme.set(theme === 'dark' ? 'light' : 'dark')
    }
    return (
        <div>
            <div>Theme: {theme}</div>
            <Button onClick={toggle}>
                Toggle theme
            </Button>
        </div>
    )
}
```

## Highlights

-   ✨ Super easy to use - observables are normal objects
-   ✨ No boilerplate
-   ✨ Safe from 🔫 footguns
-   ✨ Designed for maximum performance and scalability
-   ✨ React components re-render only on changes
-   ✨ Very strongly typed with TypeScript
-   ✨ Persistence plugins for automatically saving/loading from storage
-   ✨ State can be global or within components

[Read more](https://www.legendapp.com/dev/state/why/) about why Legend-State might be right for you.

## Documentation

See [the documentation site](https://www.legendapp.com/dev/state/).

## Todo

- [ ] Remote persistence to Firebase
- [ ] Conflict resolution for remote persistence
- [ ] useSyncExternalStore for React 18

## 👩‍⚖️ License

[MIT](LICENSE)

---

Legend-State is created and maintained by [Jay Meistrich](https://github.com/jmeistrich) with [Legend](https://www.legendapp.com) and [Bravely](https://www.bravely.io).

<p>
    <a href="https://www.legendapp.com"><img src="https://www.legendapp.com/img/LogoTextOnWhite.png" height="56" alt="Legend" /></a>
    <span>&nbsp;&nbsp;&nbsp;&nbsp;</span>
    <a href="https://www.bravely.io"><img src="https://www.legendapp.com/img/bravely-logo.png" height="56" alt="Bravely" /></a>
</p>
