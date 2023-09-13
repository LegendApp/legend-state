import { ListenerParams, ObservableReadable, TrackingType } from '@legendapp/state';

export function promiseTimeout(time?: number) {
    return new Promise((resolve) => setTimeout(resolve, time || 0));
}

export function expectChangeHandler<T>(obs: ObservableReadable<T>, track?: TrackingType) {
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

    obs.onChange(handler, { trackingType: track });

    return ret;
}
