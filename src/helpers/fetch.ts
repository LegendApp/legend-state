import { observable, ObservableObject } from '@legendapp/state';

// export function observableFetch<T extends unknown>(
//     input: RequestInfo | URL,
//     init?: RequestInit,
//     valueType?: 'arrayBuffer' | 'blob' | 'formData' | 'json' | 'text'
// ): ObservableObject<{
//     data?: T;
//     error?: any;
//     errorStr?: string;
//     loading: boolean;
// }>;

// export function observableFetch<T extends any[]>(
//     input: RequestInfo | URL,
//     init?: RequestInit,
//     valueType?: 'arrayBuffer' | 'blob' | 'formData' | 'json' | 'text',
//     paginateFn?: Function // Function that returns the total number of pages
// ): ObservableObject<{
//     data?: T;
//     error?: any;
//     errorStr?: string;
//     loading: boolean;
// }>;

export function observableFetch<T extends unknown | any[]>(
    input: RequestInfo | URL,
    init?: RequestInit,
    valueType?: 'arrayBuffer' | 'blob' | 'formData' | 'json' | 'text',
    paginateFn?: Function // Function that returns the total number of pages
) {
    const obs = observable<{
        data?: T;
        error?: any;
        errorStr?: string;
        loading: boolean;
    }>({
        data: undefined,
        error: undefined,
        errorStr: undefined,
        loading: true,
    });

    if (!paginateFn) {
        fetch(input, init)
            .then((response) => response[valueType || 'json']())
            .then((value) => obs.set({ data: value as T, loading: false }))
            .catch((error) => obs.set({ loading: false, error, errorStr: error?.toString?.() }));
    } else {
        function createUrls(pages: number) {
            const urls: string[] = [];
            for (let i = 2; i <= pages; i++) {
                urls.push(`${input}?page=${i}`);
            }
            return urls;
        }

        fetch(input, init)
            .then((response) => response[valueType || 'json']())
            .then((value) => {
                const pages = paginateFn(value);
                if (pages > 1) {
                    const urls = createUrls(pages);
                    Promise.all(urls.map((url) => fetch(url, init).then((response) => response['json']())))
                        .then((values) => {
                            const data = [value, ...values].flat();
                            obs.set({ data, loading: false });
                        })
                        .catch((error) => obs.set({ loading: false, error, errorStr: error?.toString?.() }));
                }
            });
    }

    return obs;
}
