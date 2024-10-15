// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { IReactive, FCReactiveObject } from '@legendapp/state/react';

declare module '@legendapp/state/react' {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface IReactive extends FCReactiveObject<JSX.IntrinsicElements> {}
}
