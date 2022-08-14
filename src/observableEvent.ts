import { observable } from './observable';
import type { ObservableEvent } from './observableInterfaces';

export function observableEvent(): ObservableEvent {
    // observableEvent simply wraps around a number observable
    // which increments its value to dispatch change events
    const obs = observable(0);
    return {
        dispatch: () => {
            // Notify increments the value so that the observable changes
            obs.set(obs.current + 1);
        },
        on: obs.onChange as any,
        observe: obs.observe,
    };
}
