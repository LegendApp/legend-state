import { Change, observable, ObservableReadable, ObservableReference, reference, TrackingType } from '@legendapp/state';

function promiseTimeout(time?: number) {
    return new Promise((resolve) => setTimeout(resolve, time || 0));
}

let spiedConsole: jest.SpyInstance;

beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    spiedConsole = jest.spyOn(global.console, 'error').mockImplementation(() => {});
});
afterAll(() => {
    spiedConsole.mockRestore();
});

function expectChangeHandler<T>(obs: ObservableReadable<T>, track?: TrackingType) {
    const ret = jest.fn();

    function handler({ value, getPrevious, changes }: { value: any; getPrevious: () => any; changes: Change[] }) {
        const prev = getPrevious();

        ret(value, prev, changes);
    }

    obs.onChange(handler, { trackingType: track });

    return ret;
}

describe('Reference', () => {
    test('Basic reference', () => {
        const refFn = (key: string) => obs.users[key];
        type User = { name: string };
        const obs = observable<{
            users: Record<string, User>;
            messages: Record<string, { from: ObservableReference<string, User>; text: string }>;
        }>({
            users: { '1': { name: 'n' } },
            messages: {},
        });
        obs.messages.m1.set({ from: reference('1', refFn), text: 'hi' });

        createReference(obs.messages, '*.from');

        // obs.messages['m1'].from.
    });
});
