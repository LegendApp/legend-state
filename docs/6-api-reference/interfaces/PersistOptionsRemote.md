[@legendapp/state](../README.md) / [Exports](../modules.md) / PersistOptionsRemote

# Interface: PersistOptionsRemote<T\>

## Type parameters

| Name | Type |
| :------ | :------ |
| `T` | `any` |

## Table of contents

### Properties

- [adjustData](PersistOptionsRemote.md#adjustdata)
- [firebase](PersistOptionsRemote.md#firebase)
- [manual](PersistOptionsRemote.md#manual)
- [once](PersistOptionsRemote.md#once)
- [readonly](PersistOptionsRemote.md#readonly)
- [requireAuth](PersistOptionsRemote.md#requireauth)
- [saveTimeout](PersistOptionsRemote.md#savetimeout)
- [waitForLoad](PersistOptionsRemote.md#waitforload)
- [waitForSave](PersistOptionsRemote.md#waitforsave)

## Properties

### adjustData

• `Optional` **adjustData**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `load?` | (`value`: `T`, `basePath`: `string`) => `T` \| `Promise`<`T`\> |
| `save?` | (`value`: `T`, `basePath`: `string`, `path`: `string`[]) => `T` \| `Promise`<`T`\> |

#### Defined in

[src/observableInterfaces.ts:178](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L178)

___

### firebase

• `Optional` **firebase**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `fieldTransforms?` | [`FieldTransforms`](../modules.md#fieldtransforms)<`T`\> |
| `ignoreKeys?` | `string`[] |
| `queryByModified?` | [`QueryByModified`](../modules.md#querybymodified)<`T`\> |
| `syncPath` | (`uid`: `string`) => \`/${string}/\` |

#### Defined in

[src/observableInterfaces.ts:182](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L182)

___

### manual

• `Optional` **manual**: `boolean`

#### Defined in

[src/observableInterfaces.ts:177](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L177)

___

### once

• `Optional` **once**: `boolean`

#### Defined in

[src/observableInterfaces.ts:172](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L172)

___

### readonly

• `Optional` **readonly**: `boolean`

#### Defined in

[src/observableInterfaces.ts:171](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L171)

___

### requireAuth

• `Optional` **requireAuth**: `boolean`

#### Defined in

[src/observableInterfaces.ts:173](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L173)

___

### saveTimeout

• `Optional` **saveTimeout**: `number`

#### Defined in

[src/observableInterfaces.ts:174](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L174)

___

### waitForLoad

• `Optional` **waitForLoad**: `Promise`<`any`\>

#### Defined in

[src/observableInterfaces.ts:175](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L175)

___

### waitForSave

• `Optional` **waitForSave**: `Promise`<`any`\> \| (`value`: `T`) => `Promise`<`any`\>

#### Defined in

[src/observableInterfaces.ts:176](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L176)
