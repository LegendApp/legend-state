import {
    arrowFunctionExpression,
    jsxClosingElement,
    jsxClosingFragment,
    jsxElement,
    jsxExpressionContainer,
    jsxFragment,
    jsxIdentifier,
    jsxOpeningElement,
    jsxOpeningFragment,
    objectExpression,
    objectProperty,
    identifier,
    stringLiteral,
} from '@babel/types';

// Set of observable factory function names that should be auto-named
const OBSERVABLE_FACTORIES = new Set(['observable', 'observablePrimitive']);

export default function () {
    let hasLegendImport = false;
    const observableImports = new Set<string>();
    return {
        visitor: {
            ImportDeclaration: {
                enter(path: { node: any; replaceWith: (param: any) => any; skip: () => void }) {
                    const source = path.node.source.value;

                    if (source === '@legendapp/state/react') {
                        const specifiers = path.node.specifiers;
                        for (let i = 0; i < specifiers.length; i++) {
                            const s = specifiers[i].imported.name;
                            if (!hasLegendImport && (s === 'Computed' || s === 'Memo' || s === 'Show')) {
                                hasLegendImport = true;
                                break;
                            }
                        }
                    }

                    if (source === '@legendapp/state' || source === '@legendapp/state/src/observable') {
                        const specifiers = path.node.specifiers;
                        for (let i = 0; i < specifiers.length; i++) {
                            const spec = specifiers[i];
                            // Handle named imports: import { observable } or import { observable as obs }
                            if (spec.type === 'ImportSpecifier' && OBSERVABLE_FACTORIES.has(spec.imported.name)) {
                                observableImports.add(spec.local.name);
                            }
                        }
                    }
                },
            },
            VariableDeclarator: {
                enter(path: { node: any; skip: () => void }) {
                    if (observableImports.size === 0) return;

                    const { id, init } = path.node;
                    // Only handle simple variable names: const foo = observable(...)
                    if (!id || id.type !== 'Identifier' || !init || init.type !== 'CallExpression') {
                        return;
                    }

                    const callee = init.callee;
                    let isObservableCall = false;
                    if (callee.type === 'Identifier' && observableImports.has(callee.name)) {
                        isObservableCall = true;
                    }

                    if (!isObservableCall) return;

                    const varName = id.name;
                    const args = init.arguments;

                    if (args.length >= 2) return;

                    const nameOption = objectExpression([objectProperty(identifier('name'), stringLiteral(varName))]);

                    if (args.length === 0) {
                        // observable() -> observable(undefined, { name: '...' })
                        args.push(identifier('undefined'));
                        args.push(nameOption);
                    } else {
                        // observable(val) -> observable(val, { name: '...' })
                        args.push(nameOption);
                    }
                },
            },
            JSXElement: {
                enter(path: {
                    node: any;
                    replaceWith: (param: any) => any;
                    skip: () => void;
                    traverse: (path: any) => any;
                }) {
                    if (!hasLegendImport) {
                        return;
                    }

                    const openingElement = path.node.openingElement;
                    const name = openingElement.name.name;

                    if (name === 'Computed' || name === 'Memo' || name === 'Show') {
                        const children = removeEmptyText(path.node.children);
                        if (children.length === 0) return;

                        if (
                            children[0].type === 'JSXElement' ||
                            (children[0].type === 'JSXExpressionContainer' &&
                                children[0].expression.type !== 'ArrowFunctionExpression' &&
                                children[0].expression.type !== 'FunctionExpression' &&
                                children[0].expression.type !== 'MemberExpression' &&
                                children[0].expression.type !== 'Identifier')
                        ) {
                            const attrs = openingElement.attributes;
                            path.replaceWith(
                                jsxElement(
                                    jsxOpeningElement(jsxIdentifier(name), attrs),
                                    jsxClosingElement(jsxIdentifier(name)),
                                    [jsxExpressionContainer(arrowFunctionExpression([], maybeWrapFragment(children)))],
                                ),
                            );
                        }
                    }
                },
            },
        },
    };
}

function maybeWrapFragment(children: any[]) {
    if (children.length === 1 && children[0].type == 'JSXElement') return children[0];
    if (children.length === 1 && children[0].type == 'JSXExpressionContainer') return children[0].expression;
    return jsxFragment(jsxOpeningFragment(), jsxClosingFragment(), children);
}

function removeEmptyText(nodes: any[]) {
    return nodes.filter((node) => !(node.type === 'JSXText' && node.value.trim().length === 0));
}
