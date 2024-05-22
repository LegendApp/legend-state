import { type ObservablePrimitive, internal, observable } from '@legendapp/state';

type UndoRedoOptions = {
    limit?: number;
};

/**
 * Usage:
 *
 * Use this function to add undo/redo functionality to an observable.
 *
 * You can monitor how many undos or redos are available to enable/disable undo/redo
 * UI elements with undo$ and redo$.
 *
 * If you undo and then make a change, it'll delete any redos and add the change, as expected.
 *
 * If you don't pass in a limit, it will keep all history. This means it can grow indefinitely.
 *
 * ```typescript
 * const obs$ = observable({ test: 'hi', test2: 'a' });
 * const { undo, redo, undos$, redos$, getHistory } = undoRedo(obs$, { limit: 40 });
 * obs$.test.set('hello');
 * undo();
 * redo();
 * // observables for # of undos/redos available
 * undos$.get();
 * redos$.get();
 * ```
 */
export function undoRedo<T>(obs$: ObservablePrimitive<T>, options?: UndoRedoOptions) {
    let history = [] as T[];
    let historyPointer = 0;
    let restoringFromHistory = false;

    const undos$ = observable(0);
    const redos$ = observable(0);

    function updateUndoRedo() {
        undos$.set(historyPointer);
        redos$.set(history.length - historyPointer - 1);
    }

    obs$.onChange(({ getPrevious }) => {
        // Don't save history if we're restoring from history.
        if (restoringFromHistory) return;

        // Don't save history if this is a remote change.
        // History will be saved remotely by the client making the local change.
        if (internal.globalState.isLoadingRemote || internal.globalState.isLoadingLocal) return;

        // if the history array is empty, grab the previous value as the initial value
        if (!history.length) {
            const previous = getPrevious();
            if (previous) history.push(internal.clone(previous));
            historyPointer = 0;
        }

        // We're just going to store a copy of the whole object every time it changes.
        const snapshot = internal.clone(obs$.get());

        if (options?.limit) {
            // limit means the number of undos
            history = history.slice(Math.max(0, history.length - options.limit));
        } else {
            history = history.slice(0, historyPointer + 1);
        }

        // we add another history item, which is limit + 1 -- but it's the current one
        history.push(snapshot);

        // We're going to keep a pointer to the current history state.
        // This way, we can undo to many previous states, and redo.
        historyPointer = history.length - 1;

        updateUndoRedo();
    });

    return {
        undo() {
            if (historyPointer > 0) {
                historyPointer--;

                const snapshot = internal.clone(history[historyPointer]);
                restoringFromHistory = true;
                obs$.set(snapshot);
                restoringFromHistory = false;
            } else {
                console.warn('Already at the beginning of undo history');
            }

            updateUndoRedo();
        },
        redo() {
            if (historyPointer < history.length - 1) {
                historyPointer++;

                const snapshot = internal.clone(history[historyPointer]);
                restoringFromHistory = true;
                obs$.set(snapshot);
                restoringFromHistory = false;
            } else {
                console.warn('Already at the end of undo history');
            }

            updateUndoRedo();
        },
        undos$: undos$,
        redos$: redos$,
        getHistory: () => history,
    };
}
