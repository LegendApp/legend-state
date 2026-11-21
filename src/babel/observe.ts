const { addNamed } = require("@babel/helper-module-imports");

const OBSERVER_PROP = "$observe";

module.exports = function jcsPlugin(api) {
  const { types: t } = api;

  let root = null;
  let imported = false;

  const visitor = {
    Program(path) {
      root = path;
      imported = false;
    },
    JSXElement(path) {
      const { openingElement } = path.node;
      const ObserverIdentifier = t.jsxIdentifier("_Memo");

      const removeDirectiveAttrs = () =>
        (openingElement.attributes = openingElement.attributes.filter(
          (node) => node.name && !directives.includes(node.name.name)
        ));

      const makeImports = () => {
        if (root && !imported) {
          addNamed(root, "Memo", "@legendapp/state/react");
          imported = true;
        }
      };

      const hasObserver = openingElement.attributes.find(
        (node) => node.name && node.name.name === OBSERVER_PROP
      );

      if (hasObserver) {
        makeImports();
        removeDirectiveAttrs();
        path.replaceWith(
          wrapInMemo({
            t,
            ObserverIdentifier,
            path,
          })
        );
      }
    },
  };

  return {
    visitor,
  };
};

const directives = [OBSERVER_PROP];

function wrapInMemo({ t, ObserverIdentifier, path, block = [] }) {
  return t.jsxElement(
    t.jsxOpeningElement(ObserverIdentifier, [], false),
    t.jsxClosingElement(ObserverIdentifier),
    [
      t.jsxExpressionContainer(
        t.arrowFunctionExpression(
          [],
          t.blockStatement([...block, t.returnStatement(path.node)])
        )
      ),
    ],
    false
  );
}
