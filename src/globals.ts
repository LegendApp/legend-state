import { isArray, isChildNode, isDate, isFunction, isMap, isObject, isSet, isTemporal } from './is';
import type { NodeInfo, ObservableEvent, TypeAtPath, UpdateFn } from './observableInterfaces';
import type { Observable, ObservableParam } from './observableTypes';

type GlobalState = {
    isLoadingLocal: boolean;
    isLoadingRemote: boolean;
    activateSyncedNode: (node: NodeInfo, newValue: any) => { update: UpdateFn; value: any };
    pendingNodes: Map<NodeInfo, () => void>;
    dirtyNodes: Set<NodeInfo>;
    replacer: ((this: any, key: string, value: any) => any) | undefined;
    reviver: ((this: any, key: string, value: any) => any) | undefined;
    // TODO(3.0-stable): remove with the ISO date string warning
    warnOnDateStrings?: boolean;
};

export const symbolToPrimitive = Symbol.toPrimitive;
export const symbolIterator = Symbol.iterator;
export const symbolGetNode = Symbol('getNode');
export const symbolDelete = /* @__PURE__ */ Symbol('delete');
export const symbolOpaque = Symbol('opaque');
export const symbolPlain = Symbol('plain');
export const optimized = Symbol('optimized');
export const symbolLinked = Symbol('linked');

export const globalState: GlobalState = {
    pendingNodes: new Map<NodeInfo, () => void>(),
    dirtyNodes: new Set<NodeInfo>(),
} as GlobalState;

export function isHintOpaque(value: any) {
    // React elements have $$typeof and should be treated as opaque
    return value && (value[symbolOpaque] || value['$$typeof']);
}
export function isHintPlain(value: any) {
    return value && value[symbolPlain];
}

export function getPathType(value: any): TypeAtPath {
    return isArray(value) ? 'array' : isMap(value) ? 'map' : value instanceof Set ? 'set' : 'object';
}

function replacer(this: any, key: string, value: any) {
    if (typeof value === 'string' || value === null) {
        // Date.toJSON already ran (an ISO string ending in Z, or null if invalid), so tag the original Date
        if ((value === null || value.charCodeAt(value.length - 1) === 90) && isDate(this[key])) {
            return { __LSType: 'Date', value };
        }
    } else if (isMap(value)) {
        return {
            __LSType: 'Map',
            value: Array.from(value.entries()), // or with spread: value: [...value]
        };
    } else if (value instanceof Set) {
        return {
            __LSType: 'Set',
            value: Array.from(value), // or with spread: value: [...value]
        };
    }
    if (globalState.replacer) {
        value = globalState.replacer(key, value);
    }
    return value;
}

const ISO8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
function reviver(key: string, value: any) {
    if (value) {
        if (typeof value === 'object') {
            if (value.__LSType === 'Map') {
                return new Map(value.value);
            } else if (value.__LSType === 'Set') {
                return new Set(value.value);
            } else if (value.__LSType === 'Date') {
                return new Date(value.value ?? NaN);
            }
        }
        if (globalState.reviver) {
            value = globalState.reviver(key, value);
        }
    }
    return value;
}
function legacyReviver(key: string, value: any) {
    return typeof value === 'string' && ISO8601.test(value) ? new Date(value) : reviver(key, value);
}

// TODO(3.0-stable): remove this warning about ISO strings no longer being revived to Dates
// Defined only in development and test so production bundles drop it, and read from a variable
// because process.env is slow in Node
let warnUnrevivedDates: ((value: any, path: string, field?: string) => void) | undefined;
if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    // Warn once per field name so that keyed rows don't warn once each
    const warnedDateFields = new Set<string>();
    warnUnrevivedDates = (value, path, field = '') => {
        if (typeof value === 'string') {
            if (ISO8601.test(value) && !warnedDateFields.has(field)) {
                warnedDateFields.add(field);
                console.warn(
                    `[legend-state] The ISO date string at "${path}" is kept as a string. Legend-State no longer converts ISO strings to Dates; use transformStringifyDates or a transform to opt in. Silence with configureLegendState({ warnOnDateStrings: false }).`,
                );
            }
        } else if (value && typeof value === 'object') {
            for (const key in value) warnUnrevivedDates!(value[key], path ? path + '.' + key : key, key);
        }
    };
}

export function safeStringify(value: any) {
    return value ? JSON.stringify(value, replacer) : value;
}
/**
 * Parse JSON from safeStringify. Tagged Map/Set/Date values are revived exactly and strings stay strings.
 * legacyDates revives ISO date strings to Dates, for data saved before Dates were tagged.
 */
