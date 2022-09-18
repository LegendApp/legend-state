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

                    if (name === 'Computed' || name === 'Memo' || name === 'Show') {
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
                    }
                },
            },
        },
    };
}

function removEmptyText(nodes: any[]) {
    return nodes.filter((node) => !(node.type === 'JSXText' && node.value.trim().length === 0));
}
