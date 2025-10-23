# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

### Testing
- `npm test` or `jest` - Run Jest test suite  
- `bun test` or `npm run buntest` - Run Bun tests with 50ms timeout
- `npm run buntestsilent` - Run Bun tests silently (used in CI/build)

### Building and Development
- `npm run build` - Full build pipeline (lint, format check, test, build with tsup, run post-build)
- `npm run typecheck` - TypeScript type checking without emitting files
- `bunx tsup` - Build using tsup bundler to generate dist files
- `bun run posttsup.ts` - Post-build script that runs after tsup

### Code Quality
- `npm run lint:check` - Check ESLint rules without fixing
- `npm run lint:write` - Run ESLint and auto-fix issues
- `npm run format:check` - Check Prettier formatting without fixing
- `npm run format:write` - Format code with Prettier

### Bundle Size Analysis
- `npm run checksize` - Check gzipped bundle sizes for core, react, and sync packages
- `npm run checksize:core` - Check core bundle size only
- `npm run checksize:react` - Check React bindings bundle size only
- `npm run checksize:sync` - Check sync package bundle size only

## Architecture Overview

Legend-State is a state management library with a modular architecture built around observables and fine-grained reactivity. The codebase follows a plugin-based design for persistence and synchronization.

### Core Modules

**Observable System** (`src/observable.ts`, `src/ObservableObject.ts`, `src/ObservablePrimitive.ts`):
- Central proxy-based observable implementation with automatic tracking
- Supports both object and primitive observables
- Fine-grained reactivity through proxy-based change detection

**React Integration** (`react.ts`, `src/react/`):
- React hooks (`useObservable`, `useObserve`, `useSelector`) for component integration
- React components (`Memo`, `Computed`, `For`, `Show`, `Switch`) for declarative rendering
- Fine-grained reactivity to minimize component re-renders

**Sync System** (`sync.ts`, `src/sync/`):
- Local-first architecture with optimistic updates and conflict resolution
- Plugin-based sync providers in `src/sync-plugins/` (Firebase, Supabase, Keel, TanStack Query, fetch)
- Automatic retry mechanisms and offline support

**Persistence** (`src/persist-plugins/`):
- Storage adapters for browser (localStorage, IndexedDB) and React Native (AsyncStorage, MMKV)
- Automatic serialization/deserialization with configurable transformations

### Entry Points and Module Structure

- `index.ts` - Core observable functionality and utilities
- `react.ts` - React hooks and components  
- `sync.ts` - Synchronization and persistence APIs
- `persist.ts` - Persistence configuration and plugins
- `trace.ts` - Development debugging and tracing utilities

The library uses a complex export system defined in `package.json` (`lsexports`) that creates multiple entry points for tree-shaking optimization.

### Key Patterns

**Proxy-based Observables**: The core uses ES6 Proxies to create transparent observable wrappers that automatically track access and mutations.

**Plugin Architecture**: Sync and persistence functionality is implemented through a plugin system, allowing for extensible backends without core changes.

**Fine-grained Reactivity**: React components can subscribe to specific observable paths, enabling precise updates without full component re-renders.

**Local-first**: The sync system applies changes locally first, then syncs to remote, with automatic conflict resolution and retry mechanisms.