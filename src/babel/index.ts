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
} from '@babel/types';

export default function () {
    let root;
    let imported: Record<string, string>;
    return {
        visitor: {
            Program(path) {
                root = path;
                imported = {};
            },
            ImportDeclaration: {
                enter(path) {
                    if (path.node.source.value === '@legendapp/state/react') {
                        const specifiers = path.node.specifiers;
                        for (let i = 0; i < specifiers.length; i++) {
                            const s = specifiers[i].imported.name;
                            if (!imported[s] && (s === 'Computed' || s === 'Memo')) {
                                imported[s] = specifiers[i].local.name;
                            }
                        }
                    }
                },
            },
            JSXElement: {
                enter(path) {
                    const openingElement = path.node.openingElement;

                    const children_ = path.node.children;
                    const name = openingElement.name.name;

                    if (name === 'Computed' || name === 'Memo') {
                        const children = removEmptyText(children_);
                        if (
                            children.length > 0 &&
                            children[0].expression?.type !== 'ArrowFunctionExpression' &&
                            children[0].expression?.type !== 'FunctionExpression'
                        ) {
                            path.replaceWith(
                                jsxElement(
                                    jsxOpeningElement(jsxIdentifier(name), []),
                                    jsxClosingElement(jsxIdentifier(name)),
                                    [
                                        jsxExpressionContainer(
                                            arrowFunctionExpression(
                                                [],
                                                children.length > 0
                                                    ? jsxFragment(jsxOpeningFragment(), jsxClosingFragment(), children)
                                                    : children[0]
                                            )
                                        ),
                                    ]
                                )
                            );
                        }
                    } else if (name === 'Show') {
                        let children = removEmptyText(children_);
                        const if_ = openingElement.attributes.find((node) => node.name?.name === 'if');
                        const memo = openingElement.attributes.find((node) => node.name?.name === 'memo');

                        if (if_ !== undefined) {
                            const attrs = [];
                            let needsChange = false;

                            if (
                                memo &&
                                children[0].expression?.type !== 'ArrowFunctionExpression' &&
                                children[0].expression?.type !== 'FunctionExpression'
                            ) {
                                needsChange = true;
                                const oldChildren = children;
                                children = [
                                    jsxExpressionContainer(
                                        arrowFunctionExpression(
                                            [],
                                            oldChildren.length > 0
                                                ? jsxFragment(jsxOpeningFragment(), jsxClosingFragment(), oldChildren)
                                                : oldChildren[0]
                                        )
                                    ),
                                ];
                            }

                            if (needsChange) {
                                path.replaceWith(
                                    jsxElement(
                                        jsxOpeningElement(jsxIdentifier('Show'), attrs),
                                        jsxClosingElement(jsxIdentifier('Show')),
                                        children
                                    )
                                );
                            }
                        }
                    }
                },
            },
        },
    };
}

function removEmptyText(nodes: any[]) {
    return nodes.filter((node) => !(node.type === 'JSXText' && node.value.trim().length === 0));
}
