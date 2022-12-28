[@legendapp/state](../README.md) / [Exports](../modules.md) / ObservablePrimitiveChildFns

# Interface: ObservablePrimitiveChildFns<T\>

## Type parameters

| Name |
| :------ |
| `T` |

## Hierarchy

- `ObservablePrimitiveFnsBase`<`T`\>

  ↳ **`ObservablePrimitiveChildFns`**

## Table of contents

### Methods

- [[iterator]](ObservablePrimitiveChildFns.md#[iterator])
- [delete](ObservablePrimitiveChildFns.md#delete)
- [get](ObservablePrimitiveChildFns.md#get)
- [onChange](ObservablePrimitiveChildFns.md#onchange)
- [peek](ObservablePrimitiveChildFns.md#peek)
- [set](ObservablePrimitiveChildFns.md#set)

## Methods

### [iterator]

▸ **[iterator]**(): `Iterator`<`ReactNode`, `any`, `undefined`\>

#### Returns

`Iterator`<`ReactNode`, `any`, `undefined`\>

#### Inherited from

ObservablePrimitiveFnsBase.\_\_@iterator@56

#### Defined in

node_modules/typescript/lib/lib.es2015.iterable.d.ts:51

___

### delete

▸ **delete**(): [`ObservablePrimitiveChild`](../modules.md#observableprimitivechild)<`T`\>

#### Returns

[`ObservablePrimitiveChild`](../modules.md#observableprimitivechild)<`T`\>

#### Defined in

[src/observableInterfaces.ts:62](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L62)

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

ObservablePrimitiveFnsBase.get

#### Defined in

[src/observableInterfaces.ts:47](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L47)

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

ObservablePrimitiveFnsBase.onChange

#### Defined in

[src/observableInterfaces.ts:48](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L48)

___

### peek

▸ **peek**(): `T`

#### Returns

`T`

#### Inherited from

ObservablePrimitiveFnsBase.peek

#### Defined in

[src/observableInterfaces.ts:46](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L46)

___

### set

▸ **set**(`value`): [`ObservablePrimitiveChild`](../modules.md#observableprimitivechild)<`T`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `value` | `T` \| (`prev`: `T`) => `T` |

#### Returns

[`ObservablePrimitiveChild`](../modules.md#observableprimitivechild)<`T`\>

#### Inherited from

ObservablePrimitiveFnsBase.set

#### Defined in

[src/observableInterfaces.ts:51](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L51)
