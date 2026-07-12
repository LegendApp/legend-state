import { reactGlobals, runInRender } from '../src/react/react-globals';

describe('runInRender', () => {
    test('tracks nested scopes and restores after errors', () => {
        expect(reactGlobals.renderDepth).toBe(0);

        const result = runInRender(() => {
            expect(reactGlobals.renderDepth).toBe(1);

            expect(() =>
                runInRender(() => {
                    expect(reactGlobals.renderDepth).toBe(2);
                    throw new Error('inner error');
                }),
            ).toThrow('inner error');

            expect(reactGlobals.renderDepth).toBe(1);
            return 'done';
        });

        expect(result).toBe('done');
        expect(reactGlobals.renderDepth).toBe(0);

        expect(() =>
            runInRender(() => {
                expect(reactGlobals.renderDepth).toBe(1);
                throw new Error('outer error');
            }),
        ).toThrow('outer error');

        expect(reactGlobals.renderDepth).toBe(0);
    });
});
