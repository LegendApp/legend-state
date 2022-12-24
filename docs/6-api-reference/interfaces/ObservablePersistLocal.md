[@legendapp/state](../README.md) / [Exports](../modules.md) / ObservablePersistLocal

# Interface: ObservablePersistLocal

## Hierarchy

- **`ObservablePersistLocal`**

  ↳ [`ObservablePersistLocalAsync`](ObservablePersistLocalAsync.md)

## Table of contents

### Methods

- [deleteTable](ObservablePersistLocal.md#deletetable)
- [getMetadata](ObservablePersistLocal.md#getmetadata)
- [getTable](ObservablePersistLocal.md#gettable)
- [getTableTransformed](ObservablePersistLocal.md#gettabletransformed)
- [initialize](ObservablePersistLocal.md#initialize)
- [loadTable](ObservablePersistLocal.md#loadtable)
- [set](ObservablePersistLocal.md#set)
- [updateMetadata](ObservablePersistLocal.md#updatemetadata)

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

#### Defined in

[src/observableInterfaces.ts:211](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L211)

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

#### Defined in

[src/observableInterfaces.ts:209](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L209)
