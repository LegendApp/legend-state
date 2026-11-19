import { observable } from '../src/observable';
import { linked } from '../src/linked';
import { promiseTimeout } from './testglobals';

describe('linked function initial', () => {
    test('uses function initial until the get resolves', async () => {
        let initialCalls = 0;
        const obs$ = observable({
            a: linked({
                initial: () => {
                    initialCalls++;
                    return 'initial';
                },
                get: async () => {
                    await promiseTimeout(20);
                    return 'get';
                },
            }),
        });

        expect(obs$.a.peek()).toEqual('initial');
        expect(obs$.a.peek()).toEqual('initial');

        await promiseTimeout(50);
        expect(obs$.a.get()).toEqual('get');
        expect(initialCalls).toBe(1);
    });

    test('function initial is used when there is no get', () => {
        // repro linked function initial is ignored before get resolves
        const obs$ = observable({ a: linked({ initial: () => 'initial' }) });

        expect(obs$.a.peek()).toEqual('initial');
    });

    test('an undefined linked initial factory runs once while gets are pending', () => {
        let initialCalls = 0;
        const trigger$ = observable(0);
        const pending = new Promise<undefined>(() => {});
        const value$ = observable(
            linked({
                initial: () => {
                    initialCalls++;
                    return undefined;
                },
                get: () => {
                    trigger$.get();
                    return pending;
                },
            }),
        );
        expect(value$.get()).toBeUndefined();
        trigger$.set(1);
        expect(value$.get()).toBeUndefined();
        expect(initialCalls).toBe(1);
    });
});
