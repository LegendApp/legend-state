import { beginBatch, endBatch } from './batching';
import { getNode, isObservable, setNodeValue, symbolDelete, symbolOpaque } from './globals';
import {
    hasOwnProperty,
    isArray,
    isEmpty,
    isFunction,
    isMap,
    isNumber,
    isObject,
    isPlainObject,
    isPrimitive,
    isSet,
} from './is';
import type { Change, GetOptions, ObserveEvent, OpaqueObject, Selector, TypeAtPath } from './observableInterfaces';
import type { ObservableParam } from './observableTypes';

export function computeSelector<T>(
    selector: Selector<T>,
    getOptions?: GetOptions,
    e?: ObserveEvent<T>,
    retainObservable?: boolean,
): T {
    let c = selector as any;
    if (!isObservable(c) && isFunction(c)) {
        c = e ? c(e) : c();
    }

    return isObservable(c) && !retainObservable ? c.get(getOptions) : c;
}

export function getObservableIndex(value$: ObservableParam): number {
    const node = getNode(value$);
    const n = +node.key! as number;
    return isNumber(n) ? n : -1;
}

export function opaqueObject<T extends object>(value: T): OpaqueObject<T> {
    if (process.env.NODE_ENV === 'development') {
        console.warn('[legend-state]: In version 3.0 opaqueObject is moved to ObservableHint.opaque');
    }
    if (value) {
        (value as OpaqueObject<T>)[symbolOpaque] = true;
    }
    return value as OpaqueObject<T>;
}

const getValueAtPathReducer = (o: any, p: any) => o && o[p];
export function getValueAtPath(obj: Record<string, any>, path: string[]): any {
    return path.reduce(getValueAtPathReducer, obj);
}

export function setAtPath<T extends object>(
    obj: T,
    path: string[],
    pathTypes: TypeAtPath[],
    value: any,
    mode?: 'set' | 'merge',
    fullObj?: T,
    restore?: (path: string[], value: any) => void,
    mergeOptions?: DeepMergeOptions,
) {
    let p: string | undefined = undefined;
    let o: Record<string, any> = obj;
    if (path.length > 0) {
        let oFull: Record<string, any> | undefined = fullObj;
        for (let i = 0; i < path.length; i++) {
            p = path[i];
            const map = isMap(o);
            let child = o ? (map ? o.get(p) : o[p]) : undefined;
            const fullChild = oFull ? (map ? oFull.get(p) : oFull[p]) : undefined;
            if (child === symbolDelete) {
                // If this was previously deleted, restore it
                if (oFull) {
                    if (map) {
                        o.set(p, fullChild);
                    } else {
                        o[p] = fullChild;
                    }
                    restore?.(path.slice(0, i + 1), fullChild);
                }
                return obj;
            } else if (child === undefined && value === undefined && i === path.length - 1) {
                // If setting undefined and the key is undefined, no need to initialize or set it
                return obj;
            } else if (i < path.length - 1 && (child === undefined || child === null)) {
                child = initializePathType(pathTypes[i]);
                if (isMap(o)) {
                    o.set(p, child);
                } else {
                    o[p] = child;
                }
            }
            if (i < path.length - 1) {
                o = child;
                if (oFull) {
                    oFull = fullChild;
                }
            }
        }
    }

    // Don't set if the value is the same. This prevents creating a new key
    // when setting undefined on an object without this key
    if (p === undefined) {
        if (mode === 'merge') {
            obj = deepMerge(obj, value, mergeOptions);
        } else {
            obj = value;
        }
    } else {
        if (mode === 'merge') {
            o[p] = deepMerge(o[p], value, mergeOptions);
        } else if (isMap(o)) {
            o.set(p, value);
        } else {
            o[p] = value;
        }
    }

    return obj;
}
/**
 * Merges data into a Legend-State observable with configurable array handling.
 *
 * This function is specifically optimized for observables and provides fine-grained
 * control over how arrays are merged, which is crucial for reactive applications
 * where you want to minimize unnecessary re-renders and maintain performance.
 *
 * **Key Features:**
 * - Optimized for Legend-State observables
 * - Preserves observable structure and reactivity
 * - Configurable array handling to prevent unwanted index-merging
 * - Batched updates for performance
 * - Maintains object/array references when content is identical
 *
 * **Array Handling:**
 * - **No options** (default): Uses legacy index-based merging for backward compatibility
 * - **{ arrayHandling: 'never' }**: Explicit legacy index-based merging (same as default)
 * - **{ arrayHandling: 'shallow' }**: Replace arrays when content differs (fast, recommended)
 * - **{ arrayHandling: 'deep' }**: Replace arrays when content differs (comprehensive)
 *
 * @template T - The observable type
 * @param target - The target observable to merge into
 * @param source - The source data to merge
 * @param mergeOptions - Configuration for merge behavior
 * @returns The target observable (for chaining)
 *
 * @example
 * ```typescript
 * // Basic usage with observables
 * const user$ = observable({ name: 'Alice', tags: ['developer'] });
 * mergeIntoObservable(user$, { tags: ['developer', 'react'] });
 *
 * // Configure array replacement (recommended for most cases)
 * mergeIntoObservable(user$, { tags: ['manager'] }, { arrayHandling: 'shallow' });
 * // Result: tags becomes ['manager'] instead of ['manager', 'react']
 *
 * // For complex nested data
 * const complex$ = observable({ users: [{ id: 1, roles: ['admin'] }] });
 * mergeIntoObservable(complex$, newData, { arrayHandling: 'deep' });
 *
 * // Multiple sources (legacy syntax)
 * mergeIntoObservable(target$, source1, source2, source3);
 * ```
 *
 * @see {@link DeepMergeOptions} for detailed array handling configuration
 */
