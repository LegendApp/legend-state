import { expectTypeOf } from 'expect-type';
import { observable } from '../src/observable';
import { PromiseInfo } from '../src/nodeValueTypes';
import { Computed, Observable } from 'src/observableTypes';

describe('Types', () => {
    describe('observable', () => {
        it('optional object return type when no argument is passed', () => {
            function noArgsObjectType() {
                return observable<{ foo: number }>();
            }

            type ObservableFn = ReturnType<typeof noArgsObjectType>;
            expectTypeOf<ObservableFn['get']>().returns.toEqualTypeOf<{ foo: number } | undefined>();
        });

        it('optional return type when no argument is passed', () => {
            function noArgs() {
                return observable<string>();
            }

            type ObservableFn = ReturnType<typeof noArgs>;
            expectTypeOf<ObservableFn['get']>().returns.toEqualTypeOf<string | undefined>();
        });

        it('optional return type when optional argument is passed', () => {
            function withOptionalArg(something?: string) {
                return observable(something);
            }

            type ObservableFn = ReturnType<typeof withOptionalArg>;
            expectTypeOf<ObservableFn['get']>().returns.toEqualTypeOf<string | undefined>();
        });

        it('return type with promise info when promise is passed', () => {
            function withPromise() {
                return observable(Promise.resolve('foo'));
            }

            type ObservableFn = ReturnType<typeof withPromise>;
            expectTypeOf<ObservableFn['get']>().returns.toEqualTypeOf<string & PromiseInfo>();
        });

        it('optional return type with promise info when promise with optional value is passed', () => {
            function withOptionalPromiseValue(something?: Promise<string>) {
                return observable(something);
            }

            type ObservableFn = ReturnType<typeof withOptionalPromiseValue>;
            expectTypeOf<ObservableFn['get']>().returns.toEqualTypeOf<(string & PromiseInfo) | undefined>();
        });

        it('issue #151', () => {
            type ObservableFn = ReturnType<
                typeof observable<{
                    optional?: { foo: string };
                    nullable: { foo: string } | null;
                }>
            >;

            expectTypeOf<ObservableFn['get']>().returns.toEqualTypeOf<{
                optional?: { foo: string };
                nullable: { foo: string } | null;
            }>();

            // Note that if a parent is nullable, the child is optional (undefined)
            expectTypeOf<ObservableFn['nullable']['foo']['get']>().returns.toEqualTypeOf<string | undefined>();
            expectTypeOf<ObservableFn['optional']['foo']['get']>().returns.toEqualTypeOf<string | undefined>();
        });
    });

    describe('Observable', () => {
        describe('with state primitive', () => {
            it('should infer string', () => {
                type GetState = Observable<string>['get'];
                expectTypeOf<GetState>().returns.toBeString();
            });

            it('should infer number', () => {
                type GetState = Observable<number>['get'];
                expectTypeOf<GetState>().returns.toBeNumber();
            });

            it('should infer boolean', () => {
                type GetState = Observable<boolean>['get'];
                expectTypeOf<GetState>().returns.toBeBoolean();
            });

            it('should infer null', () => {
                type GetState = Observable<null>['get'];
                expectTypeOf<GetState>().returns.toBeNull();
            });

            it('should infer undefined', () => {
                type GetState = Observable<undefined>['get'];
                expectTypeOf<GetState>().returns.toBeUndefined();
            });
        });

        describe('with state object', () => {
            it('should infer object', () => {
                type State = Observable<{ foo: string }>;
                expectTypeOf<State['get']>().returns.toBeObject();
            });

            it('should infer record', () => {
                type State = Observable<Record<'x' | 'y', number>>;
                expectTypeOf<State>().toEqualTypeOf<Observable<{ x: number; y: number }>>();
                expectTypeOf<State['x']['get']>().returns.toBeNumber();
            });

            describe('with nested nullable types', () => {
                it('should infer nested nullable value', () => {
                    type State = Observable<{ foo: { bar: string | null } }>;
                    expectTypeOf<State['foo']['bar']['get']>().returns.toEqualTypeOf<string | null>();
                });

                it('should infer nested optional value', () => {
                    type State = Observable<{ foo: { bar?: string } }>;
                    expectTypeOf<State['foo']['bar']['get']>().returns.toEqualTypeOf<string | undefined>();
                });

                it('should infer nested value as optional if parent is nullable', () => {
                    type State = Observable<{ foo: { bar: string } | null }>;
                    expectTypeOf<State['foo']['bar']['get']>().returns.toEqualTypeOf<string | undefined>();
                });

                it('should infer nested value as optional if parent is optional', () => {
                    type State = Observable<{ foo?: { bar: string } }>;
                    expectTypeOf<State['foo']['bar']['get']>().returns.toEqualTypeOf<string | undefined>();
                });

                it('should infer nested value as optional if their ancestors are optional and nullable', () => {
                    type State = Observable<{ foo?: { bar: { value: number } | null } }>;
                    expectTypeOf<State['foo']['bar']['value']['get']>().returns.toEqualTypeOf<number | undefined>();
                });

                it('should infer nullable value as both nullable and optional if parent is nullable', () => {
                    type State = Observable<{ foo: { bar?: string } | null }>;
                    expectTypeOf<State['foo']['bar']['get']>().returns.toEqualTypeOf<string | undefined>();
                });

                it('should infer nullable value as both nullable and optional if parent is optional', () => {
                    type State = Observable<{ foo?: { bar: string | null } }>;
                    expectTypeOf<State['foo']['bar']['get']>().returns.toEqualTypeOf<string | undefined | null>();
                });

                // TODO what happens if you have Observable<{ foo?: { bar: string, baz: number }} and obs$.foo.baz.set(12) ?
            });

            describe('with nested state primitive', () => {
                it('should infer string', () => {
                    type GetState = Observable<{ foo: string }>['foo']['get'];
                    expectTypeOf<GetState>().returns.toBeString();
                });

                it('should infer number', () => {
                    type GetState = Observable<{ foo: number }>['foo']['get'];
                    expectTypeOf<GetState>().returns.toBeNumber();
                });

                it('should infer boolean', () => {
                    type GetState = Observable<{ foo: boolean }>['foo']['get'];
                    expectTypeOf<GetState>().returns.toBeBoolean();
                });

                it('should infer date', () => {
                    type GetState = Observable<{ foo: Date }>['foo']['get'];
                    expectTypeOf<GetState>().returns.toEqualTypeOf<Date>();
                });

                it('should infer null', () => {
                    type GetState = Observable<{ foo: null }>['foo']['get'];
                    expectTypeOf<GetState>().returns.toBeNull();
                });

                it('should infer undefined', () => {
                    type GetState = Observable<{ foo: undefined }>['foo']['get'];
                    expectTypeOf<GetState>().returns.toBeUndefined();
                });
            });
        });

        describe('with array', () => {
            it('should infer array with object elements', () => {
                type State = Observable<{ foo: string }[]>;
                expectTypeOf<State['get']>().returns.toEqualTypeOf<{ foo: string }[]>();
                expectTypeOf<State>().toMatchTypeOf<Array<Observable<{ foo: string }>>>();
            });

            it('should infer array with primitive elements', () => {
                type State = Observable<string[]>;
                expectTypeOf<State['get']>().returns.toEqualTypeOf<string[]>();
                expectTypeOf<State[number]>().toEqualTypeOf<Observable<string>>();
                expectTypeOf<State>().toMatchTypeOf<Array<Observable<string>>>();
            });
        });

        describe('with computed', () => {
            it('should infer computed', () => {
                type State = Observable<Computed<string>>;
                expectTypeOf<State['get']>().returns.toEqualTypeOf<string>();
                expectTypeOf<State>().not.toHaveProperty('set');
            });

            it('should infer two way computed', () => {
                type State = Observable<Computed<string, number>>;
                expectTypeOf<State['get']>().returns.toEqualTypeOf<string>();
                expectTypeOf<State>().toHaveProperty('set');
                expectTypeOf<State['set']>().parameter(0).toEqualTypeOf<number | ((value: number) => number)>();
            });
        });

        describe('with function', () => {
            it('should infer function', () => {
                type State = Observable<{ foo: () => void }>;
                expectTypeOf<State['foo']>().toEqualTypeOf<() => void>();
            });

            it('should infer nested function', () => {
                type State = Observable<{ foo: { bar: () => void } }>;
                expectTypeOf<State['foo']['bar']>().toEqualTypeOf<() => void>();
            });

            it('should make nested function optional if parent is optional', () => {
                type State = Observable<{ foo?: { bar: () => void } }>;
                expectTypeOf<State['foo']['bar']>().toEqualTypeOf<(() => void) | undefined>();
            });
        });

        it('should infer Map', () => {
            type GetState = Observable<Map<string, number>>['get'];
            expectTypeOf<GetState>().returns.toEqualTypeOf<Map<string, number>>();
        });

        describe('with maybe undefined', () => {
            it('with primitive', () => {
                type GetState = Observable<string | undefined>['get'];
                expectTypeOf<ReturnType<GetState>>().toEqualTypeOf<string | undefined>();
            });

            it('with object', () => {
                type GetState = Observable<{ foo: string } | undefined>['get'];
                expectTypeOf<ReturnType<GetState>>().toEqualTypeOf<{ foo: string } | undefined>();
            });

            it('with array', () => {
                type State = Observable<{ foo: string }[] | undefined>;
                expectTypeOf<State['get']>().returns.toEqualTypeOf<{ foo: string }[] | undefined>();
                expectTypeOf<State[number]>().toEqualTypeOf<Observable<{ foo: string } | undefined>>();
                expectTypeOf<State>().toMatchTypeOf<Array<Observable<{ foo: string } | undefined>>>();
            });

            it('with function', () => {
                type State = Observable<{ foo: () => void }>;
                expectTypeOf<State['foo']>().toEqualTypeOf<() => void>();
            });
        });
    });
});
