import { ObsListener } from './ObservableInterfaces';
import { state } from './ObservableState';

export function disposeListener(listener: ObsListener) {
    if (listener) {
        const info = state.infos.get(listener.target);
        if (info.listeners) {
            info.listeners.delete(listener.callback);
        }
    }
}
