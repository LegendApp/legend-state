import { ObsListener } from './observableInterfaces';
import { state } from './observableState';

export function disposeListener(listener: ObsListener) {
    if (listener) {
        const info = state.infos.get(listener.target);
        if (info.listeners) {
            info.listeners.delete(listener);
        }
    }
}
