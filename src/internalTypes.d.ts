import type { ObserveOptions as Options } from './observe';

declare module './observe' {
    export interface ObserveOptions extends Options {
        fromComputed?: boolean;
    }
}
