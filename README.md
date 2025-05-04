# Legend-State

Legend-State is a super fast all-in-one state and sync library that lets you write less code to make faster apps. Legend-State has four primary goals:

### 1. 🦄 As easy as possible to use

There is no boilerplate and there are no contexts, actions, reducers, dispatchers, sagas, thunks, or epics. It doesn't modify your data at all, and you can just call `get()` to get the raw data and `set()` to change it.

In React components you can call `use()` on any observable to get the raw data and automatically re-render whenever it changes.

```jsx
import { observable, observe } from "@legendapp/state"
import { observer } from "@legendapp/state/react"

const settings$ = observable({ theme: 'dark' })

// get returns the raw data
settings$.theme.get() // 'dark'
// set sets
settings$.theme.set('light')

// Computed observables with just a function
const isDark$ = observable(() => settings$.theme.get() === 'dark')

// observing contexts re-run when tracked observables change
observe(() => {
  console.log(settings$.theme.get())
})

const Component = observer(function Component() {
    const theme = state$.settings.theme.get()

    return <div>Theme: {theme}</div>
})
```

### 2. ⚡️ The fastest React state library

Legend-State beats every other state library on just about every metric and is so optimized for arrays that it even beats vanilla JS on the "swap" and "replace all rows" benchmarks. At only `4kb` and with the massive reduction in boilerplate code, you'll have big savings in file size too.

<p>
    <img src="https://www.legendapp.com/img/dev/state/times.png" />
</p>

See [Fast 🔥](https://www.legendapp.com/open-source/state/v3/intro/fast/) for more details of why Legend-State is so fast.

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

### 4. 💾 Powerful sync and persistence

Legend-State includes a powerful [sync and persistence system](../../usage/persist-sync). It easily enables local-first apps by optimistically applying all changes locally first, retrying changes even after restart until they eventually sync, and syncing minimal diffs. We use Legend-State as the sync systems in [Legend](https://legendapp.com) and [Bravely](https://bravely.io), so it is by necessity very full featured while being simple to set up.

Local persistence plugins for the browser and React Native are included, with sync plugins for [Keel](https://www.keel.so), [Supabase](https://www.supabase.com), [TanStack Query](https://tanstack.com/query), and `fetch`.

```js
const state$ = observable({
    users: syncedKeel({
        list: queries.getUsers,
        create: mutations.createUsers,
        update: mutations.updateUsers,
        delete: mutations.deleteUsers,
        persist: { name: 'users', retrySync: true },
        debounceSet: 500,
        retry: {
            infinite: true,
        },
        changesSince: 'last-sync',
    }),
    // direct link to my user within the users observable
    me: () => state$.users['myuid']
})

observe(() => {
    // get() activates through to state$.users and starts syncing.
    // it updates itself and re-runs observers when name changes
    const name = me$.name.get()
})

// Setting a value goes through to state$.users and saves update to server
me$.name.set('Annyong')
```

## Install

`bun add @legendapp/state` or `npm install @legendapp/state` or `yarn add @legendapp/state`

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

[Read more](https://www.legendapp.com/open-source/state/v3/intro/why/) about why Legend-State might be right for you.

## Documentation

See [the documentation site](https://www.legendapp.com/open-source/state/).

## Community

Join us on [Discord](https://discord.gg/5CBaNtADNX) to get involved with the Legend community.

## 👩‍⚖️ License

[MIT](LICENSE)

---

Legend-State is created and maintained by [Jay Meistrich](https://github.com/jmeistrich) with [Legend](https://www.legendapp.com) and [Bravely](https://www.bravely.io).

<p>
    <a href="https://www.legendapp.com"><img src="https://www.legendapp.com/img/LogoTextOnWhite.png" height="56" alt="Legend" /></a>
    <span>&nbsp;&nbsp;&nbsp;&nbsp;</span>
    <a href="https://www.bravely.io"><img src="https://www.legendapp.com/img/bravely-logo.png" height="56" alt="Bravely" /></a>
</p>
