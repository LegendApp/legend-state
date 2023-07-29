import { observable, Observable } from '@legendapp/state';

interface Options {
    setter: 'pushState' | 'replaceState' | 'hash';
}
let _options: Options = { setter: 'hash' };

function configurePageHash(options: Options) {
    _options = options;
}

const hasWindow = typeof window !== 'undefined';
const pageHash: Observable<string> = observable(hasWindow ? window.location.hash.slice(1) : '');

if (hasWindow) {
    let isSetting = false;
    // Set the page hash when the observable changes
    pageHash.onChange(({ value }) => {
        if (!isSetting) {
            const hash = '#' + value;
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
        pageHash.set(window.location.hash.slice(1));
        isSetting = false;
    };
    // Subscribe to window hashChange event
    window.addEventListener('hashchange', cb);
}

export { configurePageHash, pageHash };
