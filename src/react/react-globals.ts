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

// A selector's reads are tracked by its own hook, so they are not reads in the body of an observer's render
export function runSelector<T>(fn: () => T): T {
    const inObserver = reactGlobals.inObserver;
    reactGlobals.inObserver = false;
    try {
        return fn();
    } finally {
        reactGlobals.inObserver = inObserver;
    }
}
