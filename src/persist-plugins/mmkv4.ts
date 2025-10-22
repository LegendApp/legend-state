import { createMMKV, MMKV, Configuration } from 'react-native-mmkv4';
import { ObservablePersistMMKVBase, MMKVStorageAdapter } from './mmkv-base';

const mmkv4Adapter: MMKVStorageAdapter<MMKV, Configuration> = {
    createStorage: (config) => createMMKV(config),
    getString: (storage, key) => storage.getString(key),
    setString: (storage, key, value) => storage.set(key, value),
    remove: (storage, key) => storage.remove(key),
};

export class ObservablePersistMMKV extends ObservablePersistMMKVBase<MMKV, Configuration> {
    constructor(configuration: Configuration) {
        super(configuration, mmkv4Adapter);
    }
}

export function observablePersistMMKV(configuration: Configuration) {
    return new ObservablePersistMMKV(configuration);
}
