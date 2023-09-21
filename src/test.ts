import { get } from 'firebase/database';
import { isPrimitive } from './is';
import { Assign, Diff, Intersection, Primitive } from 'utility-types';

type Children<T, TRoot> = {
    [K in keyof T]: NodeValue<T[K], TRoot>;
};

type NodeValue<T, TRoot> = {
    proxy?: Observable<T>; // the proxy
    children: Partial<Children<T, TRoot>>; //Map<keyof T, NodeValue<T[keyof T], TRoot>>; // typed children
} & (
    | {
          path: (keyof any)[];
          root: NodeValue<TRoot, TRoot> & { value: TRoot };
      }
    | {
          path?: undefined;
          root?: undefined;
          value: T;
      }
);

type ObservableObjectFns<T> = {
    get: () => T;
} & {
    [K in keyof T]: ObservableObjectFns<T[K & keyof T]>;
};

type RemoveIndex<T> = {
    [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K];
};

type ObservableObjectAccessor<T> = {
    [K in keyof T]-?: ObservableObjectAccessor<T[K]>;
};

type Observable<T> = ObservableObjectFns<T> & ObservableObjectAccessor<T>;

function getProxy<T>(node: NodeValue<T, T>) {
    return createProxy(node) as ObservableObjectAccessor<MagicMerge<T>> & ObservableObjectFns<MagicMerge<T>>;
}

function getChildProxy<T, K extends keyof T, TRoot>(node: NodeValue<T, TRoot>, p: K) {
    // Get the child node if p prop
    const childNode = getChildNode(node, p);

    // Create a proxy if not already cached and return it
    return childNode.proxy || (childNode.proxy = createProxy(childNode));
}

function createProxy<T, TRoot>(node: NodeValue<T, TRoot>): Observable<T> {
    return new Proxy(node, proxyHandler()) as unknown as Observable<T>;
}

function proxyHandler<T, TRoot>(): ProxyHandler<NodeValue<T, TRoot>> {
    return {
        // proxy never get called with a number key, but keyof T could be a number, so we need to annotate that its both a keyof T AND a string | symbol
        get(
            target: NodeValue<T, TRoot>,
            p: keyof Observable<T> & (string | symbol),
        ): ObservableObjectFns<T>[keyof ObservableObjectFns<T>] | ObservableObjectAccessor<T[keyof T]> {
            if (p === 'get') {
                return () => getNodeValue(target);
            }

            return getChildProxy(target, p);
        },
    };
}

function getChildNode<T, K extends keyof T, TRoot>(node: NodeValue<T, TRoot>, key: K) {
    // Get the child by key
    const child = node.children[key];
    if (child) return child;

    // Create the child node if it doesn't already exist
    const newChild = {
        proxy: undefined,
        children: {},
        path: [...(node.path ?? []), key],
        root: node.root ?? (node as any),
    };
    node.children[key] = newChild;

    return newChild;
}

function getNodeValue<T, TRoot>(node: NodeValue<T, TRoot>) {
    if (node.path) {
        let value: any = node.root.value;
        for (const key of node.path) {
            value = value[key];
        }
        return value as T;
    }
    return node.value;
}

const testState = getProxy({
    children: {},
    value: {
        a: 1,
        b: {
            c: 2,
        },
    },
});

console.log(testState.a.get());
console.log(testState.b.get());
console.log(testState.b.c.get());

const testState2 = getProxy<{ a: 1; b: 3; d?: { a: number } } | undefined>({} as any);

testState2.get();
// testState2.d?.a
testState2.b.get();
testState2.d.a.get();

// type UnionToIntersection<U> = (U extends any ? (k: Partial<U>) => void : never) extends (k: infer I) => void
//     ? I
//     : never;

type MagicMerge<T> = SuperMagicMerge<Exclude<T, Primitive>>;
type SuperMagicMerge<T> = DeepAssignSpread<UnionToArray<T>>;

type Test3 = MagicMerge<
    { a: 1; b: 3; arr: [{ a: string; b: string }] } | { arr: [{ c: string }]; c: string; d: { a: 1; b: 4 } | boolean }
>;
type Arrr = Simplify<Test3['arr'][number]>;

type Simplify<T> = { [K in keyof T]: T[K] } & {};
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;
type UnionToOvlds<U> = UnionToIntersection<U extends any ? (f: U) => void : never>;
type PopUnion<U> = UnionToOvlds<U> extends (a: infer A) => void ? A : never;
type IsUnion<T> = [T] extends [UnionToIntersection<T>] ? false : true;

type UnionToArray<T, A extends unknown[] = []> = IsUnion<T> extends true
    ? UnionToArray<Exclude<T, PopUnion<T>>, [PopUnion<T>, ...A]>
    : [T, ...A];

type ComplexUnion =
    | { a: number; b: number }
    | { b: string }
    | boolean
    | { lets: { nested: string; c: number } | boolean }
    | {
          deeplyNested: {
              a: number;
              b: {
                  c: {
                      d?: {
                          e: {
                              foo: string;
                          };
                      };
                  };
              };
          };
      };

const test = getProxy<ComplexUnion>({} as any);
const test12 = getProxy<{
    a: number;
}>({} as any);

type MergeConflict<T> = IsUnion<MagicMerge<{ a: 12; b: 12 } | { a: 12; c: 12 | { d: string } }>>;

test.get(); // ComplexObject
test.b.get(); // string | number
test.lets.get(); // { nested: string; c: number } | boolean      <- notice that this is a union
test.lets.nested.get(); // string                                <- we can access this path event though the parent is a union
test.deeplyNested.b.c.d.e.get(); // { d?: { e: { foo: string; }; }; } | undefined

export type DeepAssign<T extends object, U extends object, I = Diff<T, U> & Intersection<U, T> & Diff<U, T>> = {
    [K in keyof I]: K extends keyof T
        ? K extends keyof U
            ? T[K] extends object
                ? U[K] extends object
                    ? DeepAssign<T[K], U[K]>
                    : I[K]
                : I[K]
            : I[K]
        : I[K];
};

type DeepAssignSpread<T extends readonly [...any]> = T extends [infer L, ...infer R]
    ? DeepAssign<L & object, DeepAssignSpread<R> & object> | DeepAssign<DeepAssignSpread<R> & object, L & object>
    : unknown;

type AssignSpread<T extends readonly [...any]> = T extends [infer L, ...infer R]
    ? Assign<L & object, AssignSpread<R> & object> | Assign<AssignSpread<R> & object, L & object>
    : unknown;
