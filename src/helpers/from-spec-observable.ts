import { observable } from '@legendapp/state';

interface SpecObserver<T = unknown, E = unknown> {
    next: (value: T) => void;
    error: (error: E) => void;
    complete: () => void;
}

interface SpecSubscription {
    unsubscribe(): void;
    closed?: boolean;
}

interface SpecObservable<T> {
    subscribe: (observer: SpecObserver<T, any>) => SpecSubscription;
}

export function fromSpecObservable<T = unknown>(specObservable: SpecObservable<T>, initialValue?: T) {
    const obs = observable<T>(initialValue);
    const { unsubscribe } = specObservable.subscribe({
        next: (value) => {
            // I don't think this is the correct way to do this...
            // I think this might need to be a call to `mergeIntoObservable`,
            // but I will ask Mr. Meistrich
            obs.set((_: T) => value);
        },
        error: (error) => {
            // I'm not sure what to do with the error...
            // Maybe set it as the current value?
        },
        complete: () => {
            // Not sure what to do here either...
            // Maybe just call unsubscribe
            unsubscribe();
        },
    });

    return obs;
}
