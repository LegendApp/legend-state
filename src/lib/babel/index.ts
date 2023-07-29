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
    let imported: Record<string, string>;
    return {
        visitor: {
            Program() {
                imported = {};
            },
            ImportDeclaration: {
                enter(path: { node: any; replaceWith: (param: any) => any }) {
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
                enter(path: { node: any; replaceWith: (param: any) => any }) {
                    const openingElement = path.node.openingElement;

                    const children_ = path.node.children;
                    const name = openingElement.name.name;

                    if (name === 'Computed' || name === 'Memo' || name === 'Show') {
                        const children = removEmptyText(children_);

                        const attrs = openingElement.attributes;

                        if (children.length > 0 && children[0].type === 'JSXElement') {
                            path.replaceWith(
                                jsxElement(
                                    jsxOpeningElement(jsxIdentifier(name), attrs),
                                    jsxClosingElement(jsxIdentifier(name)),
                                    [
                                        jsxExpressionContainer(
                                            arrowFunctionExpression(
                                                [],
                                                jsxFragment(jsxOpeningFragment(), jsxClosingFragment(), children),
                                            ),
                                        ),
                                    ],
                                ),
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
