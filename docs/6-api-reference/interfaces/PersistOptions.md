[@legendapp/state](../README.md) / [Exports](../modules.md) / PersistOptions

# Interface: PersistOptions<T\>

## Type parameters

| Name | Type |
| :------ | :------ |
| `T` | `any` |

## Table of contents

### Properties

- [dateModifiedKey](PersistOptions.md#datemodifiedkey)
- [local](PersistOptions.md#local)
- [persistLocal](PersistOptions.md#persistlocal)
- [persistRemote](PersistOptions.md#persistremote)
- [remote](PersistOptions.md#remote)

## Properties

### dateModifiedKey

• `Optional` **dateModifiedKey**: `string`

#### Defined in

[src/observableInterfaces.ts:194](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L194)

___

### local

• `Optional` **local**: `string` \| [`PersistOptionsLocal`](PersistOptionsLocal.md)<`T`\>

#### Defined in

[src/observableInterfaces.ts:190](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L190)

___

### persistLocal

• `Optional` **persistLocal**: [`ClassConstructor`](../modules.md#classconstructor)<[`ObservablePersistLocal`](ObservablePersistLocal.md), `any`[]\>

#### Defined in

[src/observableInterfaces.ts:192](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L192)

___

### persistRemote

• `Optional` **persistRemote**: [`ClassConstructor`](../modules.md#classconstructor)<[`ObservablePersistRemote`](ObservablePersistRemote.md), `any`[]\>

#### Defined in

[src/observableInterfaces.ts:193](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L193)

___

### remote

• `Optional` **remote**: [`PersistOptionsRemote`](PersistOptionsRemote.md)<`T`\>

#### Defined in

[src/observableInterfaces.ts:191](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L191)
