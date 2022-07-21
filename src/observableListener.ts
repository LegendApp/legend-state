import { ObservableListener } from './types/observableInterfaces';
import { state } from './observableState';

export function disposeListener(listener: ObservableListener) {
    if (listener) {
        const info = state.infos.get(listener.target);
        if (info.listeners) {
            info.listeners.delete(listener);
        }
    }
}
