import { useRef } from 'react';

export function useVerifyOneRender(name?: string) {
    if (process.env.NODE_ENV === 'development') {
        const numRenders = ++useRef(0).current;
        if (numRenders > 1) {
            console.error(`[legend-state] ${name ? name + ' ' : ''}Component rendered more than once`);
        }
    }
}
