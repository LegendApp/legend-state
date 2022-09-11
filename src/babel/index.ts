import { addNamed } from '@babel/helper-module-imports';

import {
    arrowFunctionExpression,
    jsxAttribute,
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
                            if (!imported[s] && (s === 'Isolate' || s === 'Memo')) {
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

                    if (name === 'Isolate' || name === 'Memo') {
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

                        if (if_ !== undefined) {
                            const attrs = [];
                            let needsChange = false;

                            if (
                                if_.value.expression.type === 'ArrowFunctionExpression' ||
                                if_.value.expression.type === 'FunctionExpression'
                            ) {
                                attrs.push(if_);
                            } else {
                                needsChange = true;
                                attrs.push(
                                    jsxAttribute(
                                        jsxIdentifier('if'),
                                        jsxExpressionContainer(arrowFunctionExpression([], if_.value.expression))
                                    )
                                );
                            }

                            const else_ = openingElement.attributes.find((node) => node.name?.name === 'else');

                            if (else_) {
                                if (
                                    else_.value.expression.type === 'ArrowFunctionExpression' ||
                                    else_.value.expression.type === 'FunctionExpression'
                                ) {
                                    attrs.push(else_);
                                } else {
                                    needsChange = true;
                                    attrs.push(
                                        jsxAttribute(
                                            jsxIdentifier('else'),
                                            jsxExpressionContainer(arrowFunctionExpression([], else_.value.expression))
                                        )
                                    );
                                }
                            }

                            if (
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
                    } else {
                        const hasIsolateProp = openingElement.attributes.findIndex(
                            (node) => node.name && node.name.name === 'isolate' && node.value !== false
                        );
                        const hasMemoProp = openingElement.attributes.findIndex(
                            (node) => node.name && node.name.name === 'memo' && node.value !== false
                        );
                        const keyProp = openingElement.attributes.find(
                            (node) => node.name && node.name.name === 'key' && node.value !== false
                        );
                        if (hasIsolateProp >= 0 || hasMemoProp >= 0) {
                            if (hasIsolateProp >= 0) {
                                openingElement.attributes.splice(hasIsolateProp, 1);
                            }
                            if (hasMemoProp >= 0) {
                                openingElement.attributes.splice(hasMemoProp, 1);
                            }

                            const name = hasMemoProp >= 0 ? 'Memo' : 'Isolate';

                            const importName = imported[name] || '_' + name;

                            path.replaceWith(
                                jsxElement(
                                    jsxOpeningElement(jsxIdentifier(importName), keyProp ? [keyProp] : []),
                                    jsxClosingElement(jsxIdentifier(importName)),
                                    [jsxExpressionContainer(arrowFunctionExpression([], path.node))]
                                )
                            );

                            if (!imported[name]) {
                                imported[name] = '_' + name;
                                addNamed(root, name, '@legendapp/state/react');
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
