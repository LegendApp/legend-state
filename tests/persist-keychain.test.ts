import { syncObservable } from '../src/sync/syncObservable';
import { observable } from '../src/observable';
import { configureSynced } from '../src/sync/configureSynced';
import { observablePersistKeychain } from '../src/persist-plugins/keychain';
import { synced } from '../src/sync/synced';
import { getPersistName, promiseTimeout } from './testglobals';
import { when } from '../src/when';

// ===== Mock Setup =====

interface MockKeychainStorage {
    [service: string]: { username: string; password: string };
}

const mockKeychainStorage: MockKeychainStorage = {};

// Mock implementation of react-native-keychain for Node.js test environment
jest.mock('react-native-keychain', () => ({
    hasGenericPassword: jest.fn(async (options: { service: string }) => {
        return Promise.resolve(mockKeychainStorage[options.service] !== undefined);
    }),
    getGenericPassword: jest.fn(async (options: { service: string }) => {
        const stored = mockKeychainStorage[options.service];
        if (stored) {
            return Promise.resolve(stored);
        }
        return Promise.resolve(false);
    }),
    setGenericPassword: jest.fn(async (username: string, password: string, options: { service: string }) => {
        mockKeychainStorage[options.service] = { username, password };
        return Promise.resolve(true);
    }),
    resetGenericPassword: jest.fn(async (options: { service: string }) => {
        delete mockKeychainStorage[options.service];
        return Promise.resolve(true);
    }),
}));

// ===== Test Helpers =====

/**
 * Resets the mock keychain storage to ensure test isolation
 */
function resetKeychainStorage(): void {
    Object.keys(mockKeychainStorage).forEach((key) => {
        delete mockKeychainStorage[key];
    });
}

// ===== Plugin Configuration =====

const keychainPlugin = observablePersistKeychain();
const mySynced = configureSynced(synced, {
    persist: {
        plugin: keychainPlugin,
    },
});

