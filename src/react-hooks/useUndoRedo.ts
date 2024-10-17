import { useEffect } from 'react'
import { useObservable } from '@legendapp/state/react'
import { internal, type ObservablePrimitive } from '@legendapp/state'

type UndoRedoOptions = {
	limit?: number
}

export function useUndoRedo<T>(
	obs$: ObservablePrimitive<T>,
	options?: UndoRedoOptions
) {
	const history$ = useObservable<T[]>([])
	const historyPointer$ = useObservable(0)
	const restoringFromHistory$ = useObservable(false)
	const undos$ = useObservable(0)
	const redos$ = useObservable(0)

	function updateUndoRedo() {
		const historyPointer = historyPointer$.peek()
		const history = history$.peek()

		undos$.set(historyPointer)
		redos$.set(history.length - historyPointer - 1)
	}

	useEffect(() => {
		const dispose = obs$.onChange(({ getPrevious }) => {
			if (restoringFromHistory$.peek()) return

			if (
				internal.globalState.isLoadingRemote ||
				internal.globalState.isLoadingLocal
			)
				return

			if (!history$.peek().length) {
				const previous = getPrevious()

				if (previous) {
					history$.push(internal.clone(previous))
				}
				historyPointer$.set(0)
			}

			const snapshot = internal.clone(obs$.get())

			if (options?.limit) {
				const current = history$
					.peek()
					.slice(Math.max(0, history$.peek().length - options.limit))
				history$.set(current as any)
			} else {
				const current = history$.peek().slice(0, historyPointer$.get() + 1)
				history$.set(current as any)
			}

			history$.push(snapshot)
			historyPointer$.set(history$.peek().length - 1)
			updateUndoRedo()
		})

		return () => {
			dispose()
		}
	}, [])

	return {
		undo() {
			if (historyPointer$.peek() > 0) {
				historyPointer$.set((prev) => prev - 1)

				const snapshot = internal.clone(history$.peek()[historyPointer$.peek()])
				restoringFromHistory$.set(true)
				obs$.set(snapshot)
				restoringFromHistory$.set(false)
			} else {
				console.warn('Already at the beginning of undo history')
			}
			updateUndoRedo()
		},
		redo() {
			if (historyPointer$.peek() < history$.peek().length - 1) {
				historyPointer$.set((prev) => prev + 1)
				const snapshot = internal.clone(history$.peek()[historyPointer$.peek()])
				restoringFromHistory$.set(true)
				obs$.set(snapshot)
				restoringFromHistory$.set(false)
			} else {
				console.warn('Already at the end of undo history')
			}
			updateUndoRedo()
		},
		undos$,
		redos$,
		history$
	}
}
