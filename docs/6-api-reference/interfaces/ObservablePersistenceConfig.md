[@legendapp/state](../README.md) / [Exports](../modules.md) / ObservablePersistenceConfig

# Interface: ObservablePersistenceConfig

## Table of contents

### Properties

- [dateModifiedKey](ObservablePersistenceConfig.md#datemodifiedkey)
- [persistLocal](ObservablePersistenceConfig.md#persistlocal)
- [persistLocalOptions](ObservablePersistenceConfig.md#persistlocaloptions)
- [persistRemote](ObservablePersistenceConfig.md#persistremote)
- [saveTimeout](ObservablePersistenceConfig.md#savetimeout)

## Properties

### dateModifiedKey

• `Optional` **dateModifiedKey**: `string`

#### Defined in

[src/observableInterfaces.ts:383](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L383)

___

### persistLocal

• `Optional` **persistLocal**: [`ClassConstructor`](../modules.md#classconstructor)<[`ObservablePersistLocal`](ObservablePersistLocal.md), `any`[]\>

#### Defined in

[src/observableInterfaces.ts:373](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L373)

___

### persistLocalOptions

• `Optional` **persistLocalOptions**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `indexedDB?` | { `databaseName`: `string` ; `tableNames`: `string`[] ; `version`: `number`  } |
| `indexedDB.databaseName` | `string` |
| `indexedDB.tableNames` | `string`[] |
| `indexedDB.version` | `number` |

#### Defined in

[src/observableInterfaces.ts:375](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L375)

___

### persistRemote

• `Optional` **persistRemote**: [`ClassConstructor`](../modules.md#classconstructor)<[`ObservablePersistRemote`](ObservablePersistRemote.md), `any`[]\>

#### Defined in

[src/observableInterfaces.ts:374](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L374)

___

### saveTimeout

• `Optional` **saveTimeout**: `number`

#### Defined in

[src/observableInterfaces.ts:382](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L382)
