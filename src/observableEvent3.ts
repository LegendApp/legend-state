import { observable3 } from './observable3';
import type { ObservableEvent3 } from './observableInterfaces';

export function observableEvent3(): ObservableEvent3 {
    // observableEvent simply wraps around a number observable which increments its value
    // to fire change events
    const obs = observable3({ current: 0 });
    return {
        fire: () => {
            // Notify increments the value so that the observable changes
            obs._.set('current', obs.current + 1);
        },
        on: obs._.onChange as any,
    };
}
