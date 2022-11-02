# Legend-State

Legend-State is a super fast and powerful state manager for JavaScript apps with two primary goals:

### 1. <span className="text-xl">🦄</span> As easy as possible to use

There is no boilerplate and there are no actions, reducers, selectors, dispatchers, sagas, thunks, or epics. Observables are just normal objects that you can listen to for changes.

```jsx
// Create an observable object
const state = observable({ settings: { theme: 'dark' } })

// Just get and set
state.settings.theme.get() === 'dark'
state.settings.theme.set('light')

// observe re-runs when accessed observables change
observe(() => {
    console.log(state.settings.theme.get())
})

// Observer components automatically track observables and re-render when they change
const Component = observer(function Component() => {
    const theme = state.settings.theme.get()

    return <div>Theme: {theme}</div>
})
```

### 2. <span className="text-xl">⚡️</span> The fastest React state library

Legend-State beats every other state library on just about every metric and is so optimized for arrays that it even beats vanilla JS on the swap benchmark. At only `3kb` and with the massive reduction in boilerplate code, you'll have big savings in file size too.

<p>
    <img src="https://www.legendapp.com/img/dev/state/times.png" />
</p>

See [the documentation](https://www.legendapp.com/open-source/state) for more details.

## Install

`npm install @legendapp/state` or `yarn add @legendapp/state`

## Example

```jsx
import { observable } from "@legendapp/state"
import { observer } from "@legendapp/state/react";

// Create an observable object
const state = observable({ settings: { theme: 'dark' } })

// get() returns the raw data
state.settings.theme.get() === 'dark'

// observe re-runs when any observables change
observe(() => {
    console.log(state.settings.theme.get())
})

// Assign to state with set
state.settings.theme.set('light')

// Automatically persist state. Refresh this page to try it.
persistObservable(state, { local: 'exampleState' })

// Components re-render only when accessed observables change
// This is the code for the example on your right ----->
const Component = observer(function Component() {
    const theme = state.settings.theme.get()
    // state.settings.theme is automatically tracked for changes

    const toggle = () => {
        state.settings.theme.set(theme =>
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
})
```

## Highlights

- ✨ Super easy to use - observables are normal objects
- ✨ No boilerplate
- ✨ Safe from 🔫 footguns
- ✨ Designed for maximum performance and scalability
- ✨ React components re-render only on changes
- ✨ Very strongly typed with TypeScript
- ✨ Persistence plugins for automatically saving/loading from storage
- ✨ State can be global or within components

[Read more](https://www.legendapp.com/open-source/state/why/) about why Legend-State might be right for you.

## Documentation

See [the documentation site](https://www.legendapp.com/open-source/state/).

## Todo

- [ ] Remote persistence to Firebase
- [ ] Conflict resolution for remote persistence

## 👩‍⚖️ License

[MIT](LICENSE)

---

Legend-State is created and maintained by [Jay Meistrich](https://github.com/jmeistrich) with [Legend](https://www.legendapp.com) and [Bravely](https://www.bravely.io).

<p>
    <a href="https://www.legendapp.com"><img src="https://www.legendapp.com/img/LogoTextOnWhite.png" height="56" alt="Legend" /></a>
    <span>&nbsp;&nbsp;&nbsp;&nbsp;</span>
    <a href="https://www.bravely.io"><img src="https://www.legendapp.com/img/bravely-logo.png" height="56" alt="Bravely" /></a>
</p>