export function mergeIntoObservable<T extends ObservableParam<any>>(
    target: T,
    source: any,
    mergeOptions?: DeepMergeOptions,
): T;
/**
 * @param target - The target observable to merge into
 * @param sources - Multiple source objects to merge (legacy syntax)
 */
export function mergeIntoObservable<T extends ObservableParam<any>>(target: T, ...sources: any[]): T;
export function mergeIntoObservable<T extends ObservableParam<any>>(target: T, ...args: any[]): T {
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
        if (!isObservable(target)) {
            console.error('[legend-state] should only use mergeIntoObservable with observables');
        }
    }

    // Handle overloads - options can be the last argument
    let sources: any[];
    let mergeOptions: DeepMergeOptions | undefined;

    if (args.length > 0) {
        const lastArg = args[args.length - 1];
        // Check if last argument is options object
        if (
            lastArg &&
            typeof lastArg === 'object' &&
            'arrayHandling' in lastArg &&
            !isArray(lastArg) &&
            !isObservable(lastArg)
        ) {
            mergeOptions = lastArg;
            sources = args.slice(0, -1);
        } else {
            sources = args;
        }
    } else {
        sources = [];
    }

    beginBatch();
    for (let i = 0; i < sources.length; i++) {
        _mergeIntoObservable(target, sources[i], 0, mergeOptions);
    }
    endBatch();
    return target;
}
function _mergeIntoObservable<T extends ObservableParam<Record<string, any>>>(
    target: T,
    source: any,
    levelsDeep: number,
    mergeOptions?: DeepMergeOptions,
): T {
    if (isObservable(source)) {
        source = source.peek();
    }
    const targetValue = target.peek();

    const isTargetArr = isArray(targetValue);
    const isTargetObj = !isTargetArr && isObject(targetValue);

    const isSourceMap = isMap(source);
    const isSourceSet = isSet(source);

    if (isSourceSet && isSet(targetValue)) {
        target.set(new Set([...source, ...targetValue]));
    } else if ((isTargetObj && isObject(source)) || (isTargetArr && (isArray(source) || isObject(source)))) {
        // For array targets with array sources, check if we should replace based on merge options
        if (isTargetArr && isArray(source)) {
            if (!mergeOptions || mergeOptions.arrayHandling === 'never') {
                // Legacy behavior (backward compatibility) - index-based merging
                if (targetValue.length > 0) {
                    const keys: string[] = Object.keys(source);

                    for (let i = 0; i < keys.length; i++) {
                        const key = keys[i];
                        const sourceValue = (source as Record<string, any>)[key];
                        if (sourceValue === symbolDelete) {
                            (target as any)[key].delete();
                        } else {
                            const isObj = isObject(sourceValue);
                            const isArr = !isObj && isArray(sourceValue);
                            const targetChild = (target as Record<string, any>)[key];

                            if ((isObj || isArr) && targetChild) {
                                if (levelsDeep > 0 && isEmpty(sourceValue)) {
                                    targetChild.set(sourceValue);
                                }
                                _mergeIntoObservable(targetChild, sourceValue, levelsDeep + 1, mergeOptions);
                            } else {
                                targetChild.set(sourceValue);
                            }
                        }
                    }
                } else {
                    target.set([...source]);
                }
            } else {
                // New behavior - replace arrays if different
                const useShallow = mergeOptions.arrayHandling === 'shallow';
                const shouldReplace = useShallow
                    ? !arraysEqualShallow(targetValue, source)
                    : !arraysEqualDeep(targetValue, source);

                if (shouldReplace) {
                    target.set([...source]);
                }
                // else keep existing array
            }
        } else if (isTargetArr && isObject(source) && !isArray(source)) {
            // Merging object into array - use original logic
            const keys: string[] = Object.keys(source);

            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                const sourceValue = (source as Record<string, any>)[key];
                if (sourceValue === symbolDelete) {
                    (target as any)[key].delete();
                } else {
                    const isObj = isObject(sourceValue);
                    const isArr = !isObj && isArray(sourceValue);
                    const targetChild = (target as Record<string, any>)[key];

                    if ((isObj || isArr) && targetChild) {
                        if (levelsDeep > 0 && isEmpty(sourceValue)) {
                            targetChild.set(sourceValue);
                        }
                        _mergeIntoObservable(targetChild, sourceValue, levelsDeep + 1, mergeOptions);
                    } else {
                        targetChild.set(sourceValue);
                    }
                }
            }
        } else if (isTargetObj && isObject(source)) {
            // Handle object merging
            const keys: string[] = isSourceMap || isSourceSet ? Array.from(source.keys()) : Object.keys(source);

            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                const sourceValue = isSourceSet
                    ? key
                    : isSourceMap
                      ? (source as Map<any, any>).get(key)
                      : (source as Record<string, any>)[key];
                if (sourceValue === symbolDelete) {
                    (target as any)[key].delete();
                } else {
                    const isObj = isObject(sourceValue);
                    const isArr = !isObj && isArray(sourceValue);
                    const targetChild = (target as Record<string, any>)[key];

                    if ((isObj || isArr) && targetChild) {
                        if (levelsDeep > 0 && isEmpty(sourceValue)) {
                            targetChild.set(sourceValue);
                        }
                        _mergeIntoObservable(targetChild, sourceValue, levelsDeep + 1, mergeOptions);
                    } else {
                        targetChild.set(sourceValue);
                    }
                }
            }
        }
    } else if (source !== undefined) {
        target.set(source);
    }

    return target;
}
export function constructObjectWithPath(path: string[], pathTypes: TypeAtPath[], value: any): object {
    let out;
    if (path.length > 0) {
        let o: Record<string, any> = (out = {});
        for (let i = 0; i < path.length; i++) {
            const p = path[i];
            o[p] = i === path.length - 1 ? value : initializePathType(pathTypes[i]);
            o = o[p];
        }
    } else {
        out = value;
    }

    return out;
}
export function deconstructObjectWithPath(path: string[], pathTypes: TypeAtPath[], value: any): object {
    let o = value;
    for (let i = 0; i < path.length; i++) {
        const p = path[i];
        o = o ? o[p] : initializePathType(pathTypes[i]);
    }

    return o;
}
export function isObservableValueReady(value: any) {
    return !!value && ((!isObject(value) && !isArray(value)) || !isEmpty(value));
}

