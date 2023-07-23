import {
    constructObjectWithPath,
    mergeIntoObservable,
    observable,
    ObservableReadable,
    ObservableWriteable,
    tracking,
} from '@legendapp/state';

// This type is purely for documentation.
type TimestampAsString = string;

export function trackHistory<T>(
    obs: ObservableReadable<T>,
    targetObservable?: ObservableWriteable<Record<TimestampAsString, Partial<T>>>,
) {
    const history = targetObservable ?? observable<Record<TimestampAsString, Partial<T>>>();

    obs.onChange(({ changes }) => {
        // Don't save history if this is a remote change.
        // History will be saved remotely by the client making the local change.
        if (!tracking.inRemoteChange) {
            const time: TimestampAsString = Date.now().toString();

            // Save to history observable by date, with the previous value
            for (let i = 0; i < changes.length; i++) {
                const { path, prevAtPath, pathTypes } = changes[i];

                const obj = constructObjectWithPath(path, prevAtPath, pathTypes);
                mergeIntoObservable((history as any)[time], obj);
            }
        }
    });

    return history;
}
