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
    react,
} from '@babel/types';

export default function () {
    return {
        pre(this: any) {
            this.legendImports = new WeakMap<object, boolean>();
        },
        visitor: {
            ImportDeclaration: {
                enter(path: any, state: any) {
                    isLegendImport(path, state);
                },
            },
            JSXElement: {
                enter(
                    path: {
                        node: any;
                        scope: any;
                        replaceWith: (param: any) => any;
                        skip: () => void;
                        traverse: (path: any) => any;
                    },
                    state: any,
                ) {
                    const openingElement = path.node.openingElement;
                    if (openingElement.name.type !== 'JSXIdentifier' || react.isCompatTag(openingElement.name.name)) {
                        return;
                    }
                    const name = openingElement.name.name;
                    const binding = path.scope.getBinding(name);
                    if (!binding?.path.isImportSpecifier() || !isLegendImport(binding.path.parentPath, state)) {
                        return;
                    }
                    const imported = binding.path.node.imported;
                    const importedName = imported.name ?? imported.value;

                    if (importedName === 'Computed' || importedName === 'Memo' || importedName === 'Show') {
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

function isLegendImport(path: any, state: { legendImports: WeakMap<object, boolean> }) {
    let isLegend = state.legendImports.get(path);
    if (isLegend === undefined) {
        // Capture module identity before a later plugin rewrites the source.
        isLegend = path.node.source.value === '@legendapp/state/react';
        state.legendImports.set(path, isLegend);
    }
    return isLegend;
}

function maybeWrapFragment(children: any[]) {
    if (children.length === 1 && children[0].type == 'JSXElement') return children[0];
    if (children.length === 1 && children[0].type == 'JSXExpressionContainer') return children[0].expression;
    return jsxFragment(jsxOpeningFragment(), jsxClosingFragment(), children);
}

function removeEmptyText(nodes: any[]) {
    return nodes.filter((node) => !(node.type === 'JSXText' && node.value.trim().length === 0));
}
