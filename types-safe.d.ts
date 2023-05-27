import '@legendapp/state';
import type { ObservableSafe } from '@legendapp/state';
declare module '@legendapp/state' {
    export function observable<T>(value?: T | Promise<T>): ObservableSafe<T>;
}
