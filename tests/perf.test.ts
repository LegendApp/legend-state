import { ObservableHint } from '../src/ObservableHint';
import { linked } from '../src/linked';
import { observable } from '../src/observable';

describe('Perf', () => {
    test('Array perf', () => {
        const obs = observable({ arr: [] as { id: number; value: number }[] });
        for (let i = 0; i < 10000; i++) {
            obs.arr[i].set({ id: i, value: i });
            obs.arr[i].onChange(() => {});
        }
        const now = performance.now();
        obs.arr.splice(1, 1);
        const then = performance.now();

        expect(then - now).toBeLessThan(process.env.CI === 'true' ? 100 : 30);
    });
    test('Lazy activation perf', () => {
        const obj: Record<string, any> = {};
        const Num = 10000;
        for (let i = 0; i < Num; i++) {
            obj['key' + i] = {
                child: {
                    grandchild: {
                        value: 'hi',
                    },
                },
            };
        }

        const obs = observable(obj);

        const now = performance.now();
        obs.get();
        const then = performance.now();

        expect(then - now).toBeLessThan(process.env.CI === 'true' ? 100 : 25);
    });
    test('Lazy activation perf with plain hint', () => {
        const obj: Record<string, any> = {};
        const Num = 10000;
        for (let i = 0; i < Num; i++) {
            obj['key' + i] = {
                child: {
                    grandchild: {
                        value: 'hi',
                    },
                },
            };
        }

        const obs = observable(ObservableHint.plain(obj));

        const now = performance.now();
        obs.get();
        const then = performance.now();

        expect(then - now).toBeLessThan(1);
    });
    test('Lazy activation perf2', () => {
        const obj: Record<string, any> = {};
        const Num = 10000;
        let numCalled = 0;
        for (let i = 0; i < Num; i++) {
            obj['key' + i] = {
                child: {
                    grandchild: {
                        value: 'hi',
                        fn: () => {
                            numCalled++;
                            return 'test';
                        },
                    },
                },
            };
        }

        const obs = observable(obj);

        const now = performance.now();
        obs.get();
        const then = performance.now();

        expect(numCalled).toEqual(0);
        expect(then - now).toBeLessThan(process.env.CI === 'true' ? 100 : 25);
    });
    test('Lazy activation perf3', () => {
        const obj: Record<string, any> = {};
        const Num = 1000;
        let numCalled = 0;
        let numActivated = 0;
        for (let i = 0; i < Num; i++) {
            obj['key' + i] = {
                child: {
                    grandchild: {
                        value: 'hi',
                        fn: () => {
                            numCalled++;
                            return 'test';
                        },
                        arr: [
                            {
                                link: linked({
                                    get: () => {
                                        numActivated++;
                                        return 'got';
                                    },
                                }),
                            },
                        ],
                    },
                },
            };
        }

        const obs = observable(obj);

        const now = performance.now();
        obs.get();
        const then = performance.now();

        expect(numCalled).toEqual(0);
        expect(numActivated).toEqual(Num);
        expect(then - now).toBeLessThan(process.env.CI === 'true' ? 400 : 300);

        const now2 = performance.now();
        obs.get();
        const then2 = performance.now();

        expect(then2 - now2).toBeLessThan(process.env.CI === 'true' ? 5 : 1);
    });
});
