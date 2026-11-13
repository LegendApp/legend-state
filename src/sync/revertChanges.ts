import { applyChanges, Change, internal, ObservableParam } from '@legendapp/state';
import { onChangeRemote } from './syncObservable';

const { clone } = internal;

export function createRevertChanges(obs$: ObservableParam<any>, changes: Change[]) {
    return () => {
        const previous = applyChanges(clone(obs$.peek()), changes, /*applyPrevious*/ true);
        onChangeRemote(() => {
            obs$.set(previous);
        });
    };
}
