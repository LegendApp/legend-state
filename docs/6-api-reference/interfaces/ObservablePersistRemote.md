[@legendapp/state](../README.md) / [Exports](../modules.md) / ObservablePersistRemote

# Interface: ObservablePersistRemote

## Table of contents

### Methods

- [listen](ObservablePersistRemote.md#listen)
- [save](ObservablePersistRemote.md#save)

## Methods

### listen

▸ **listen**<`T`\>(`obs`, `options`, `onLoad`, `onChange`): `void`

#### Type parameters

| Name |
| :------ |
| `T` |

#### Parameters

| Name | Type |
| :------ | :------ |
| `obs` | [`ObservableReadable`](../modules.md#observablereadable)<`T`\> |
| `options` | [`PersistOptions`](PersistOptions.md)<`T`\> |
| `onLoad` | () => `void` |
| `onChange` | (`cb`: () => `void`) => `void` |

#### Returns

`void`

#### Defined in

[src/observableInterfaces.ts:224](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L224)

___

### save

▸ **save**<`T`\>(`options`, `value`, `path`, `valueAtPath`, `prevAtPath`): `Promise`<`T`\>

#### Type parameters

| Name |
| :------ |
| `T` |

#### Parameters

| Name | Type |
| :------ | :------ |
| `options` | [`PersistOptions`](PersistOptions.md)<`T`\> |
| `value` | `T` |
| `path` | (`string` \| `number`)[] |
| `valueAtPath` | `any` |
| `prevAtPath` | `any` |

#### Returns

`Promise`<`T`\>

#### Defined in

[src/observableInterfaces.ts:217](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L217)
