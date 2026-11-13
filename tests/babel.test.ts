import { pluginTester, runPluginUnderTestHere } from 'babel-plugin-tester';

import plugin from '../src/babel';

// Fix babel-plugin-tester errors running in bun test
globalThis.describe = describe;
globalThis.it = it;

function rewriteLegendImport() {
    return {
        visitor: {
            ImportDeclaration(path: { node: any }) {
                if (path.node.source.value === '@legendapp/state/react') {
                    path.node.source.value = '/resolved/legend-state/react';
                }
            },
        },
    };
}

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
            'does not change a local component': `
                    const Memo = ({ children }) => children;
                    const Test = (
                        <Memo>
                            <div>hi</div>
                        </Memo>
                    );
                `,
            'does not change namespace imports with explicit function children': `
                    import * as Legend from '@legendapp/state/react';
                    const Test = <Legend.Memo>{() => <div>hi</div>}</Legend.Memo>;
                `,
            'does not change default imports': `
                    import Legend from '@legendapp/state/react';
                    const Test = (
                        <Legend>
                            <div>hi</div>
                        </Legend>
                    );
                `,
            'only changes components imported from Legend in the same file': {
                code: `
                    import { Memo } from '@legendapp/state/react';
                    import { Show } from '@another/package';
                    const Test = (
                        <Memo>
                            <Show>
                                <div>hi</div>
                            </Show>
                        </Memo>
                    );
                `,
                output: `
                    import { Memo } from '@legendapp/state/react';
                    import { Show } from '@another/package';
                    const Test = (
                        <Memo>
                            {() => (
                                <Show>
                                    <div>hi</div>
                                </Show>
                            )}
                        </Memo>
                    );
                `,
            },
            'does not change a shadowed import': `
                    import { Memo } from '@legendapp/state/react';
                    function Test(Memo) {
                        return (
                            <Memo>
                                <div>hi</div>
                            </Memo>
                        );
                    }
                `,
            'handles aliased imports using the local name': {
                code: `
                    import { Memo as StateMemo } from '@legendapp/state/react';
                    const Test = (
                        <StateMemo>
                            <div>hi</div>
                            <div>hi2</div>
                        </StateMemo>
                    );
                `,
                output: `
                    import { Memo as StateMemo } from '@legendapp/state/react';
                    const Test = (
                        <StateMemo>
                            {() => (
                                <>
                                    <div>hi</div>
                                    <div>hi2</div>
                                </>
                            )}
                        </StateMemo>
                    );
                `,
            },
            'does not change a host element with the same name as an import': `
                import { Memo as memo } from '@legendapp/state/react';
                const Test = (
                    <memo>
                        <span>hi</span>
                    </memo>
                );
            `,
            'does not change an unbound component alongside a Legend import': `
                import { Memo } from '@legendapp/state/react';
                const Test = (
                    <Show>
                        <div>hi</div>
                    </Show>
                );
            `,
            'handles an import declared after its JSX use': {
                code: `
                    const Test = <Memo><div>hi</div></Memo>;
                    import { Memo } from '@legendapp/state/react';
                `,
                output: `
                    const Test = <Memo>{() => <div>hi</div>}</Memo>;
                    import { Memo } from '@legendapp/state/react';
                `,
            },
            'keeps import ownership when a later plugin rewrites the module source': {
                babelOptions: {
                    plugins: [runPluginUnderTestHere, rewriteLegendImport],
                },
                code: `
                    import { Memo } from '@legendapp/state/react';
                    const Test = <Memo><div>hi</div></Memo>;
                `,
                output: `
                    import { Memo } from '/resolved/legend-state/react';
                    const Test = <Memo>{() => <div>hi</div>}</Memo>;
                `,
            },
            'handles imports injected by another plugin before module rewriting': {
                babelOptions: {
                    plugins: [
                        runPluginUnderTestHere,
                        ({ types }: any) => ({
                            visitor: {
                                Program(path: any) {
                                    path.unshiftContainer(
                                        'body',
                                        types.importDeclaration(
                                            [types.importSpecifier(types.identifier('Memo'), types.identifier('Memo'))],
                                            types.stringLiteral('@legendapp/state/react'),
                                        ),
                                    );
                                    path.scope.crawl();
                                },
                            },
                        }),
                        rewriteLegendImport,
                    ],
                },
                code: `
                    const Test = <Memo><div>hi</div></Memo>;
                `,
                output: `
                    import { Memo } from '/resolved/legend-state/react';
                    const Test = <Memo>{() => <div>hi</div>}</Memo>;
                `,
            },
        },
    });

    const reusedPlugin = plugin();
    pluginTester({
        plugin: () => reusedPlugin,
        pluginName: 'reused babel',
        babelOptions: {
            plugins: ['@babel/plugin-syntax-jsx'],
        },
        tests: {
            'transforms a Legend import before reusing the plugin': {
                code: `
                    import { Memo } from '@legendapp/state/react';
                    const Test = <Memo><div>hi</div></Memo>;
                `,
                output: `
                    import { Memo } from '@legendapp/state/react';
                    const Test = <Memo>{() => <div>hi</div>}</Memo>;
                `,
            },
            'does not carry import state into another file': `
                import { Memo } from '@another/package';
                const Test = (
                    <Memo>
                        <div>hi</div>
                    </Memo>
                );
            `,
        },
    });
});
