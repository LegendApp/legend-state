import { ObsPersistLocal } from '../ObsProxyInterfaces';
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV({
    id: `obsPersist`,
});

export class ObsPersistMMKV implements ObsPersistLocal {
    data: Record<string, any> = {};

    public getValue(id: string) {
        if (this.data[id] === undefined) {
            try {
                return JSON.parse(storage.getString(id));
            } catch {}
        }
        return this.data[id];
    }
    public async setValue(id: string, value: any) {
        this.data[id] = value;
        this.save(id);
    }
    public async deleteById(id: string) {
        delete this.data[id];
        this.save(id);
    }
    private save(id: string) {
        const v = this.data[id];
        if (v !== undefined) {
            storage.set(id, JSON.stringify(v));
        } else {
            storage.delete(id);
        }
    }
}
