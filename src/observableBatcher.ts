import { clearTimeoutOnce, timeoutOnce } from '@legendapp/tools';
import { ListenerFn, ObservableListenerInfo } from './observableInterfaces';

let numInBatch = 0;
let _batch: { cb: ListenerFn<any>; value: any; info: ObservableListenerInfo }[] = [];

function onActionTimeout() {
    if (_batch.length > 0) {
        observableBatcher.end(/*force*/ true);
    }
}

export namespace observableBatcher {
    export function batch(fn: () => void) {
        begin();
        fn();
        end();
    }
    export function begin() {
        numInBatch++;
        timeoutOnce('batch_beginAction', onActionTimeout, 0);
    }
    export function end(force?: boolean) {
        numInBatch--;
        if (numInBatch <= 0 || force) {
            numInBatch = 0;
            // Save batch locally first because it could batch more while looping over computeds
            const batch = _batch;
            _batch = [];
            batch.forEach(({ cb, value, info }) => cb(value, info));
            clearTimeoutOnce('batch_beginAction');
        }
    }
    export function notify(cb: ListenerFn<any>, value: any, info: ObservableListenerInfo) {
        if (numInBatch > 0) {
            for (let i = 0; i < _batch.length; i++) {
                const n = _batch[i];
                // If this callback already exists, make sure it has the latest value but do not add it
                if (n.cb === cb) {
                    n.value = value;
                    n.info = info;
                    return;
                }
            }
            _batch.push({ cb, value, info });
        } else {
            cb(value, info);
        }
    }
}
