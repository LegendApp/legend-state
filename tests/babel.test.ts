import { pluginTester } from 'babel-plugin-tester';

import plugin from '../src/babel';

// Fix babel-plugin-tester errors running in bun test
globalThis.describe = describe;
globalThis.it = it;

describe('babel tests', () => {
    pluginTester({
        plugin,
        pluginName: 'babel',
        babelOptions: {
            plugins: ['@babel/plugin-syntax-jsx'],
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
            'does not change if expression has a ArrowFunctionExpression': `
                import { Computed } from '@legendapp/state/react';
                function Component() {
                    return (
                        <Computed>
                            {() =>
                                state$.messages.map((message) => (
                                    <div key={message.id}>
                                        {message.text} {localVar}
                                    </div>
                                ))
                            }
                        </Computed>
                    );
                }
            `,
            'does not change if expression has a FunctionExpression': `
                import { Memo } from '@legendapp/state/react';
                function C() {
                    return (
                        <Memo>
                            {function a() {
                                state$.messages.map((message) => (
                                    <div key={message.id}>
                                        {message.text} {localVar}
                                    </div>
                                ));
                            }}
                        </Memo>
                    );
                }
            `,
            'does not change if expression is Observable (MemberExpression)': `
                import { Memo } from '@legendapp/state/react';
                function C() {
                    return <Memo>{state$.count}</Memo>;
                }
            `,
            'does not change if expression is Observable (Function Identifier)': `
                import { Memo } from '@legendapp/state/react';
                function C() {
                    return <Memo>{functionCall}</Memo>;
                }
            `,
            'handles ConditionalExpression with single child': {
                code: `
                    import { Memo } from '@legendapp/state/react';
                    function C() {
                        return <Memo>{true ? state$.count : state$.count}</Memo>;
                    }
                `,
                output: `
                    import { Memo } from '@legendapp/state/react';
                    function C() {
                        return <Memo>{() => (true ? state$.count : state$.count)}</Memo>;
                    }
                `,
            },
            'handles ConditionalExpression with multiple children by wrapping in a fragment': {
                code: `
                    import { Memo } from '@legendapp/state/react';
                    function C() {
                        return <Memo><div>hi</div>{true ? state$.count : state$.count}<div>hi</div></Memo>;
                    }
                `,
                output: `
                    import { Memo } from '@legendapp/state/react';
                    function C() {
                        return (
                            <Memo>
                                {() => (
                                    <>
                                        <div>hi</div>
                                        {true ? state$.count : state$.count}
                                        <div>hi</div>
                                    </>
                                )}
                            </Memo>
                        );
                    }
                `,
            },
            'handles ConditionalExpression without Observable': {
                code: `
                    import { Memo } from '@legendapp/state/react';
                    function C() {
                        return <Memo>{true ? 'hi' : 'bye'}</Memo>;
                    }
            `,
                output: `
                    import { Memo } from '@legendapp/state/react';
                    function C() {
                        return <Memo>{() => (true ? 'hi' : 'bye')}</Memo>;
                    }
            `,
            },
            'handles Computed': {
                code: `
                    import { Computed } from '@legendapp/state/react';
                    const Test = <Computed><div>hi</div></Computed>;
                `,
                output: `
                    import { Computed } from '@legendapp/state/react';
                    const Test = <Computed>{() => <div>hi</div>}</Computed>;
                `,
            },
            'handles Computed with multiple children': {
                code: `
                    import { Computed } from '@legendapp/state/react';
                    const Test = <Computed><div>hi</div><div>hi2</div></Computed>;
                `,
                output: `
                    import { Computed } from '@legendapp/state/react';
                    const Test = (
                        <Computed>
                            {() => (
                                <>
                                    <div>hi</div>
                                    <div>hi2</div>
                                </>
                            )}
                        </Computed>
                    );`,
            },
            'handles Memo': {
                code: `
                    import { Memo } from '@legendapp/state/react';
                    const Test = <Memo><div>hi</div></Memo>;
                `,
                output: `
                    import { Memo } from '@legendapp/state/react';
                    const Test = <Memo>{() => <div>hi</div>}</Memo>;
                `,
            },
            'handles Memo with multiple children': {
                code: `
                    import { Memo } from '@legendapp/state/react';
                    const Test = <Memo><div>hi</div><div>hi2</div></Memo>;
                `,
                output: `
                    import { Memo } from '@legendapp/state/react';
                    const Test = (
                        <Memo>
                            {() => (
                                <>
                                    <div>hi</div>
                                    <div>hi2</div>
                                </>
                            )}
                        </Memo>
                    );`,
            },
            'handles Show': {
                code: `
                    import { Show } from '@legendapp/state/react';
                    const Test = <Show if={true}><div>hi</div></Show>;
                `,
                output: `
                    import { Show } from '@legendapp/state/react';
                    const Test = <Show if={true}>{() => <div>hi</div>}</Show>;
                `,
            },
            'handles Show with multiple children': {
                code: `
                    import { Show } from '@legendapp/state/react';
                    const Test = <Show if={true}><div>hi</div><div>hi2</div></Show>;
                `,
                output: `
                    import { Show } from '@legendapp/state/react';
                    const Test = (
                        <Show if={true}>
                            {() => (
                                <>
                                    <div>hi</div>
                                    <div>hi2</div>
                                </>
                            )}
                        </Show>
                    );`,
            },
        },
    });
});
