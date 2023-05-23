import { symbolReference } from 'src/globals';
import type { Observable, ObservableReference } from './observableInterfaces';

export function reference<TKey, TRef>(
    id: TKey,
    getRef: (key: TKey) => Observable<TRef>
): ObservableReference<TKey, TRef> {
    return {
        id,
        getRef,
        // @ts-expect-error Doesn't need to be on exported type
        [symbolReference]: true,
    };
}
