import { persistObservable } from '../src/persist/persistObservable';
import { run } from './computedtests';

persistObservable({} as any, {
    pluginRemote: {
        get() {
            return Promise.resolve({ test: 'hi' });
        },
    },
});

run(true);
