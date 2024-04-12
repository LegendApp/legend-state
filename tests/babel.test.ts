import { pluginTester } from 'babel-plugin-tester';

import plugin from '../src/babel';

pluginTester({
    plugin,
    pluginName: 'babel',
    babelOptions: {
        plugins: ['@babel/plugin-syntax-jsx']
    },
    tests: {
        'does not change code for different component name': {
            code: `
            import { Asdf } from '@legendapp/state/react';
            const fn = () => <Asdf><div>hi</div></Asdf>;
        `,
            output: `
            import { Asdf } from '@legendapp/state/react';
            const fn = () => (
                <Asdf>
                    <div>hi</div>
                </Asdf>
            );
        `,
        },
        'does not change Memo without @legendapp/state/react': {
            code: `
            import { Memo } from '@another/package';
            const fn = () => <Memo><div>hi</div></Memo>;
        `,
            output: `
            import { Memo } from '@another/package';
            const fn = () => (
                <Memo>
                    <div>hi</div>
                </Memo>
            );
        `,
        },
        'does not change Computed without @legendapp/state/react': {
            code: `
            import { Computed } from '@another/package';
            const fn = () => <Computed><div>hi</div></Computed>;
        `,
            output: `
            import { Computed } from '@another/package';
            const fn = () => (
                <Computed>
                    <div>hi</div>
                </Computed>
            );
        `,
        },
        'does not change Show without @legendapp/state/react': {
            code: `
            import { Show } from '@another/package';
            const fn = () => <Show if={true}><div>hi</div></Show>;
        `,
            output: `
            import { Show } from '@another/package';
            const fn = () => (
                <Show if={true}>
                    <div>hi</div>
                </Show>
            );
        `,
        },
        'handles Computed': {
            code: `
                import { Computed } from '@legendapp/state/react';
                const Test = <Computed><div>hi</div></Computed>;
            `,
            output: `
                import { Computed } from '@legendapp/state/react';
                const Test = (
                    <Computed>
                        {() => (
                            <>
                                <div>hi</div>
                            </>
                        )}
                    </Computed>
                );
            `
        },
        'handles Memo': {
            code: `
                import { Memo } from '@legendapp/state/react';
                const Test = <Memo><div>hi</div></Memo>;
            `,
            output: `
                import { Memo } from '@legendapp/state/react';
                const Test = (
                    <Memo>
                        {() => (
                            <>
                                <div>hi</div>
                            </>
                        )}
                    </Memo>
                );
            `
        },
        'handles Show': {
            code: `
                import { Show } from '@legendapp/state/react';
                const Test = <Show if={true}><div>hi</div></Show>;
            `,
            output: `
                import { Show } from '@legendapp/state/react';
                const Test = (
                    <Show if={true}>
                        {() => (
                            <>
                                <div>hi</div>
                            </>
                        )}
                    </Show>
                );
            `
        }
    }
});