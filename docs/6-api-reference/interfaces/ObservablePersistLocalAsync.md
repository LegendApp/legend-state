[@legendapp/state](../README.md) / [Exports](../modules.md) / ObservablePersistLocalAsync

# Interface: ObservablePersistLocalAsync

## Hierarchy

- [`ObservablePersistLocal`](ObservablePersistLocal.md)

  ↳ **`ObservablePersistLocalAsync`**

## Table of contents

### Methods

- [deleteTable](ObservablePersistLocalAsync.md#deletetable)
- [getMetadata](ObservablePersistLocalAsync.md#getmetadata)
- [getTable](ObservablePersistLocalAsync.md#gettable)
- [getTableTransformed](ObservablePersistLocalAsync.md#gettabletransformed)
- [initialize](ObservablePersistLocalAsync.md#initialize)
- [loadTable](ObservablePersistLocalAsync.md#loadtable)
- [preload](ObservablePersistLocalAsync.md#preload)
- [set](ObservablePersistLocalAsync.md#set)
- [updateMetadata](ObservablePersistLocalAsync.md#updatemetadata)

## Methods

### deleteTable

▸ **deleteTable**(`table`, `config`): `Promise`<`void`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `table` | `string` |
| `config` | [`PersistOptionsLocal`](PersistOptionsLocal.md)<`any`\> |

#### Returns

`Promise`<`void`\>

#### Inherited from

[ObservablePersistLocal](ObservablePersistLocal.md).[deleteTable](ObservablePersistLocal.md#deletetable)

#### Defined in

[src/observableInterfaces.ts:210](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L210)

___

### getMetadata

▸ **getMetadata**(`table`, `config`): [`PersistMetadata`](PersistMetadata.md)

#### Parameters

| Name | Type |
| :------ | :------ |
| `table` | `string` |
| `config` | [`PersistOptionsLocal`](PersistOptionsLocal.md)<`any`\> |

#### Returns

[`PersistMetadata`](PersistMetadata.md)

#### Inherited from

[ObservablePersistLocal](ObservablePersistLocal.md).[getMetadata](ObservablePersistLocal.md#getmetadata)

#### Defined in

[src/observableInterfaces.ts:207](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L207)

___

### getTable

▸ **getTable**<`T`\>(`table`, `config`): `T`

#### Type parameters

| Name | Type |
| :------ | :------ |
| `T` | `any` |

#### Parameters

| Name | Type |
| :------ | :------ |
| `table` | `string` |
| `config` | [`PersistOptionsLocal`](PersistOptionsLocal.md)<`any`\> |

#### Returns

`T`

#### Inherited from

[ObservablePersistLocal](ObservablePersistLocal.md).[getTable](ObservablePersistLocal.md#gettable)

#### Defined in

[src/observableInterfaces.ts:205](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L205)

___

### getTableTransformed

▸ `Optional` **getTableTransformed**<`T`\>(`table`, `config`): `T`

#### Type parameters

| Name | Type |
| :------ | :------ |
| `T` | `any` |

#### Parameters

| Name | Type |
| :------ | :------ |
| `table` | `string` |
| `config` | [`PersistOptionsLocal`](PersistOptionsLocal.md)<`any`\> |

#### Returns

`T`

#### Inherited from

[ObservablePersistLocal](ObservablePersistLocal.md).[getTableTransformed](ObservablePersistLocal.md#gettabletransformed)

#### Defined in

[src/observableInterfaces.ts:206](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L206)

___

### initialize

▸ `Optional` **initialize**(`config`): `Promise`<`void`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `config` | `Object` |
| `config.indexedDB?` | `Object` |
| `config.indexedDB.databaseName` | `string` |
| `config.indexedDB.tableNames` | `string`[] |
| `config.indexedDB.version` | `number` |

#### Returns

`Promise`<`void`\>

#### Inherited from

[ObservablePersistLocal](ObservablePersistLocal.md).[initialize](ObservablePersistLocal.md#initialize)

#### Defined in

[src/observableInterfaces.ts:204](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L204)

___

### loadTable

▸ `Optional` **loadTable**(`table`, `config`): `void` \| `Promise`<`void`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `table` | `string` |
| `config` | [`PersistOptionsLocal`](PersistOptionsLocal.md)<`any`\> |

#### Returns

`void` \| `Promise`<`void`\>

#### Inherited from

[ObservablePersistLocal](ObservablePersistLocal.md).[loadTable](ObservablePersistLocal.md#loadtable)

#### Defined in

[src/observableInterfaces.ts:211](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L211)

___

### preload

▸ **preload**(`path`): `Promise`<`void`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `path` | `string` |

#### Returns

`Promise`<`void`\>

#### Defined in

[src/observableInterfaces.ts:214](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L214)

___

### set

▸ **set**(`table`, `value`, `changes`, `config`): `Promise`<`void`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `table` | `string` |
| `value` | `any` |
| `changes` | [`Change`](Change.md)[] |
| `config` | [`PersistOptionsLocal`](PersistOptionsLocal.md)<`any`\> |

#### Returns

`Promise`<`void`\>

#### Inherited from

[ObservablePersistLocal](ObservablePersistLocal.md).[set](ObservablePersistLocal.md#set)

#### Defined in

[src/observableInterfaces.ts:208](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L208)

___

### updateMetadata

▸ **updateMetadata**(`table`, `metadata`, `config`): `Promise`<`void`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `table` | `string` |
| `metadata` | [`PersistMetadata`](PersistMetadata.md) |
| `config` | [`PersistOptionsLocal`](PersistOptionsLocal.md)<`any`\> |

#### Returns

`Promise`<`void`\>

#### Inherited from

[ObservablePersistLocal](ObservablePersistLocal.md).[updateMetadata](ObservablePersistLocal.md#updatemetadata)

#### Defined in

[src/observableInterfaces.ts:209](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L209)
