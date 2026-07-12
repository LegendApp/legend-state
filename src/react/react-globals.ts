export const reactGlobals = {
    inObserver: false,
    renderDepth: 0,
};

export function runInRender<T>(fn: () => T): T {
    reactGlobals.renderDepth++;
    try {
        return fn();
    } finally {
        reactGlobals.renderDepth--;
    }
}
