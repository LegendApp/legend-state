import type { FC, LegacyRef, ReactNode } from 'react';
import type { Observable, Selector } from '../observableInterfaces';

export type ShapeWithNew$<T> = Partial<Omit<T, 'children'>> & {
    [K in keyof T as K extends `$${string & K}` ? K : `$${string & K}`]?: Selector<T[K]>;
} & { children?: Selector<ReactNode> };

export interface BindKey<P> {
    handler?: keyof P;
    getValue?: (e: any) => any;
    defaultValue?: any;
    selector?: (propsOut: Record<string, any>, p: Observable<any>) => any;
}

export type BindKeys<P = any> = Record<keyof P, BindKey<P>>;

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
    skipCheck?: boolean;
}
