import { observable3 } from './observable3';
import type { Observable2, ObservableEvent3, ObservableListener3 } from './observableInterfaces';

function eventNotifier(obs: Observable2<{ current: number }>) {
    // Notify increments the value so that the observable changes
    obs._.set('current', obs.current + 1);
}

export function observableEvent3(): ObservableEvent3 {
    // observableEvent simply wraps around a number observable which increments its value
    // to fire change events
    const obs = observable3({ current: 0 });
    return {
        fire: eventNotifier.bind(obs, obs),
        on: obs._.onChange as any,
    };
}
