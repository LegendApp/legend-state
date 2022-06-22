import { ObsListener } from './ObsProxyInterfaces';
import { state } from './ObsProxyState';

export function disposeListener(listener: ObsListener) {
    if (listener && !listener._disposed) {
        listener._disposed = true;
        const info = state.infos.get(listener.target);
        if (info.listeners) {
            for (let i = 0; i < info.listeners.length; i++) {
                if (info.listeners[i].callback === listener.callback) {
                    info.listeners.splice(i, 1);
                    break;
                }
            }
        }
    }
}
