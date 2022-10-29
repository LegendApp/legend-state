import {
    mergeIntoObservable,
    observable,
    ObservableReadable,
    ObservableWriteable,
    symbolDateModified,
    tracking,
} from '@legendapp/state';

function constructObject(path: (string | number)[], value: any): object {
    let out;
    if (path.length > 0) {
        let o = (out = {});
        for (let i = 0; i < path.length; i++) {
            const p = path[i];
            o[p] = i === path.length - 1 ? value : {};
            o = o[p];
        }
    } else {
        out = value;
    }

    return out;
}

// This type is purely for documentation.
type TimestampAsString = string;

export function trackHistory<T>(
    obs: ObservableReadable<T>,
    targetObservable?: ObservableWriteable<Record<TimestampAsString, Partial<T>>>
) {
    const history = targetObservable ?? observable<Record<TimestampAsString, Partial<T>>>();

    obs.onChange((_, __, changes) => {
        // Don't save history if this is a remote change.
        // History will be saved remotely by the client making the local change.
        if (!tracking.inRemoteChange) {
            const time: TimestampAsString = Date.now().toString();

            // Save to history observable by date, with the previous value
            for (let i = 0; i < changes.length; i++) {
                const { path, prevAtPath } = changes[i];
                if (path[path.length - 1] === (symbolDateModified as any)) continue;

                const obj = constructObject(path, prevAtPath);
                mergeIntoObservable(history[time], obj);
            }
        }
    });

    return history;
}
