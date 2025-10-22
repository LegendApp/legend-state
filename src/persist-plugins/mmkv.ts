import { MMKV, MMKVConfiguration } from 'react-native-mmkv';
import { ObservablePersistMMKVBase, MMKVStorageAdapter } from './mmkv-base';

const mmkvAdapter: MMKVStorageAdapter<MMKV, MMKVConfiguration> = {
    createStorage: (config) => new MMKV(config),
    getString: (storage, key) => storage.getString(key),
    setString: (storage, key, value) => storage.set(key, value),
    remove: (storage, key) => storage.delete(key),
};

export class ObservablePersistMMKV extends ObservablePersistMMKVBase<MMKV, MMKVConfiguration> {
    constructor(configuration: MMKVConfiguration) {
        super(configuration, mmkvAdapter);
    }
}

export function observablePersistMMKV(configuration: MMKVConfiguration) {
    return new ObservablePersistMMKV(configuration);
}
