import type { FC, LegacyRef, ReactNode } from 'react';
import type { Selector } from '../observableInterfaces';

export type ShapeWithNew$<T> = Partial<Omit<T, 'children'>> & {
    [K in keyof T as K extends `$${string & K}` ? K : `$${string & K}`]?: Selector<T[K]>;
} & { children?: Selector<ReactNode> };

export type BindKeys<P = any> = Record<keyof P, { handler: keyof P; getValue: (e: any) => any; defaultValue?: any }>;

export type FCReactiveObject<T> = {
    [K in keyof T]: FC<ShapeWithNew$<T[K]>>;
};

export type FCReactive<P, P2> = P &
    FC<
        ShapeWithNew$<P2> & {
            ref?: LegacyRef<P> | undefined;
        }
    >;

export interface UseSelectorOptions {
    suspense?: boolean;
}
