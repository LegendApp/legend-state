import type { GetOptions, Observable, Selector } from '@legendapp/state';
import type { FC, LegacyRef, ReactNode } from 'react';

export type KeysOfUnion<T> = T extends T ? keyof T : never;
type ValueOfUnionKey<P, K extends PropertyKey> = P extends any ? (K extends keyof P ? P[K] : never) : never;

export type ShapeWithNew$<T> = Partial<Omit<T, 'children'>> & {
    [K in keyof T as K extends `$${string & K}` ? K : `$${string & K}`]?: Selector<T[K]>;
} & { children?: Selector<ReactNode> };

export interface BindKey<P, K extends KeysOfUnion<P> = KeysOfUnion<P>> {
    handler?: K;
    getValue?: ValueOfUnionKey<P, K> extends infer T
        ? T extends (...args: any) => any
            ? (params: Parameters<T>[0]) => any
            : (e: any) => any
        : (e: any) => any;
    defaultValue?: any;
    // selector runs inside reactive prop tracking and must not call React hooks.
    selector?: (propsOut: Record<string, any>, p: Observable<any>) => any;
}

export type BindKeys<P = any, K extends KeysOfUnion<P> = KeysOfUnion<P>> = Partial<Record<K, BindKey<P, K>>>;

export type FCReactiveObject<T> = {
    [K in keyof T]: FC<ShapeWithNew$<T[K]>>;
};

export type FCReactive<P, P2> = P &
    FC<
        ShapeWithNew$<P2> & {
            ref?: LegacyRef<P> | undefined;
        }
    >;

export interface UseSelectorOptions extends GetOptions {
    suspense?: boolean;
    skipCheck?: boolean;
}
