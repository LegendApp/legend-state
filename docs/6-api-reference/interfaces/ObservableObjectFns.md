[@legendapp/state](../README.md) / [Exports](../modules.md) / ObservableObjectFns

# Interface: ObservableObjectFns<T\>

## Type parameters

| Name |
| :------ |
| `T` |

## Hierarchy

- `ObservableBaseFns`<`T`\>

  ↳ **`ObservableObjectFns`**

## Table of contents

### Methods

- [[iterator]](ObservableObjectFns.md#[iterator])
- [assign](ObservableObjectFns.md#assign)
- [delete](ObservableObjectFns.md#delete)
- [get](ObservableObjectFns.md#get)
- [onChange](ObservableObjectFns.md#onchange)
- [peek](ObservableObjectFns.md#peek)
- [set](ObservableObjectFns.md#set)

## Methods

### [iterator]

▸ **[iterator]**(): `Iterator`<`ReactNode`, `any`, `undefined`\>

#### Returns

`Iterator`<`ReactNode`, `any`, `undefined`\>

#### Inherited from

ObservableBaseFns.\_\_@iterator@56

#### Defined in

node_modules/typescript/lib/lib.es2015.iterable.d.ts:51

___

### assign

▸ **assign**(`value`): [`ObservableChild`](../modules.md#observablechild)<`T`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `value` | `T` \| `Partial`<`T`\> |

#### Returns

[`ObservableChild`](../modules.md#observablechild)<`T`\>

#### Defined in

[src/observableInterfaces.ts:66](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L66)

___

### delete

▸ **delete**(): [`ObservableChild`](../modules.md#observablechild)<`T`\>

#### Returns

[`ObservableChild`](../modules.md#observablechild)<`T`\>

#### Defined in

[src/observableInterfaces.ts:67](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L67)

___

### get

▸ **get**(`trackingType?`): `T`

#### Parameters

| Name | Type |
| :------ | :------ |
| `trackingType?` | ``true`` |

#### Returns

`T`

#### Inherited from

ObservableBaseFns.get

#### Defined in

[src/observableInterfaces.ts:47](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L47)

___

### onChange

▸ **onChange**(`cb`, `trackingType?`): [`ObservableListenerDispose`](../modules.md#observablelistenerdispose)

#### Parameters

| Name | Type |
| :------ | :------ |
| `cb` | [`ListenerFn`](../modules.md#listenerfn)<`T`\> |
| `trackingType?` | ``true`` |

#### Returns

[`ObservableListenerDispose`](../modules.md#observablelistenerdispose)

#### Inherited from

ObservableBaseFns.onChange

#### Defined in

[src/observableInterfaces.ts:48](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L48)

___

### peek

▸ **peek**(): `T`

#### Returns

`T`

#### Inherited from

ObservableBaseFns.peek

#### Defined in

[src/observableInterfaces.ts:46](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L46)

___

### set

▸ **set**(`value`): [`ObservableChild`](../modules.md#observablechild)<`T`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `value` | `T` \| (`prev`: `T`) => `T` |

#### Returns

[`ObservableChild`](../modules.md#observablechild)<`T`\>

#### Defined in

[src/observableInterfaces.ts:65](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L65)