export function safeParse(value: any, legacyDates?: boolean) {
    if (!value) return value;
    const parsed = JSON.parse(value, legacyDates ? legacyReviver : reviver);
    if (warnUnrevivedDates && !legacyDates && globalState.warnOnDateStrings !== false && /"\d{4}-\d{2}-\d{2}T/.test(value)) {
        warnUnrevivedDates(parsed, '');
    }
    return parsed;
}
// Copies like a safeStringify/safeParse round trip, without JSON: values without a JSON form are
// dropped (null in arrays) and Dates, Maps and Sets are copied as their own types.
function hasNoJSON(value: any) {
    return value === undefined || typeof value === 'function' || typeof value === 'symbol';
}
// An array, Map or Set entry, which JSON turns into null if it has no JSON form
function cloneEntry(value: any) {
    const v = cloneValue(value);
    return hasNoJSON(v) ? null : v;
}
function cloneValue(value: any): any {
    if (typeof value !== 'object') {
        return typeof value === 'number' ? (isFinite(value) ? value : null) : value;
    }
    if (value === null) return null;
    if (isArray(value)) {
        const out = new Array(value.length);
        for (let i = 0; i < value.length; i++) out[i] = cloneEntry(value[i]);
        return out;
    }
    if (value instanceof Date) return new Date(value.getTime());
    if (value instanceof Map) {
        const out = new Map();
        value.forEach((v, k) => out.set(cloneEntry(k), cloneEntry(v)));
        return out;
    }
    if (value instanceof Set) {
        const out = new Set();
        value.forEach((v) => out.add(cloneEntry(v)));
        return out;
    }
    const toJSON = value.toJSON;
    if (typeof toJSON === 'function') return cloneValue(toJSON.call(value));
    const out: Record<string, any> = {};
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const v = cloneValue(value[key]);
        if (!hasNoJSON(v)) {
            if (key === '__proto__') {
                Object.defineProperty(out, key, { value: v, enumerable: true, writable: true, configurable: true });
            } else {
                out[key] = v;
            }
        }
    }
    return out;
}
export function clone<T>(value: T) {
    if (!value) return value;
    // Custom replacers and revivers need the JSON round trip
    if (globalState.replacer || globalState.reviver) return safeParse(safeStringify(value));
    const cloned = cloneValue(value);
    if (hasNoJSON(cloned)) return undefined;
    if (warnUnrevivedDates && globalState.warnOnDateStrings !== false) {
        warnUnrevivedDates(cloned, '');
    }
    return cloned;
}

export function isObservable(value$: any): value$ is Observable {
    return !!value$ && !!value$[symbolGetNode as any];
}

export function getNode(value$: ObservableParam): NodeInfo {
    return value$ && (value$ as any)[symbolGetNode];
}

export function isEvent(value$: any): value$ is ObservableEvent {
    return value$ && (value$[symbolGetNode as any] as NodeInfo)?.isEvent;
}

function setNewValue(parentValue: any, key: string, newValue: any, useSetFn: boolean, useMapFn: boolean): any {
    if (useSetFn) {
        parentValue.add(newValue);
    } else if (useMapFn) {
        parentValue.set(key, newValue);
    } else if (key === '__proto__' && !Object.prototype.hasOwnProperty.call(parentValue, key)) {
        Object.defineProperty(parentValue, key, {
            value: newValue,
            enumerable: true,
            configurable: true,
            writable: true,
        });
    } else {
        parentValue[key] = newValue;
    }
    return newValue;
}

export function setNodeValue(node: NodeInfo, newValue: any) {
    const parentNode = node.parent ?? node;
    const key = node.parent ? node.key : '_';

    const isDelete = newValue === symbolDelete;
    if (isDelete) newValue = undefined;

    // Get the value of the parent
    const parentValue = node.parent ? ensureNodeValue(parentNode) : parentNode.root;

    const useSetFn = isSet(parentValue);
    const useMapFn = isMap(parentValue);
    const parentHadKey =
        useSetFn || useMapFn ? parentValue.has(key) : Object.prototype.hasOwnProperty.call(parentValue, key);

    // Save the previous value first
    const prevValue = useSetFn
        ? key
        : useMapFn
          ? parentValue.get(key)
          : key === '__proto__' && !parentHadKey
            ? undefined
            : parentValue[key];

    const isFunc = isFunction(newValue);

    // Compute newValue if newValue is a function or an observable
    newValue = !parentNode.isAssigning && isFunc && !isFunction(prevValue) ? newValue(prevValue) : newValue;

    if (newValue !== prevValue || (isDelete ? parentHadKey : !parentHadKey)) {
        try {
            parentNode.isSetting = (parentNode.isSetting || 0) + 1;

            // Save the new value
            if (isDelete) {
                if (useMapFn || useSetFn) {
                    parentValue.delete(key);
                } else {
                    delete parentValue[key];
                }
            } else {
                setNewValue(parentValue, key, newValue, useSetFn, useMapFn);
            }
        } finally {
            parentNode.isSetting!--;
        }
    }

    const parentHasKey =
        useSetFn || useMapFn ? parentValue.has(key) : Object.prototype.hasOwnProperty.call(parentValue, key);

    return { prevValue, newValue, parentValue, parentHadKey, parentHasKey };
}

