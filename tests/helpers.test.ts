import { symbolDelete } from '../internal';
import { isObservable, mergeIntoObservable } from '../src/helpers';
import { observable } from '../src/observable';
import { observableFetch } from '../src/helpers/fetch';
import { observe } from '../src/observe';

describe('mergeIntoObservable', () => {
    it('should merge two plain objects', () => {
        const target = { a: 1, b: 2 };
        const source = { b: 3, c: 4 };
        const merged = mergeIntoObservable(target, source);
        expect(merged).toEqual({ a: 1, b: 3, c: 4 });
        expect(isObservable(merged)).toBe(false);
    });

    it('should merge two observable objects', () => {
        const target = observable({ a: 1, b: 2 });
        const source = observable({ b: 3, c: 4 });
        const merged = mergeIntoObservable(target, source);
        expect(merged.get()).toEqual({ a: 1, b: 3, c: 4 });
        expect(isObservable(merged)).toBe(true);
    });

    it('should merge a plain object and an observable object', () => {
        const target = observable({ a: 1, b: 2 });
        const source = { b: 3, c: 4 };
        const merged = mergeIntoObservable(target, source);
        expect(merged.get()).toEqual({ a: 1, b: 3, c: 4 });
        expect(isObservable(merged)).toBe(true);
    });

    it('should delete a key marked with symbolDelete', () => {
        const target = { a: 1, b: 2 };
        const source = { b: symbolDelete };
        const merged = mergeIntoObservable(target, source);
        expect(merged).toEqual({ a: 1 });
        expect(isObservable(merged)).toBe(false);
    });
});

type TestUser = {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    avatar: string;
};

type TestApiResponse = {
    data: TestUser | TestUser[];
    support?: {
        text: string;
        url: string;
    };
    page?: number;
    per_page?: number;
    total?: number;
    total_pages?: number;
};

describe('observableFetch', () => {
    it('should return correct status and data for a user', async () => {
        const response = observableFetch<TestApiResponse>('https://reqres.in/api/users/1');
        setTimeout(() => {
            observe(() => {
                const { loading, data, error, errorStr } = response.get();
                if (loading) console.log('Loading...');
                else if (error) console.log('Error: ', errorStr);
                else {
                    expect(data).toEqual({
                        data: {
                            id: 1,
                            email: 'george.bluth@reqres.in',
                            first_name: 'George',
                            last_name: 'Bluth',
                            avatar: 'https://reqres.in/img/faces/1-image.jpg',
                        },
                        support: {
                            text: 'To keep ReqRes free, contributions towards server costs are appreciated!',
                            url: 'https://reqres.in/#support-heading',
                        },
                    });
                }
            });
        }, 200);
    });

    it('should return all data from paginated api', async () => {
        const response = observableFetch<TestApiResponse>('https://reqres.in/api/users');
        setTimeout(() => {
            observe(() => {
                const { loading, data, error, errorStr } = response.get();
                if (loading) console.log('Loading...');
                else if (error) console.log('Error: ', errorStr);
                else {
                    const { total } = data;
                    const { data: users } = data;
                    expect(users).toHaveLength(total);
                }
            });
        }, 1000);
    });
});
