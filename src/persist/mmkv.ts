import type { ObservablePersistLocal } from '../observableInterfaces';
import { MMKV } from 'react-native-mmkv';

export class ObservablePersistMMKV implements ObservablePersistLocal {
    private data: Record<string, any> = {};
    private storage = new MMKV({
        id: `obsPersist`,
    });

    public get(id: string) {
        if (this.data[id] === undefined) {
            try {
                const value = this.storage.getString(id);
                return value ? JSON.parse(value) : undefined;
            } catch {
                console.log('failed to parse', id);
            }
        }
        return this.data[id];
    }
    public async set(id: string, value: any) {
        this.data[id] = value;
        this.save(id);
    }
    public async delete(id: string) {
        delete this.data[id];
        this.storage.delete(id);
    }
    private save(id: string) {
        return this._save(id);
    }
    private _save(id: string) {
        const v = this.data[id];
        if (v !== undefined) {
            try {
                this.storage.set(id, JSON.stringify(v));
            } catch (err) {
                console.error(err);
            }
        } else {
            this.storage.delete(id);
        }
    }
}