const arrNodeKeys: string[] = [];
export function getNodeValue(node: NodeInfo): any {
    let count = 0;
    let n: NodeInfo = node;
    while (isChildNode(n)) {
        arrNodeKeys[count++] = n.key;
        n = n.parent;
    }
    let child = node.root._;
    for (let i = count - 1; i >= 0; i--) {
        if (child === null || child === undefined) return undefined;
        const key = arrNodeKeys[i] as any;
        child = isMap(child) ? child.get(key) : child[key];
    }
    return child;
}

export function getChildNode(node: NodeInfo, key: string, asFunction?: Function): NodeInfo {
    // Get the child by key
    let child = node.children?.get(key);

    // Create the child node if it doesn't already exist
    if (!child) {
        // Same fields in the same order as root nodes in createObservable, so V8 gives them one shape
        child = {
            root: node.root,
            parent: node,
            key,
            proxy: undefined,
            lazy: true,
            numListenersRecursive: 0,
        };
        // Lookup functions are bound with the child key
        if (node.lazyFn?.length === 1) {
            asFunction = node.lazyFn.bind(node, key);
        }
        if (isFunction(asFunction)) {
            child = Object.assign(() => {}, child);
            child.lazyFn = asFunction;
        }
        if (!node.children) {
            node.children = new Map();
        }
        node.children.set(key, child);
    }

    return child;
}

export function ensureNodeValue(node: NodeInfo) {
    let value = getNodeValue(node);
    if (!value || isFunction(value)) {
        if (isChildNode(node)) {
            const parent = ensureNodeValue(node.parent);
            const useSetFn = isSet(parent);
            const useMapFn = isMap(parent);
            value = setNewValue(parent, node.key, {}, useSetFn, useMapFn);
        } else {
            value = node.root._ = {};
        }
    }
    return value;
}

export function findIDKey(obj: unknown | undefined, node: NodeInfo): string | ((value: any) => string) | undefined {
    let idKey: string | ((value: any) => string) | undefined = isObservable(obj)
        ? undefined
        : isObject(obj)
          ? 'id' in obj
              ? 'id'
              : 'key' in obj
                ? 'key'
                : '_id' in obj
                  ? '_id'
                  : '__id' in obj
                    ? '__id'
                    : undefined
          : undefined;

    if (!idKey && node.parent) {
        const k = node.key + '_keyExtractor';
        const keyExtractor =
            (node.functions?.get(k) as (value: any) => string) ??
            (getNodeValue(node.parent)[node.key + '_keyExtractor'] as (value: any) => string);
        if (keyExtractor && isFunction(keyExtractor)) {
            idKey = keyExtractor;
        }
    }

    return idKey;
}

export function extractFunction(node: NodeInfo, key: string, fnOrComputed: Function): void;
export function extractFunction(node: NodeInfo, key: string, fnOrComputed: Observable): void;
export function extractFunction(node: NodeInfo, key: string, fnOrComputed: Function | Observable): void {
    if (!node.functions) {
        node.functions = new Map();
    }

    node.functions.set(key, fnOrComputed);
}
export function equals(a: unknown, b: unknown) {
    return (
        a === b || (isDate(a) && isDate(b) && +a === +b) || (isTemporal(a) && isTemporal(b) && String(a) === String(b))
    );
}
export function getKeys(
    obj: Record<any, any> | Array<any> | undefined,
    isArr: boolean,
    isMap: boolean,
    isSet: boolean,
): string[] {
    return isArr
        ? (undefined as any)
        : obj
          ? isSet
              ? Array.from(obj as Set<any>)
              : isMap
                ? Array.from(obj.keys())
                : Object.keys(obj)
          : [];
}