export function setSilently(value$: ObservableParam, newValue: any) {
    const node = getNode(value$);
    return setNodeValue(node, newValue).newValue;
}

export function initializePathType(pathType: TypeAtPath): any {
    switch (pathType) {
        case 'array':
            return [];
        case 'map':
            return new Map();
        case 'set':
            return new Set();
        case 'object':
        default:
            return {};
    }
}
export function applyChange<T extends object>(
    value: T,
    change: Change,
    applyPrevious?: boolean,
    mergeOptions?: DeepMergeOptions,
): T {
    const { path, valueAtPath, prevAtPath, pathTypes } = change;
    return setAtPath(
        value,
        path as string[],
        pathTypes,
        applyPrevious ? prevAtPath : valueAtPath,
        'set',
        undefined,
        undefined,
        mergeOptions,
    );
}
export function applyChanges<T extends object>(
    value: T,
    changes: Change[],
    applyPrevious?: boolean,
    mergeOptions?: DeepMergeOptions,
): T {
    for (let i = 0; i < changes.length; i++) {
        value = applyChange(value, changes[i], applyPrevious, mergeOptions);
    }
    return value;
}

/**
 * Configuration options for deepMerge and mergeIntoObservable functions
 *
 * @example
 * ```typescript
 * // Configure array handling for deepMerge
 * deepMerge(target, source, { arrayHandling: 'shallow' });
 *
 * // Configure for mergeIntoObservable
 * mergeIntoObservable(observable$, data, { arrayHandling: 'deep' });
 *
 * // Configure globally for sync operations
 * configureObservableSync({
 *   deepMerge: { arrayHandling: 'shallow' }
 * });
 *
 * // Configure per sync operation
 * syncedQuery({
 *   queryClient,
 *   query: { queryKey: ['users'], queryFn: fetchUsers },
 *   deepMerge: { arrayHandling: 'shallow' }
 * });
 * ```
 */
