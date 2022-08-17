import { addNamed } from '@babel/helper-module-imports';
import template from '@babel/template';

import {
    jsxClosingElement,
    jsxElement,
    jsxIdentifier,
    jsxOpeningElement,
    arrowFunctionExpression,
    jsxExpressionContainer,
    conditionalExpression,
    identifier,
    jsxFragment,
    jsxAttribute,
    jsxOpeningFragment,
    jsxClosingFragment,
} from '@babel/types';

const buildImport = template(`import { Isolate } from "@legendapp/state/react";`, { sourceType: 'module' });

export default function () {
    const importDeclaration = buildImport();

    let imported = false;
    let root;
    return {
        visitor: {
            Program(path) {
                root = path;
                // path.node.body.unshift(importDeclaration);
            },
            JSXElement: {
                enter(path) {
                    const openingElement = path.node.openingElement;

                    const children_ = path.node.children;
                    const name = openingElement.name.name;
                    // console.log(trimmed);
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
                            // children[0].replaceWith(arrowFunctionExpression([], children[0].expression));
                        }
                    } else if (name === 'Show') {
                        const children = removEmptyText(children_);
                        const if_ = openingElement.attributes.find((node) => node.name?.name === 'if');
                        // console.log(when.value);
                        if (
                            if_ !== undefined &&
                            if_.value.expression.type !== 'ArrowFunctionExpression' &&
                            if_.value.expression.type !== 'FunctionExpression'
                        ) {
                            const attrs = [
                                jsxAttribute(
                                    jsxIdentifier('if'),
                                    jsxExpressionContainer(arrowFunctionExpression([], if_.value.expression))
                                ),
                            ];

                            const else_ = openingElement.attributes.find((node) => node.name?.name === 'else');

                            if (else_) {
                                attrs.push(
                                    jsxAttribute(
                                        jsxIdentifier('else'),
                                        jsxExpressionContainer(arrowFunctionExpression([], else_.value.expression))
                                    )
                                );
                            }

                            path.replaceWith(
                                jsxElement(
                                    jsxOpeningElement(jsxIdentifier('Show'), attrs),
                                    jsxClosingElement(jsxIdentifier('Show')),
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
                            // console.log('isolate', hasIsolateProp);
                            if (hasIsolateProp >= 0) {
                                openingElement.attributes.splice(hasIsolateProp, 1);
                            }
                            if (hasMemoProp >= 0) {
                                openingElement.attributes.splice(hasMemoProp, 1);
                            }

                            const name = hasMemoProp >= 0 ? 'Memo' : 'Isolate';

                            path.replaceWith(
                                jsxElement(
                                    jsxOpeningElement(jsxIdentifier('_' + name), keyProp ? [keyProp] : []),
                                    jsxClosingElement(jsxIdentifier('_' + name)),
                                    [jsxExpressionContainer(arrowFunctionExpression([], path.node))]
                                )
                            );

                            addNamed(root, name, '@legendapp/state/react');
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
