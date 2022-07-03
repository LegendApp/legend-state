import { ObsPersistLocal } from '../ObsProxyInterfaces';

export class ObsPersistLocalStorage implements ObsPersistLocal {
    data: Record<string, any> = {};

    public getValue(id: string) {
        if (typeof localStorage === 'undefined') return undefined;
        if (this.data[id] === undefined) {
            try {
                return JSON.parse(localStorage.getItem(id));
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
        if (typeof localStorage === 'undefined') return;

        const v = this.data[id];
        localStorage.setItem(id, JSON.stringify(v));
    }
}
