import { internal } from '@legendapp/state';

export function disableDeprecationWarnings() {
    internal.globalState.noWarnings = true;
}
