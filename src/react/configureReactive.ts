import { ComponentClass, FC } from 'react';
import { BindKeys } from './reactInterfaces';

export const ReactiveFns = new Map<string, FC | ComponentClass>();
export const ReactiveFnBinders = new Map<string, BindKeys>();

export function configureReactive({
    components,
    binders,
}: {
    components?: Record<string, FC | ComponentClass<any>>;
    binders?: Record<string, BindKeys>;
}) {
    if (components) {
        for (const key in components) {
            ReactiveFns.set(key, components[key]);
        }
    }
    if (binders) {
        for (const key in binders) {
            ReactiveFnBinders.set(key, binders[key]);
        }
    }
}