export interface DeepMergeOptions {
    /**
     * How to handle array merging when combining data structures.
     *
     * Array handling significantly affects merge behavior:
     *
     * **'never' (Default for Backward Compatibility)**
     * - Uses index-based merging behavior (merges arrays by position)
     * - Preserves existing behavior for current users
     * - Best for: Existing code that depends on index merging
     *
     * **'shallow' (Recommended for New Code)**
     * - Compares array elements using === (shallow comparison)
     * - Replaces arrays only when content actually differs
     * - Preserves array references when content is identical (performance optimization)
     * - Best for: Most use cases, especially with primitive arrays or simple objects
     *
     * **'deep'**
     * - Recursively compares array elements and nested objects/arrays
     * - More comprehensive comparison but slower for large arrays
     * - Preserves array references when deep content is identical
     * - Best for: Complex nested data structures where deep equality matters
     *
     * @example
     * ```typescript
     * // Index-based merging (default for backward compatibility)
     * deepMerge({items: [1, 2, 3]}, {items: [4, 5]});
     * // Result: {items: [4, 5, 3]} - index merging
     *
     * // Shallow comparison (recommended for new code)
     * deepMerge({items: [1, 2, 3]}, {items: [1, 2, 3]}, { arrayHandling: 'shallow' });
     * // Result: Keeps original array reference (no change)
     *
     * deepMerge({items: [1, 2, 3]}, {items: [4, 5]}, { arrayHandling: 'shallow' });
     * // Result: {items: [4, 5]} - complete replacement
     *
     * // Deep comparison
     * const complex = {data: [{id: 1, items: [1, 2]}]};
     * deepMerge(complex, {data: [{id: 1, items: [1, 2]}]}, { arrayHandling: 'deep' });
     * // Result: Keeps original array reference (deep equality)
     * ```
     *
     * @default 'never'
     */
    arrayHandling?: 'shallow' | 'deep' | 'never';
}

