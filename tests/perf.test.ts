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
        for (let i = 0; i < 10000; i++) {
            obj['key' + i] = { child: { grandchild: { value: 'hi' } } };
        }

        const obs = observable(obj);
        const now = performance.now();
        obs.get();
        const then = performance.now();

        // console.log('traverse', end - start);
        console.log(then - now);
        expect(then - now).toBeLessThan(process.env.CI === 'true' ? 100 : 30);
    });
});