describe('Keychain Persistence Plugin Tests', () => {
    beforeEach(() => {
        resetKeychainStorage();
        jest.clearAllMocks();
    });

    describe('Basic Persistence', () => {
        test('Plugin has required methods', () => {
            const plugin = observablePersistKeychain();

            // Verify all required plugin methods are available
            expect(typeof plugin.initialize).toBe('function');
            expect(typeof plugin.loadTable).toBe('function');
            expect(typeof plugin.getTable).toBe('function');
            expect(typeof plugin.set).toBe('function');
            expect(typeof plugin.deleteTable).toBe('function');
            expect(typeof plugin.getMetadata).toBe('function');
            expect(typeof plugin.setMetadata).toBe('function');
        });

        test('Direct plugin usage', async () => {
            const plugin = observablePersistKeychain();
            const persistName = getPersistName();

            // Test plugin methods directly with proper Change format
            await plugin.set(persistName, [
                {
                    path: [],
                    pathTypes: [],
                    valueAtPath: { test: 'hello' },
                    prevAtPath: undefined,
                },
            ]);

            // Verify data was saved to mock storage
            const stored = mockKeychainStorage[persistName];
            expect(stored).toBeDefined();
            expect(stored.username).toBe(persistName);
            expect(JSON.parse(stored.password)).toEqual({ test: 'hello' });
        });

        test('Save and load objects', async () => {
            const persistName = getPersistName();
            const obs = observable({ test: '' });

            const state = syncObservable(
                obs,
                mySynced({
                    persist: { name: persistName },
                }),
            );

            await when(state.isPersistLoaded);

            // Update value and verify persistence
            obs.set({ test: 'hello' });
            await promiseTimeout(150);

            // Verify saved to keychain
            const stored = mockKeychainStorage[persistName];
            expect(stored).toBeDefined();
            expect(stored.username).toBe(persistName);
            expect(JSON.parse(stored.password)).toEqual({ test: 'hello' });

            // Verify loading in new observable
            const obs2 = observable({});
            const state2 = syncObservable(
                obs2,
                mySynced({
                    persist: { name: persistName },
                }),
            );

            await when(state2.isPersistLoaded);
            expect(obs2.get()).toEqual({ test: 'hello' });
        });

        test('Save and load primitives', async () => {
            const persistName = getPersistName();
            const obs = observable('');

            const state = syncObservable(
                obs,
                mySynced({
                    persist: { name: persistName },
                }),
            );

            await when(state.isPersistLoaded);

            // Update primitive value
            obs.set('hello');
            await promiseTimeout(150);

            // Verify persistence
            const stored = mockKeychainStorage[persistName];
            expect(stored).toBeDefined();
            expect(JSON.parse(stored.password)).toBe('hello');

            // Verify loading
            const obs2 = observable();
            const state2 = syncObservable(
                obs2,
                mySynced({
                    persist: { name: persistName },
                }),
            );

            await when(state2.isPersistLoaded);
            expect(obs2.get()).toEqual('hello');
        });

        test('Load from pre-populated keychain', async () => {
            const persistName = getPersistName();

            // Pre-populate keychain with data
            mockKeychainStorage[persistName] = {
                username: persistName,
                password: JSON.stringify({ preloaded: 'data' }),
            };

            const obs = observable({});
            const state = syncObservable(
                obs,
                mySynced({
                    persist: { name: persistName },
                }),
            );

            await when(state.isPersistLoaded);
            expect(obs.get()).toEqual({ preloaded: 'data' });
        });

        test('Handle empty keychain gracefully', async () => {
            const persistName = getPersistName();
            const obs = observable({ default: 'value' });

            const state = syncObservable(
                obs,
                mySynced({
                    persist: { name: persistName },
                }),
            );

            await when(state.isPersistLoaded);

            // Should maintain initial value when keychain is empty
            expect(obs.get()).toEqual({ default: 'value' });
        });
    });

    describe('Complex Data Types', () => {
        test('Nested objects persistence', async () => {
            const persistName = getPersistName();
            const obs = observable({
                user: {
                    profile: {
                        name: 'John',
                        settings: {
                            theme: 'dark',
                            notifications: true,
                        },
                    },
                    preferences: {
                        language: 'en',
                    },
                },
            });

            const state = syncObservable(
                obs,
                mySynced({
                    persist: { name: persistName },
                }),
            );

            await when(state.isPersistLoaded);

            // Modify nested properties
            obs.user.profile.settings.theme.set('light');
            obs.user.preferences.language.set('es');

            await promiseTimeout(150);

            // Verify persistence
            const stored = mockKeychainStorage[persistName];
            expect(stored).toBeDefined();
            const savedData = JSON.parse(stored.password);
            expect(savedData.user.profile.settings.theme).toBe('light');
            expect(savedData.user.preferences.language).toBe('es');

            // Verify loading
            const obs2 = observable({});
            const state2 = syncObservable(
                obs2,
                mySynced({
                    persist: { name: persistName },
                }),
            );

            await when(state2.isPersistLoaded);

            const result = obs2.get() as any;
            expect(result.user.profile.settings.theme).toBe('light');
            expect(result.user.preferences.language).toBe('es');
        });

        test('Array persistence and modification', async () => {
            const persistName = getPersistName();
            const obs = observable({
                items: ['item1', 'item2'],
                numbers: [1, 2],
            });

            const state = syncObservable(
                obs,
                mySynced({
                    persist: { name: persistName },
                }),
            );

            await when(state.isPersistLoaded);

            // Modify arrays using set() for proper persistence tracking
            obs.items.set(['item1', 'item2', 'item3']);
            obs.numbers.set([1, 10, 3]);

            await promiseTimeout(150);

            // Verify persistence
            const stored = mockKeychainStorage[persistName];
            expect(stored).toBeDefined();
            const savedData = JSON.parse(stored.password);
            expect(savedData.items).toEqual(['item1', 'item2', 'item3']);
            expect(savedData.numbers).toEqual([1, 10, 3]);

            // Verify loading
            const obs2 = observable({});
            const state2 = syncObservable(
                obs2,
                mySynced({
                    persist: { name: persistName },
                }),
            );

            await when(state2.isPersistLoaded);

            expect(obs2.get()).toEqual({
                items: ['item1', 'item2', 'item3'],
                numbers: [1, 10, 3],
            });
        });

        test('Map persistence', async () => {
            const persistName = getPersistName();
            const obs = observable(new Map<string, string>());

            const state = syncObservable(
                obs,
                mySynced({
                    persist: { name: persistName },
                }),
            );

            await when(state.isPersistLoaded);

            // Add entries to Map
            obs.set('key1', 'value1');
            obs.set('key2', 'value2');

            await promiseTimeout(150);

            // Verify persistence - Maps are serialized as plain objects
            const stored = mockKeychainStorage[persistName];
            expect(stored).toBeDefined();
            const savedData = JSON.parse(stored.password);
            expect(savedData.key1).toBe('value1');
            expect(savedData.key2).toBe('value2');

            // Verify loading
            const obs2 = observable(new Map<string, string>());
            const state2 = syncObservable(
                obs2,
                mySynced({
                    persist: { name: persistName },
                }),
            );

            await when(state2.isPersistLoaded);

            const result = obs2.get();
            expect(result.has('key1')).toBe(true);
            expect(result.has('key2')).toBe(true);
            expect(result.get('key1')).toBe('value1');
            expect(result.get('key2')).toBe('value2');
        });

        test('Set persistence', async () => {
            const persistName = getPersistName();
            const obs = observable(new Set<string>());

            const state = syncObservable(
                obs,
                mySynced({
                    persist: { name: persistName },
                }),
            );

            await when(state.isPersistLoaded);

            // Add items to Set
            obs.add('item1');
            obs.add('item2');

            await promiseTimeout(150);

            // Verify persistence - Sets use special __LSType format
            const stored = mockKeychainStorage[persistName];
            expect(stored).toBeDefined();
            const savedData = JSON.parse(stored.password);
            expect(savedData).toEqual({
                __LSType: 'Set',
                value: ['item1', 'item2'],
            });

            // Verify loading
            const obs2 = observable(new Set<string>());
            const state2 = syncObservable(
                obs2,
                mySynced({
                    persist: { name: persistName },
                }),
            );

            await when(state2.isPersistLoaded);

            expect(obs2.get()).toEqual(new Set(['item1', 'item2']));
        });

        test('Array of objects persistence', async () => {
            const persistName = getPersistName();
            const obs = observable({
                users: [
                    { id: 1, name: 'Alice', active: true },
                    { id: 2, name: 'Bob', active: false },
                ],
            });

            const state = syncObservable(
                obs,
                mySynced({
                    persist: { name: persistName },
                }),
            );

            await when(state.isPersistLoaded);

            // Update array using set() for proper persistence
            obs.users.set([
                { id: 1, name: 'Alice', active: true },
                { id: 2, name: 'Bob', active: true }, // changed
                { id: 3, name: 'Charlie', active: true }, // new
            ]);

            await promiseTimeout(150);

            // Verify persistence
            const stored = mockKeychainStorage[persistName];
            expect(stored).toBeDefined();
            const savedData = JSON.parse(stored.password);
            expect(savedData.users).toEqual([
                { id: 1, name: 'Alice', active: true },
                { id: 2, name: 'Bob', active: true },
                { id: 3, name: 'Charlie', active: true },
            ]);

            // Verify loading
            const obs2 = observable({});
            const state2 = syncObservable(
                obs2,
                mySynced({
                    persist: { name: persistName },
                }),
            );

            await when(state2.isPersistLoaded);

            expect(obs2.get()).toEqual({
                users: [
                    { id: 1, name: 'Alice', active: true },
                    { id: 2, name: 'Bob', active: true },
                    { id: 3, name: 'Charlie', active: true },
                ],
            });
        });
    });

    describe('Data Deletion', () => {
        test('Delete object properties', async () => {
            const persistName = getPersistName();
            const obs = observable({
                name: 'John',
                age: 30,
                email: 'john@example.com',
            } as any);

            const state = syncObservable(
                obs,
                mySynced({
                    persist: { name: persistName },
                }),
            );

            await when(state.isPersistLoaded);

            // Delete property by setting object without it
            obs.set({
                name: 'John',
                age: 30,
                // email property removed
            });

            await promiseTimeout(150);

            // Verify deletion was persisted
            const stored = mockKeychainStorage[persistName];
            expect(stored).toBeDefined();
            const savedData = JSON.parse(stored.password);
            expect(savedData).toEqual({
                name: 'John',
                age: 30,
            });
            expect(savedData.email).toBeUndefined();

            // Verify loading without deleted property
            const obs2 = observable({} as any);
            const state2 = syncObservable(
                obs2,
                mySynced({
                    persist: { name: persistName },
                }),
            );

            await when(state2.isPersistLoaded);
            expect(obs2.get()).toEqual({
                name: 'John',
                age: 30,
            });
        });

        test('Set property to undefined', async () => {
            const persistName = getPersistName();
            const obs = observable({
                name: 'John',
                age: 30,
                status: 'active',
            } as any);

            const state = syncObservable(
                obs,
                mySynced({
                    persist: { name: persistName },
                }),
            );

            await when(state.isPersistLoaded);

            // Set property to undefined
            obs.set({
                name: 'John',
                age: 30,
                status: undefined,
            });

            await promiseTimeout(150);

            // Verify undefined value is persisted
            const stored = mockKeychainStorage[persistName];
            expect(stored).toBeDefined();
            const savedData = JSON.parse(stored.password);
            expect(savedData).toEqual({
                name: 'John',
                age: 30,
                status: undefined,
            });

            // Verify loading with undefined value
            const obs2 = observable({} as any);
            const state2 = syncObservable(
                obs2,
                mySynced({
                    persist: { name: persistName },
                }),
            );

            await when(state2.isPersistLoaded);
            expect(obs2.get()).toEqual({
                name: 'John',
                age: 30,
                status: undefined,
            });
        });

        test('Clear entire object', async () => {
            const persistName = getPersistName();
            const obs = observable({
                name: 'John',
                age: 30,
                preferences: {
                    theme: 'dark',
                    notifications: true,
                },
            } as any);

            const state = syncObservable(
                obs,
                mySynced({
                    persist: { name: persistName },
                }),
            );

            await when(state.isPersistLoaded);

            // Clear/reset the entire object
            obs.set({});

            await promiseTimeout(150);

            // Verify empty object is persisted
            const stored = mockKeychainStorage[persistName];
            expect(stored).toBeDefined();
            const savedData = JSON.parse(stored.password);
            expect(savedData).toEqual({});

            // Verify loading empty object
            const obs2 = observable({} as any);
            const state2 = syncObservable(
                obs2,
                mySynced({
                    persist: { name: persistName },
                }),
            );

            await when(state2.isPersistLoaded);
            expect(obs2.get()).toEqual({});
        });

        test('Remove array elements', async () => {
            const persistName = getPersistName();
            const obs = observable({
                items: ['apple', 'banana', 'cherry', 'date'],
            });

            const state = syncObservable(
                obs,
                mySynced({
                    persist: { name: persistName },
                }),
            );

            await when(state.isPersistLoaded);

            // Remove elements by setting new array
            obs.items.set(['apple', 'cherry']); // Remove banana and date

            await promiseTimeout(150);

            // Verify modified array is persisted
            const stored = mockKeychainStorage[persistName];
            expect(stored).toBeDefined();
            const savedData = JSON.parse(stored.password);
            expect(savedData).toEqual({
                items: ['apple', 'cherry'],
            });

            // Verify loading modified array
            const obs2 = observable({});
            const state2 = syncObservable(
                obs2,
                mySynced({
                    persist: { name: persistName },
                }),
            );

            await when(state2.isPersistLoaded);
            expect(obs2.get()).toEqual({
                items: ['apple', 'cherry'],
            });
        });

        test('Clear array completely', async () => {
            const persistName = getPersistName();
            const obs = observable({
                todos: [
                    { id: 1, text: 'Task 1' },
                    { id: 2, text: 'Task 2' },
                    { id: 3, text: 'Task 3' },
                ],
            });

            const state = syncObservable(
                obs,
                mySynced({
                    persist: { name: persistName },
                }),
            );

            await when(state.isPersistLoaded);

            // Clear the array
            obs.todos.set([]);

            await promiseTimeout(150);

            // Verify empty array is persisted
            const stored = mockKeychainStorage[persistName];
            expect(stored).toBeDefined();
            const savedData = JSON.parse(stored.password);
            expect(savedData).toEqual({
                todos: [],
            });

            // Verify loading empty array
            const obs2 = observable({});
            const state2 = syncObservable(
                obs2,
                mySynced({
                    persist: { name: persistName },
                }),
            );

            await when(state2.isPersistLoaded);
            expect(obs2.get()).toEqual({
                todos: [],
            });
        });
    });
    describe('Error Handling and Edge Cases', () => {
        test('Handle keychain read errors gracefully', async () => {
            const persistName = getPersistName();
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            // Configure mock to simulate keychain access error
            const { hasGenericPassword, getGenericPassword } = jest.requireMock('react-native-keychain');
            hasGenericPassword.mockResolvedValueOnce(true);
            getGenericPassword.mockRejectedValueOnce(new Error('Keychain access denied'));

            const obs = observable({ test: 'initial' });
            const state = syncObservable(
                obs,
                mySynced({
                    persist: { name: persistName },
                }),
            );

            await when(state.isPersistLoaded);

            // Should handle error gracefully and maintain initial value
            expect(obs.get()).toEqual({ test: 'initial' });
            expect(consoleSpy).toHaveBeenCalledWith(
                '[legend-state] Keychain.getGenericPassword failed',
                persistName,
                expect.any(Error),
            );

            consoleSpy.mockRestore();
        });

        test('Handle keychain save errors gracefully', async () => {
            const persistName = getPersistName();
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            const obs = observable({ test: 'initial' });
            const state = syncObservable(
                obs,
                mySynced({
                    persist: { name: persistName },
                }),
            );

            await when(state.isPersistLoaded);

            // Verify save operations don't crash on errors
            obs.set({ test: 'updated' });
            await promiseTimeout(150);

            // Application should continue functioning
            expect(obs.get()).toEqual({ test: 'updated' });

            consoleSpy.mockRestore();
        });

        test('Handle invalid JSON data gracefully', async () => {
            const persistName = getPersistName();
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            // Pre-populate keychain with invalid JSON
            mockKeychainStorage[persistName] = {
                username: persistName,
                password: 'invalid json {',
            };

            const { hasGenericPassword, getGenericPassword } = jest.requireMock('react-native-keychain');
            hasGenericPassword.mockResolvedValueOnce(true);
            getGenericPassword.mockResolvedValueOnce(mockKeychainStorage[persistName]);

            const obs = observable({ default: 'value' });
            const state = syncObservable(
                obs,
                mySynced({
                    persist: { name: persistName },
                }),
            );

            await when(state.isPersistLoaded);

            // Should handle parse error and maintain initial value
            expect(obs.get()).toEqual({ default: 'value' });
            expect(consoleSpy).toHaveBeenCalledWith(
                '[legend-state] ObservablePersistKeychain failed to parse',
                persistName,
                expect.any(Error),
            );

            consoleSpy.mockRestore();
        });

        test('Handle keychain deletion errors', async () => {
            const persistName = getPersistName();
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            // Pre-populate keychain with data
            mockKeychainStorage[persistName] = {
                username: persistName,
                password: JSON.stringify({ test: 'data' }),
            };

            // Configure mock to simulate deletion error
            const { resetGenericPassword } = jest.requireMock('react-native-keychain');
            resetGenericPassword.mockRejectedValueOnce(new Error('Keychain reset failed'));

            const plugin = observablePersistKeychain();
            await plugin.initialize();

            // Attempt to delete table - should handle error gracefully
            await plugin.deleteTable(persistName);

            expect(consoleSpy).toHaveBeenCalledWith(
                '[legend-state] ObservablePersistKeychain failed to delete table',
                persistName,
                expect.any(Error),
            );

            consoleSpy.mockRestore();
        });

        test('Handle corrupted data recovery', async () => {
            const persistName = getPersistName();
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            // Pre-populate with corrupted data
            mockKeychainStorage[persistName] = {
                username: persistName,
                password: 'corrupted data that will fail to parse',
            };

            const obs = observable({ fallback: 'value' } as any);
            const state = syncObservable(
                obs,
                mySynced({
                    persist: { name: persistName },
                }),
            );

            await when(state.isPersistLoaded);

            // Should recover with fallback value
            expect(obs.get()).toEqual({ fallback: 'value' });

            // Should be able to save valid data after corruption
            obs.set({ recovered: 'data' } as any);
            await promiseTimeout(150);

            const stored = mockKeychainStorage[persistName];
            expect(stored).toBeDefined();
            expect(JSON.parse(stored.password)).toEqual({ recovered: 'data' });

            consoleSpy.mockRestore();
        });

        test('Handle various edge case data formats', async () => {
            const persistName = getPersistName();

            const testCases = ['null', '""', '{}', '[]'];

            for (const password of testCases) {
                resetKeychainStorage();
                mockKeychainStorage[persistName] = {
                    username: persistName,
                    password,
                };

                const obs = observable({ default: 'initial' });
                const state = syncObservable(
                    obs,
                    mySynced({
                        persist: { name: persistName },
                    }),
                );

                await when(state.isPersistLoaded);

                // Should handle each case without crashing
                expect(obs.get()).toBeDefined();
            }
        });
    });

    describe('Configuration Options', () => {
        test('Custom onError callback', async () => {
            const persistName = getPersistName();
            const onErrorSpy = jest.fn();

            // Create plugin with custom error handler
            const pluginWithError = observablePersistKeychain({
                onError: onErrorSpy,
            });

            const mySyncedWithError = configureSynced(synced, {
                persist: {
                    plugin: pluginWithError,
                },
            });

            // Simulate error condition
            const { hasGenericPassword } = jest.requireMock('react-native-keychain');
            hasGenericPassword.mockRejectedValueOnce(new Error('Custom error'));

            const obs = observable({ test: 'initial' });
            const state = syncObservable(
                obs,
                mySyncedWithError({
                    persist: { name: persistName },
                }),
            );

            await when(state.isPersistLoaded);

            // Should call custom error handler
            expect(onErrorSpy).toHaveBeenCalledWith(persistName, expect.any(Error), 'load');
        });

        test('Preload configuration', async () => {
            const persistName1 = getPersistName();
            const persistName2 = getPersistName();

            // Pre-populate keychain with data
            mockKeychainStorage[persistName1] = {
                username: persistName1,
                password: JSON.stringify({ preloaded1: 'data1' }),
            };
            mockKeychainStorage[persistName2] = {
                username: persistName2,
                password: JSON.stringify({ preloaded2: 'data2' }),
            };

            // Create plugin with preload option
            const pluginWithPreload = observablePersistKeychain({
                preload: [persistName1, persistName2],
            });

            // Initialize should preload data
            await pluginWithPreload.initialize();

            // Verify plugin initializes correctly with preload
            const table1Data = pluginWithPreload.getTable(persistName1, {});
            const table2Data = pluginWithPreload.getTable(persistName2, {});

            expect(table1Data).toBeDefined();
            expect(table2Data).toBeDefined();
        });

        test('Preload error handling', async () => {
            const persistName = getPersistName();
            const onErrorSpy = jest.fn();
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            // Configure mock to fail preload
            const { hasGenericPassword } = jest.requireMock('react-native-keychain');
            hasGenericPassword.mockRejectedValueOnce(new Error('Preload error'));

            // Create plugin with preload and error handler
            const pluginWithPreload = observablePersistKeychain({
                preload: [persistName],
                onError: onErrorSpy,
            });

            await pluginWithPreload.initialize();

            // Should handle preload error gracefully
            expect(onErrorSpy).toHaveBeenCalledWith(persistName, expect.any(Error), 'preload');
            expect(consoleSpy).toHaveBeenCalledWith(
                '[legend-state] ObservablePersistKeychain failed to preload table',
                persistName,
                expect.any(Error),
            );

            consoleSpy.mockRestore();
        });
    });
});