function arraysEqualShallow(a: any[], b: any[]): boolean {
    return a.length === b.length && a.every((val, i) => val === b[i]);
}

function arraysEqualDeep(a: any[], b: any[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        const aVal = a[i];
        const bVal = b[i];
        if (isPrimitive(aVal) && isPrimitive(bVal)) {
            if (aVal !== bVal) return false;
        } else if (isArray(aVal) && isArray(bVal)) {
            if (!arraysEqualDeep(aVal, bVal)) return false;
        } else if (isPlainObject(aVal) && isPlainObject(bVal)) {
            // For objects, do a shallow comparison of keys and values
            const aKeys = Object.keys(aVal);
            const bKeys = Object.keys(bVal);
            if (aKeys.length !== bKeys.length) return false;
            for (const key of aKeys) {
                if (!hasOwnProperty.call(bVal, key) || aVal[key] !== bVal[key]) {
                    return false;
                }
            }
        } else if (aVal !== bVal) {
            return false;
        }
    }
    return true;
}

/**
 * Deeply merges objects and arrays with configurable array handling behavior.
 *
 * Unlike simple object spreading or Object.assign, deepMerge recursively merges nested
 * objects while providing control over how arrays are handled during the merge process.
 *
 * **Array Handling Behavior:**
 * - **'never'** (default): Legacy index-based merging (for backward compatibility)
 * - **'shallow'** (recommended): Replace arrays when content differs (===)
 * - **'deep'**: Replace arrays when content differs (recursive comparison)
 *
 * **Performance Features:**
 * - Preserves object/array references when content is identical
 * - Optimized for reactive systems like Legend-State observables
 * - Avoids unnecessary allocations and re-renders
 *
 * @template T - The type of the target object
 * @param target - The target object to merge into
 * @param options - Configuration options for merge behavior
 * @returns A new merged object of type T
 *
 * @example
 * ```typescript
 * // Basic object merging
 * const user = { name: 'Alice', settings: { theme: 'dark' } };
 * const updates = { settings: { notifications: true } };
 * const result = deepMerge(user, updates);
 * // Result: { name: 'Alice', settings: { theme: 'dark', notifications: true } }
 *
 * // Array replacement (default behavior)
 * const data = { items: [1, 2, 3] };
 * const newData = { items: [4, 5] };
 * const merged = deepMerge(data, newData);
 * // Result: { items: [4, 5] } - complete array replacement
 *
 * // Configure array handling
 * const merged = deepMerge(data, newData, { arrayHandling: 'shallow' });
 *
 * // Multiple sources
 * const result = deepMerge(base, update1, update2, { arrayHandling: 'deep' });
 * ```
 */
export function deepMerge<T>(target: T, options?: DeepMergeOptions): T;
/**
 * @param target - The target object to merge into
 * @param source1 - First source object to merge
 * @param options - Configuration options for merge behavior
 */
export function deepMerge<T>(target: T, source1: any, options?: DeepMergeOptions): T;
/**
 * @param target - The target object to merge into
 * @param source1 - First source object to merge
 * @param source2 - Second source object to merge
 * @param options - Configuration options for merge behavior
 */
export function deepMerge<T>(target: T, source1: any, source2: any, options?: DeepMergeOptions): T;
/**
 * @param target - The target object to merge into
 * @param source1 - First source object to merge
 * @param source2 - Second source object to merge
 * @param source3 - Third source object to merge
 * @param options - Configuration options for merge behavior
 */
