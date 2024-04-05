import { ObservableParam, constructObjectWithPath, internal, mergeIntoObservable, observable } from '@legendapp/state';

// This type is purely for documentation.
type TimestampAsString = string;

export function trackHistory<T>(
    obs: ObservableParam<T>,
    targetObservable?: ObservableParam<Record<TimestampAsString, Partial<T>>>,
): ObservableParam<Record<TimestampAsString, any>> {
    const history = targetObservable ?? observable<Record<TimestampAsString, Partial<T>>>();

    obs.onChange(({ changes }) => {
        // Don't save history if this is a remote change.
        // History will be saved remotely by the client making the local change.
        if (!internal.globalState.isLoadingRemote && !internal.globalState.isLoadingLocal) {
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
