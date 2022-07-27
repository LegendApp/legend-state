# Legend-State

Legend-State is a proxy-based observable library designed to be both:

1. 🦄 As easy as possible to use
2. ⚡️ Super performant and scalable

The core is platform agnostic so you can use it in vanilla JS or any framework to create and listen to observables. It includes hooks for React and React Native, and has plugins for automatically persisting to storage.

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

Full documentation is still in progress, but will be at [the website](https://www.legendapp.com/dev/state/) shortly.

## Todo

-   [] Remote persistence to Firebase
-   [] Conflict resolution for remote persistence
-   [] useSyncExternalStore for React 18

## 👩‍⚖️ License

[MIT](LICENSE)

---

Legend-State is created and maintained by [Jay Meistrich](https://github.com/jmeistrich) with [Legend](https://www.legendapp.com) and [Bravely](https://www.bravely.io).

<p>
    <a href="https://www.legendapp.com"><img src="https://www.legendapp.com/img/LogoTextOnWhite.png" height="56" alt="Legend" /></a>
    <span>&nbsp;&nbsp;&nbsp;&nbsp;</span>
    <a href="https://www.bravely.io"><img src="https://www.legendapp.com/img/bravely-logo.png" height="56" alt="Bravely" /></a>
</p>
