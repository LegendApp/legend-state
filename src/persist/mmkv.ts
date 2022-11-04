import { MMKV } from 'react-native-mmkv';
import type { ObservablePersistLocal, PersistOptionsLocal } from '../observableInterfaces';

const symbolDefault = Symbol();

export class ObservablePersistMMKV implements ObservablePersistLocal {
    private data: Record<string, any> = {};
    private storages = new Map<symbol | string, MMKV>([
        [
            symbolDefault,
            new MMKV({
                id: `obsPersist`,
            }),
        ],
    ]);
    private getStorage(config: PersistOptionsLocal | undefined): MMKV {
        if (config) {
            const { mmkv } = config;
            const key = JSON.stringify(mmkv);
            let storage = this.storages.get(key);
            if (!storage) {
                storage = new MMKV(mmkv);
                this.storages.set(key, storage);
            }
            return storage;
        } else {
            return this.storages.get(symbolDefault);
        }
    }
    public get(id: string, config: PersistOptionsLocal | undefined) {
        const storage = this.getStorage(config);
        if (this.data[id] === undefined) {
            try {
                const value = storage.getString(id);
                return value ? JSON.parse(value) : undefined;
            } catch {
                console.error('[legend-state]: MMKV failed to parse', id);
            }
        }
        return this.data[id];
    }
    public async set(id: string, value: any, config: PersistOptionsLocal | undefined) {
        this.data[id] = value;
        this.save(id, config);
    }
    public async delete(id: string, config: PersistOptionsLocal | undefined) {
        const storage = this.getStorage(config);
        delete this.data[id];
        storage.delete(id);
    }
    private save(id: string, config: PersistOptionsLocal | undefined) {
        const storage = this.getStorage(config);
        const v = this.data[id];
        if (v !== undefined) {
            try {
                storage.set(id, JSON.stringify(v));
            } catch (err) {
                console.error(err);
            }
        } else {
            storage.delete(id);
        }
    }
}
