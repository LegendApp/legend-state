import { ListenerParams, ObservableReadable } from '@legendapp/state';

export function promiseTimeout(time?: number) {
    return new Promise((resolve) => setTimeout(resolve, time || 0));
}

export function expectChangeHandler<T>(obs: ObservableReadable<T>, shallow?: boolean) {
    const ret = jest.fn();

    function handler({ value, getPrevious, changes }: ListenerParams<T>) {
        const prev = getPrevious();

        changes.forEach((change) => {
            if (!change.keysAdded) {
                delete change.keysAdded;
            }
        });

        ret(value, prev, changes);
    }

    obs.onChange(handler, { shallow });

    return ret;
}