export function deepMerge<T>(target: T, source1: any, source2: any, source3: any, options?: DeepMergeOptions): T;
export function deepMerge<T>(target: T, ...args: any[]): T {
    // Handle overloads - options can be the last argument
    let sources: any[];
    let options: DeepMergeOptions = { arrayHandling: 'never' };

    if (args.length > 0) {
        const lastArg = args[args.length - 1];
        // Check if last argument is options object (including undefined which means no options)
        if (
            lastArg === undefined ||
            (lastArg &&
                typeof lastArg === 'object' &&
                'arrayHandling' in lastArg &&
                !isArray(lastArg) &&
                !isObservable(lastArg))
        ) {
            // If it's undefined, keep default options; if it's a valid options object, merge it
            if (lastArg !== undefined) {
                options = { ...options, ...lastArg };
            }
            sources = args.slice(0, -1);
        } else {
            sources = args;
        }
    } else {
        sources = [];
    }

    return _deepMerge(target, sources, options);
}

function _deepMerge<T>(target: T, sources: any[], options: DeepMergeOptions): T {
    if (isPrimitive(target)) {
        return sources[sources.length - 1];
    }

    let result: T = (isArray(target) ? [...target] : { ...target }) as T;

    for (let i = 0; i < sources.length; i++) {
        const obj2 = sources[i];

        // Handle direct array to array merging
        if (isArray(result) && isArray(obj2)) {
            if (options.arrayHandling === 'never') {
                // Legacy behavior: merge by index
                const targetArray = result as any[];
                for (let j = 0; j < obj2.length; j++) {
                    if (
                        obj2[j] instanceof Object &&
                        !isObservable(obj2[j]) &&
                        Object.keys(obj2[j]).length > 0 &&
                        targetArray[j]
                    ) {
                        targetArray[j] = _deepMerge(targetArray[j], [obj2[j]], options);
                    } else {
                        targetArray[j] = obj2[j];
                    }
                }
            } else {
                // New behavior: replace arrays if different
                const shouldReplace =
                    options.arrayHandling === 'shallow'
                        ? !arraysEqualShallow(result as any[], obj2)
                        : !arraysEqualDeep(result as any[], obj2);

                if (shouldReplace) {
                    result = [...obj2] as T;
                }
            }
        } else if (isPlainObject(obj2) || isArray(obj2)) {
            const objTarget = obj2 as Record<string, any>;
            for (const key in objTarget) {
                if (hasOwnProperty.call(objTarget, key)) {
                    const sourceValue = objTarget[key];
                    const targetValue = (result as any)[key];

                    // Handle array merging based on options
                    if (isArray(sourceValue)) {
                        if (options.arrayHandling === 'never') {
                            // Legacy behavior: merge by index if target is array, or merge array into object
                            if (isArray(targetValue) && targetValue.length > 0) {
                                (result as any)[key] = _deepMerge(targetValue, [sourceValue], options);
                            } else if (isObject(targetValue) && !isArray(targetValue)) {
                                // Merge array into object - convert array to object-like structure
                                (result as any)[key] = _deepMerge(targetValue, [sourceValue], options);
                            } else {
                                (result as any)[key] = [...sourceValue];
                            }
                        } else {
                            // New behavior: replace arrays, but only if different
                            const shouldReplace =
                                !isArray(targetValue) ||
                                (options.arrayHandling === 'shallow'
                                    ? !arraysEqualShallow(targetValue, sourceValue)
                                    : !arraysEqualDeep(targetValue, sourceValue));

                            if (shouldReplace) {
                                (result as any)[key] = [...sourceValue];
                            }
                            // else keep existing array reference
                        }
                    }
                    // Handle object merging
                    else if (
                        sourceValue instanceof Object &&
                        !isObservable(sourceValue) &&
                        Object.keys(sourceValue).length > 0 &&
                        !isArray(targetValue) // Don't merge into arrays
                    ) {
                        (result as any)[key] = _deepMerge(targetValue || {}, [sourceValue], options);
                    } else {
                        (result as any)[key] = sourceValue;
                    }
                }
            }
        } else {
            result = obj2;
        }
    }

    return result;
}
