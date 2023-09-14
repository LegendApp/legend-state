import { expectTypeOf } from 'expect-type';
import { observable } from '../src/observable';
import { ObservableArray, Observable, ObservableObject, ObservablePrimitive } from '../src/observableInterfaces';

describe('Types', () => {
    describe('observable', () => {
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
            expectTypeOf<ObservableFn['nullable']['foo']['get']>().returns.toEqualTypeOf<string | null>();
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
                expectTypeOf<State>().toMatchTypeOf<ObservableObject<{ foo: string }>>();
                expectTypeOf<State>().not.toMatchTypeOf<ObservableArray<any[]>>();
                expectTypeOf<State>().not.toMatchTypeOf<ObservablePrimitive<any>>();
                expectTypeOf<State['get']>().returns.toBeObject();
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

                it('should infer nested value as nullable if parent is nullable', () => {
                    type State = Observable<{ foo: { bar: string } | null }>;
                    expectTypeOf<State['foo']['bar']['get']>().returns.toEqualTypeOf<string | null>();
                });

                it('should infer nested value as optional if parent is optional', () => {
                    type State = Observable<{ foo?: { bar: string } }>;
                    expectTypeOf<State['foo']['bar']['get']>().returns.toEqualTypeOf<string | undefined>();
                });

                // Not sure if this is the desired behavior, what does legend state return in this scenario?
                it('should infer nested value as both optional and nullable if their ancestors are', () => {
                    type State = Observable<{ foo?: { bar: { value: number } | null } }>;
                    expectTypeOf<State['foo']['bar']['value']['get']>().returns.toEqualTypeOf<
                        number | undefined | null
                    >();
                });

                // Not sure if this is the desired behavior, what does legend state return in this scenario?
                it('should infer nested optional value as both optional and nullable if parent is nullable', () => {
                    type State = Observable<{ foo: { bar?: string } | null }>;
                    expectTypeOf<State['foo']['bar']['get']>().returns.toEqualTypeOf<string | undefined | null>();
                });
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

        it('should infer array', () => {
            type GetState = Observable<{ foo: 'bar' }[]>;
            expectTypeOf<GetState>().toMatchTypeOf<ObservableArray<{ foo: string }[]>>();
        });

        it('should infer Map', () => {
            type GetState = Observable<Map<string, number>>['get'];
            expectTypeOf<GetState>().returns.toEqualTypeOf<Map<string, number>>();
        });

        describe('with maybe undefined', () => {
            it('with primitive', () => {
                type GetState = Observable<string | undefined>['get'];
                expectTypeOf<GetState>().returns.toEqualTypeOf<string | undefined>();
            });

            it('with object', () => {
                type GetState = Observable<{ foo: string } | undefined>['get'];
                expectTypeOf<GetState>().returns.toEqualTypeOf<{ foo: string } | undefined>();
            });

            it('with array', () => {
                type GetState = Observable<{ foo: string }[] | undefined>['get'];
                expectTypeOf<GetState>().returns.toEqualTypeOf<{ foo: string }[] | undefined>();
            });
        });
    });
});
