import { observable } from '../src/observable';
import { linked } from '../src/linked';
import { promiseTimeout } from './testglobals';

describe('linked function initial', () => {
    test.failing('function initial is ignored before the get resolves', 1000, async () => {
        // repro linked function initial is ignored before get resolves
        const obs$ = observable({
            a: linked({
                initial: () => 'initial',
                get: async () => {
                    await promiseTimeout(20);
                    return 'get';
                },
            }),
        });

        expect(obs$.a.peek()).toEqual('initial');

        await promiseTimeout(50);
        expect(obs$.a.get()).toEqual('get');
    });

    test.failing('function initial is used when there is no get', 1000, async () => {
        // repro linked function initial is ignored before get resolves
        const obs$ = observable({ a: linked({ initial: () => 'initial' }) });

        expect(obs$.a.peek()).toEqual('initial');
    });
});
