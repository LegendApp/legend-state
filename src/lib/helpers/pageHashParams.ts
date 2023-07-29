import { observable, Observable } from '@legendapp/state';

interface Options {
    setter: 'pushState' | 'replaceState' | 'hash';
}
let _options: Options = { setter: 'hash' };

function configurePageHashParams(options: Options) {
    _options = options;
}

function toParams(str: string) {
    const ret: Record<string, string> = {};
    const searchParams = new URLSearchParams(str);
    for (const [key, value] of searchParams) {
        ret[key] = value;
    }
    return ret;
}
function toString(params: Record<string, string>) {
    return new URLSearchParams(params).toString().replace(/=$/, '');
}

const hasWindow = typeof window !== 'undefined';
const pageHashParams: Observable<Record<string, string>> = observable(
    hasWindow ? toParams(window.location.hash.slice(1)) : {},
);

if (hasWindow) {
    let isSetting = false;
    // Set the page hash when the observable changes
    pageHashParams.onChange(({ value }) => {
        if (!isSetting) {
            const hash = '#' + toString(value);
            const setter = _options?.setter || 'hash';
            if (setter === 'pushState') {
                history.pushState(null, null as any, hash);
            } else if (setter === 'replaceState') {
                history.replaceState(null, null as any, hash);
            } else {
                location.hash = hash;
            }
        }
    });
    // Update the observable whenever the hash changes
    const cb = () => {
        isSetting = true;
        pageHashParams.set(toParams(window.location.hash.slice(1)));
        isSetting = false;
    };
    // Subscribe to window hashChange event
    window.addEventListener('hashchange', cb);
}

export { configurePageHashParams, pageHashParams };
