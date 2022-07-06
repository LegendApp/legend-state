import { timeoutOnce } from '@legendapp/tools';
import { ListenerFn, ObsListenerInfo } from './ObsProxyInterfaces';

let numInBatch = 0;
let _batch: { cb: ListenerFn<any>; value: any; info: ObsListenerInfo }[] = [];

function onActionTimeout() {
    if (_batch.length > 0) {
        ObsBatcher.endBatch(/*force*/ true);
    }
}

export namespace ObsBatcher {
    export function batch(fn: () => void) {
        beginBatch();
        fn();
        endBatch();
    }
    export function beginBatch() {
        numInBatch++;
        timeoutOnce('batch_beginAction', onActionTimeout, 0);
    }
    export function endBatch(force?: boolean) {
        numInBatch--;
        if (numInBatch <= 0 || force) {
            numInBatch = 0;
            _batch.forEach(({ cb, value, info }) => cb(value, info));
            _batch = [];
        }
    }
    export function notify(cb: ListenerFn<any>, value: any, info: ObsListenerInfo) {
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
