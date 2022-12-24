[@legendapp/state](../README.md) / [Exports](../modules.md) / PersistOptionsLocal

# Interface: PersistOptionsLocal<T\>

## Type parameters

| Name | Type |
| :------ | :------ |
| `T` | `any` |

## Table of contents

### Properties

- [adjustData](PersistOptionsLocal.md#adjustdata)
- [fieldTransforms](PersistOptionsLocal.md#fieldtransforms)
- [indexedDB](PersistOptionsLocal.md#indexeddb)
- [mmkv](PersistOptionsLocal.md#mmkv)
- [name](PersistOptionsLocal.md#name)

## Properties

### adjustData

• `Optional` **adjustData**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `load?` | (`value`: `T`) => `T` \| `Promise`<`T`\> |
| `save?` | (`value`: `T`) => `T` \| `Promise`<`T`\> |

#### Defined in

[src/observableInterfaces.ts:159](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L159)

___

### fieldTransforms

• `Optional` **fieldTransforms**: [`FieldTransforms`](../modules.md#fieldtransforms)<`T`\>

#### Defined in

[src/observableInterfaces.ts:163](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L163)

___

### indexedDB

• `Optional` **indexedDB**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `itemID?` | `string` |
| `prefixID?` | `string` |

#### Defined in

[src/observableInterfaces.ts:165](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L165)

___

### mmkv

• `Optional` **mmkv**: `MMKVConfiguration`

#### Defined in

[src/observableInterfaces.ts:164](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L164)

___

### name

• **name**: `string`

#### Defined in

[src/observableInterfaces.ts:158](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L158)
