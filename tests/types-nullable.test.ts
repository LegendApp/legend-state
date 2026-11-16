import { expectTypeOf } from 'expect-type';
import { useObservable } from '../src/react/useObservable';

// These functions are typechecked without calling Hooks outside a component.
function nullableInitializers() {
    const number$ = useObservable((): number | null => 1);
    const null$ = useObservable((): null => null);
    const record$ = useObservable((): Record<string, string> | null => ({}));
    const undefined$ = useObservable((): number | undefined => undefined);
    const explicit$ = useObservable<number | null>(() => null);
    const async$ = useObservable(async (): Promise<number | null> => null);
    const object$ = useObservable(() => ({ count: 1, doubled: () => 2 }));
    const nestedFunction$ = useObservable(() => () => 1);
    nestedFunction$.set(2);
    expectTypeOf<number>().toMatchTypeOf<ReturnType<typeof nestedFunction$.get>>();
    expectTypeOf(number$.get()).toEqualTypeOf<number | null>();
    expectTypeOf(null$.get()).toEqualTypeOf<null>();
    expectTypeOf(record$.get()).toEqualTypeOf<Record<string, string> | null>();
    expectTypeOf(undefined$.get()).toEqualTypeOf<number | undefined>();
    expectTypeOf(explicit$.get()).toEqualTypeOf<number | null>();
    expectTypeOf(async$.get()).toEqualTypeOf<number | null>();
    expectTypeOf(object$.count.get()).toEqualTypeOf<number>();
    expectTypeOf(object$.doubled.get()).toEqualTypeOf<2>();
}

function lookupInitializers() {
    const lookup$ = useObservable((key: string): number | null => key.length);
    expectTypeOf(lookup$.get()).toMatchTypeOf<Record<string, number | null>>();
    expectTypeOf(lookup$.item.get()).toEqualTypeOf<number | null>();
}

function existingOverloads() {
    const empty$ = useObservable<number>();
    const value$ = useObservable<number | null>(null, []);
    expectTypeOf(empty$.get()).toEqualTypeOf<number | undefined>();
    expectTypeOf(value$.get()).toEqualTypeOf<number | null>();
    // @ts-expect-error Keep untyped callback parameters from silently acquiring any.
    useObservable((key) => key.length);
}

// Keep the functions referenced while leaving Hook execution to React tests.
it('declares nullable initializer and lookup type checks', () => {
    expect(nullableInitializers).toBeInstanceOf(Function);
    expect(lookupInitializers).toBeInstanceOf(Function);
    expect(existingOverloads).toBeInstanceOf(Function);
});
