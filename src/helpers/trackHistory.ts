import { ObservableParam, constructObjectWithPath, mergeIntoObservable, observable } from '@legendapp/state';

// This type is purely for documentation.
type TimestampAsString = string;

export function trackHistory<T>(
    value$: ObservableParam<T>,
    targetObservable?: ObservableParam<Record<TimestampAsString, Partial<T>>>,
): ObservableParam<Record<TimestampAsString, any>> {
    const history = targetObservable ?? observable<Record<TimestampAsString, Partial<T>>>();

    value$.onChange(({ isFromPersist, isFromSync, changes }) => {
        // Don't save history if this is a remote change.
        // History will be saved remotely by the client making the local change.
        if (!isFromPersist && !isFromSync) {
            const time: TimestampAsString = Date.now().toString();

            // Save to history observable by date, with the previous value
            for (let i = 0; i < changes.length; i++) {
                const { path, prevAtPath, pathTypes } = changes[i];

                const obj = constructObjectWithPath(path, pathTypes, prevAtPath);
                mergeIntoObservable((history as any)[time], obj);
            }
        }
    });

    return history as any;
}
