import { timeoutOnce } from '@legendapp/tools';
import { ListenerFn, ObsListenerInfo } from './ObsProxyInterfaces';

let numInBatch = 0;
let batch: { cb: ListenerFn<any>; value: any; info: ObsListenerInfo }[] = [];

function onActionTimeout() {
    if (batch.length > 0) {
        ObsBatcher.endBatch(/*force*/ true);
    }
}

export namespace ObsBatcher {
    export function beginBatch() {
        numInBatch++;
        timeoutOnce('batch_beginAction', onActionTimeout, 0);
    }
    export function endBatch(force?: boolean) {
        numInBatch--;
        if (numInBatch <= 0 || force) {
            numInBatch = 0;
            batch.forEach(({ cb, value, info }) => cb(value, info));
            batch = [];
        }
    }
    export function notify(cb: ListenerFn<any>, value: any, info: ObsListenerInfo) {
        if (numInBatch > 0) {
            for (let i = 0; i < batch.length; i++) {
                const n = batch[i];
                if (n.cb === cb) {
                    n.value = value;
                    n.info = info;
                    return;
                }
            }
            batch.push({ cb, value, info });
        } else {
            cb(value, info);
        }
    }
}
