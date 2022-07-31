import { observable } from './observable';
import type { ObservableEvent } from './observableInterfaces';

export function observableEvent(): ObservableEvent {
    // observableEvent simply wraps around a number observable
    // which increments its value to fire change events
    const obs = observable(0);
    return {
        fire: () => {
            // Notify increments the value so that the observable changes
            obs._.set(obs.current + 1);
        },
        on: obs._.onChange as any,
    };
}
