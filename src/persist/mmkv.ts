import type { ObservablePersistLocal } from '../observableInterfaces';
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV({
    id: `obsPersist`,
});

export class ObservablePersistMMKV implements ObservablePersistLocal {
    data: Record<string, any> = {};

    public get(id: string) {
        if (this.data[id] === undefined) {
            try {
                const value = storage.getString(id);
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
        storage.delete(id);
    }
    private save(id: string) {
        return this._save(id);
    }
    private _save(id: string) {
        const v = this.data[id];
        if (v !== undefined) {
            try {
                storage.set(id, JSON.stringify(v));
            } catch (err) {
                console.error(err);
                debugger;
            }
        } else {
            storage.delete(id);
        }
    }
}
