import { Change, isFunction, WaitForSet, when } from '@legendapp/state';

export async function waitForSet(
    waitForSet: WaitForSet<any>,
    changes: Change[],
    value: any,
    params: Record<string, any> = {},
) {
    const waitFn = isFunction(waitForSet) ? waitForSet({ changes, value, ...params }) : waitForSet;

    if (waitFn) {
        await when(waitFn);
    }
}
