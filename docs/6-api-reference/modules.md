[@legendapp/state](README.md) / Exports

# @legendapp/state

## Table of contents

### Interfaces

- [Change](interfaces/Change.md)
- [ChildNodeValue](interfaces/ChildNodeValue.md)
- [ObservableArrayOverride](interfaces/ObservableArrayOverride.md)
- [ObservableBaseFns](interfaces/ObservableBaseFns.md)
- [ObservableEvent](interfaces/ObservableEvent.md)
- [ObservableObjectFns](interfaces/ObservableObjectFns.md)
- [ObservablePersistLocal](interfaces/ObservablePersistLocal.md)
- [ObservablePersistLocalAsync](interfaces/ObservablePersistLocalAsync.md)
- [ObservablePersistRemote](interfaces/ObservablePersistRemote.md)
- [ObservablePersistState](interfaces/ObservablePersistState.md)
- [ObservablePersistenceConfig](interfaces/ObservablePersistenceConfig.md)
- [ObservablePrimitiveChildFns](interfaces/ObservablePrimitiveChildFns.md)
- [ObservableWrapper](interfaces/ObservableWrapper.md)
- [ObserveEvent](interfaces/ObserveEvent.md)
- [ObserveEventCallback](interfaces/ObserveEventCallback.md)
- [PersistMetadata](interfaces/PersistMetadata.md)
- [PersistOptions](interfaces/PersistOptions.md)
- [PersistOptionsLocal](interfaces/PersistOptionsLocal.md)
- [PersistOptionsRemote](interfaces/PersistOptionsRemote.md)
- [RootNodeValue](interfaces/RootNodeValue.md)

### Type Aliases

- [ArrayValue](modules.md#arrayvalue)
- [ClassConstructor](modules.md#classconstructor)
- [FieldTransforms](modules.md#fieldtransforms)
- [FieldTransformsInner](modules.md#fieldtransformsinner)
- [ListenerFn](modules.md#listenerfn)
- [NodeValue](modules.md#nodevalue)
- [NotPrimitive](modules.md#notprimitive)
- [Observable](modules.md#observable)
- [ObservableArray](modules.md#observablearray)
- [ObservableChild](modules.md#observablechild)
- [ObservableComputed](modules.md#observablecomputed)
- [ObservableFns](modules.md#observablefns)
- [ObservableListenerDispose](modules.md#observablelistenerdispose)
- [ObservableObject](modules.md#observableobject)
- [ObservableObjectOrArray](modules.md#observableobjectorarray)
- [ObservablePrimitive](modules.md#observableprimitive)
- [ObservablePrimitiveChild](modules.md#observableprimitivechild)
- [ObservablePrimitiveFns](modules.md#observableprimitivefns)
- [ObservableReadable](modules.md#observablereadable)
- [ObservableWriteable](modules.md#observablewriteable)
- [OpaqueObject](modules.md#opaqueobject)
- [Primitive](modules.md#primitive)
- [QueryByModified](modules.md#querybymodified)
- [RecordValue](modules.md#recordvalue)
- [Selector](modules.md#selector)
- [TrackingType](modules.md#trackingtype)

### Variables

- [dateModifiedKey](modules.md#datemodifiedkey)
- [extraPrimitiveProps](modules.md#extraprimitiveprops)
- [symbolDateModified](modules.md#symboldatemodified)
- [symbolDelete](modules.md#symboldelete)
- [symbolIsEvent](modules.md#symbolisevent)
- [symbolIsObservable](modules.md#symbolisobservable)
- [symbolUndef](modules.md#symbolundef)
- [tracking](modules.md#tracking)

### Functions

- [ObservablePrimitiveClass](modules.md#observableprimitiveclass)
- [batch](modules.md#batch)
- [beginBatch](modules.md#beginbatch)
- [beginTracking](modules.md#begintracking)
- [clone](modules.md#clone)
- [computeSelector](modules.md#computeselector)
- [computed](modules.md#computed)
- [constructObject](modules.md#constructobject)
- [deconstructObject](modules.md#deconstructobject)
- [endBatch](modules.md#endbatch)
- [endTracking](modules.md#endtracking)
- [event](modules.md#event)
- [getNode](modules.md#getnode)
- [getNodeValue](modules.md#getnodevalue)
- [getObservableIndex](modules.md#getobservableindex)
- [isArray](modules.md#isarray)
- [isBoolean](modules.md#isboolean)
- [isEmpty](modules.md#isempty)
- [isFunction](modules.md#isfunction)
- [isObject](modules.md#isobject)
- [isObservable](modules.md#isobservable)
- [isPrimitive](modules.md#isprimitive)
- [isPromise](modules.md#ispromise)
- [isString](modules.md#isstring)
- [isSymbol](modules.md#issymbol)
- [lockObservable](modules.md#lockobservable)
- [mergeIntoObservable](modules.md#mergeintoobservable)
- [observable](modules.md#observable-1)
- [observablePrimitive](modules.md#observableprimitive-1)
- [observe](modules.md#observe)
- [onChange](modules.md#onchange)
- [opaqueObject](modules.md#opaqueobject-1)
- [updateTracking](modules.md#updatetracking)
- [when](modules.md#when)

## Type Aliases

### ArrayValue

Ƭ **ArrayValue**<`T`\>: `T` extends infer t[] ? `t` : `never`

#### Type parameters

| Name |
| :------ |
| `T` |

#### Defined in

[src/observableInterfaces.ts:241](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L241)

___

### ClassConstructor

Ƭ **ClassConstructor**<`I`, `Args`\>: (...`args`: `Args`) => `I`

#### Type parameters

| Name | Type |
| :------ | :------ |
| `I` | `I` |
| `Args` | extends `any`[] = `any`[] |

#### Type declaration

• (`...args`)

##### Parameters

| Name | Type |
| :------ | :------ |
| `...args` | `Args` |

#### Defined in

[src/observableInterfaces.ts:287](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L287)

___

### FieldTransforms

Ƭ **FieldTransforms**<`T`\>: `T` extends `Record`<`string`, `Record`<`string`, `any`\>\> ? { `_dict`: [`FieldTransformsInner`](modules.md#fieldtransformsinner)<[`RecordValue`](modules.md#recordvalue)<`T`\>\>  } : `never` \| [`FieldTransformsInner`](modules.md#fieldtransformsinner)<`T`\>

#### Type parameters

| Name |
| :------ |
| `T` |

#### Defined in

[src/observableInterfaces.ts:269](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L269)

___

### FieldTransformsInner

Ƭ **FieldTransformsInner**<`T`\>: { [K in keyof T]: string } & { [K in keyof ObjectKeys<T\> as \`${K}\_obj\`]?: FieldTransforms<T[K]\> } \| { [K in keyof DictKeys<T\> as \`${K}\_dict\`]?: FieldTransforms<RecordValue<T[K]\>\> } & { [K in keyof ArrayKeys<T\> as \`${K}\_arr\`]?: FieldTransforms<ArrayValue<T[K]\>\> }

#### Type parameters

| Name |
| :------ |
| `T` |

#### Defined in

[src/observableInterfaces.ts:272](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L272)

___

### ListenerFn

Ƭ **ListenerFn**<`T`\>: (`value`: `T`, `getPrevious`: () => `T`, `changes`: { `path`: (`string` \| `number`)[] ; `prevAtPath`: `any` ; `valueAtPath`: `any`  }[], `node`: [`NodeValue`](modules.md#nodevalue)) => `void`

#### Type parameters

| Name | Type |
| :------ | :------ |
| `T` | `any` |

#### Type declaration

▸ (`value`, `getPrevious`, `changes`, `node`): `void`

##### Parameters

| Name | Type |
| :------ | :------ |
| `value` | `T` |
| `getPrevious` | () => `T` |
| `changes` | { `path`: (`string` \| `number`)[] ; `prevAtPath`: `any` ; `valueAtPath`: `any`  }[] |
| `node` | [`NodeValue`](modules.md#nodevalue) |

##### Returns

`void`

#### Defined in

[src/observableInterfaces.ts:91](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L91)

___

### NodeValue

Ƭ **NodeValue**: [`RootNodeValue`](interfaces/RootNodeValue.md) \| [`ChildNodeValue`](interfaces/ChildNodeValue.md)

#### Defined in

[src/observableInterfaces.ts:350](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L350)

___

### NotPrimitive

Ƭ **NotPrimitive**<`T`\>: `T` extends [`Primitive`](modules.md#primitive) ? `never` : `T`

#### Type parameters

| Name |
| :------ |
| `T` |

#### Defined in

[src/observableInterfaces.ts:297](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L297)

___

### Observable

Ƭ **Observable**<`T`\>: [`T`] extends [`object`] ? [`ObservableObjectOrArray`](modules.md#observableobjectorarray)<`T`\> : [`ObservablePrimitive`](modules.md#observableprimitive)<`T`\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `T` | `any` |

#### Defined in

[src/observableInterfaces.ts:313](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L313)

___

### ObservableArray

Ƭ **ObservableArray**<`T`\>: `Omit`<`T`, `ArrayOverrideFnNames`\> & [`ObservableObjectFns`](interfaces/ObservableObjectFns.md)<`T`\> & [`ObservableArrayOverride`](interfaces/ObservableArrayOverride.md)<[`ObservableObject`](modules.md#observableobject)<`T`[`number`]\>\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `T` | extends `any`[] |

#### Defined in

[src/observableInterfaces.ts:299](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L299)

___

### ObservableChild

Ƭ **ObservableChild**<`T`\>: [`T`] extends [[`Primitive`](modules.md#primitive)] ? [`ObservablePrimitiveChild`](modules.md#observableprimitivechild)<`T`\> : [`ObservableObject`](modules.md#observableobject)<`T`\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `T` | `any` |

#### Defined in

[src/observableInterfaces.ts:303](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L303)

___

### ObservableComputed

Ƭ **ObservableComputed**<`T`\>: `ObservableBaseFns`<`T`\> & `ObservableComputedFnsRecursive`<`T`\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `T` | `any` |

#### Defined in

[src/observableInterfaces.ts:312](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L312)

___

### ObservableFns

Ƭ **ObservableFns**<`T`\>: [`ObservablePrimitiveFns`](modules.md#observableprimitivefns)<`T`\> \| [`ObservableObjectFns`](interfaces/ObservableObjectFns.md)<`T`\>

#### Type parameters

| Name |
| :------ |
| `T` |

#### Defined in

[src/observableInterfaces.ts:69](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L69)

___

### ObservableListenerDispose

Ƭ **ObservableListenerDispose**: () => `void`

#### Type declaration

▸ (): `void`

##### Returns

`void`

#### Defined in

[src/observableInterfaces.ts:288](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L288)

___

### ObservableObject

Ƭ **ObservableObject**<`T`\>: `ObservableFnsRecursive`<`T`\> & [`ObservableObjectFns`](interfaces/ObservableObjectFns.md)<`T`\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `T` | `any` |

#### Defined in

[src/observableInterfaces.ts:302](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L302)

___

### ObservableObjectOrArray

Ƭ **ObservableObjectOrArray**<`T`\>: `T` extends `any`[] ? [`ObservableArray`](modules.md#observablearray)<`T`\> : [`ObservableObject`](modules.md#observableobject)<`T`\>

#### Type parameters

| Name |
| :------ |
| `T` |

#### Defined in

[src/observableInterfaces.ts:310](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L310)

___

### ObservablePrimitive

Ƭ **ObservablePrimitive**<`T`\>: [`ObservablePrimitiveFns`](modules.md#observableprimitivefns)<`T`\>

#### Type parameters

| Name |
| :------ |
| `T` |

#### Defined in

[src/observableInterfaces.ts:71](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L71)

___

### ObservablePrimitiveChild

Ƭ **ObservablePrimitiveChild**<`T`\>: [`T`] extends [`boolean`] ? [`ObservablePrimitiveChildFns`](interfaces/ObservablePrimitiveChildFns.md)<`T`\> & `ObservablePrimitiveFnsBoolean`<`T`\> : [`ObservablePrimitiveChildFns`](interfaces/ObservablePrimitiveChildFns.md)<`T`\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `T` | `any` |

#### Defined in

[src/observableInterfaces.ts:304](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L304)

___

### ObservablePrimitiveFns

Ƭ **ObservablePrimitiveFns**<`T`\>: [`T`] extends [`boolean`] ? `ObservablePrimitiveFnsBase`<`T`\> & `ObservablePrimitiveFnsBoolean`<`T`\> : `ObservablePrimitiveFnsBase`<`T`\>

#### Type parameters

| Name |
| :------ |
| `T` |

#### Defined in

[src/observableInterfaces.ts:57](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L57)

___

### ObservableReadable

Ƭ **ObservableReadable**<`T`\>: `ObservableBaseFns`<`T`\> \| `ObservablePrimitiveFnsBase`<`T`\> \| [`ObservablePrimitiveChildFns`](interfaces/ObservablePrimitiveChildFns.md)<`T`\> \| [`ObservableObjectFns`](interfaces/ObservableObjectFns.md)<`T`\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `T` | `any` |

#### Defined in

[src/observableInterfaces.ts:315](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L315)

___

### ObservableWriteable

Ƭ **ObservableWriteable**<`T`\>: `ObservablePrimitiveFnsBase`<`T`\> \| [`ObservablePrimitiveChildFns`](interfaces/ObservablePrimitiveChildFns.md)<`T`\> \| [`ObservableObjectFns`](interfaces/ObservableObjectFns.md)<`T`\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `T` | `any` |

#### Defined in

[src/observableInterfaces.ts:320](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L320)

___

### OpaqueObject

Ƭ **OpaqueObject**<`T`\>: `T` & { `[symbolOpaque]`: ``true``  }

#### Type parameters

| Name |
| :------ |
| `T` |

#### Defined in

[src/observableInterfaces.ts:73](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L73)

___

### Primitive

Ƭ **Primitive**: `boolean` \| `string` \| `number` \| `Date`

#### Defined in

[src/observableInterfaces.ts:296](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L296)

___

### QueryByModified

Ƭ **QueryByModified**<`T`\>: `boolean` \| { [K in keyof T]?: QueryByModified<T[K]\> }

#### Type parameters

| Name |
| :------ |
| `T` |

#### Defined in

[src/observableInterfaces.ts:145](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L145)

___

### RecordValue

Ƭ **RecordValue**<`T`\>: `T` extends `Record`<`string`, infer t\> ? `t` : `never`

#### Type parameters

| Name |
| :------ |
| `T` |

#### Defined in

[src/observableInterfaces.ts:240](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L240)

___

### Selector

Ƭ **Selector**<`T`\>: [`ObservableReadable`](modules.md#observablereadable)<`T`\> \| () => `T` \| `T`

#### Type parameters

| Name |
| :------ |
| `T` |

#### Defined in

[src/observableInterfaces.ts:285](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L285)

___

### TrackingType

Ƭ **TrackingType**: `undefined` \| ``true``

#### Defined in

[src/observableInterfaces.ts:40](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L40)

## Variables

### dateModifiedKey

• `Const` **dateModifiedKey**: ``"@"``

#### Defined in

[src/globals.ts:6](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/globals.ts#L6)

___

### extraPrimitiveProps

• `Const` **extraPrimitiveProps**: `Map`<`string` \| `Symbol`, `any`\>

#### Defined in

[src/globals.ts:19](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/globals.ts#L19)

___

### symbolDateModified

• `Const` **symbolDateModified**: typeof [`symbolDateModified`](modules.md#symboldatemodified)

#### Defined in

[src/globals.ts:7](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/globals.ts#L7)

___

### symbolDelete

• `Const` **symbolDelete**: typeof [`symbolDelete`](modules.md#symboldelete)

#### Defined in

[src/globals.ts:12](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/globals.ts#L12)

___

### symbolIsEvent

• `Const` **symbolIsEvent**: typeof [`symbolIsEvent`](modules.md#symbolisevent)

#### Defined in

[src/globals.ts:9](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/globals.ts#L9)

___

### symbolIsObservable

• `Const` **symbolIsObservable**: typeof [`symbolIsObservable`](modules.md#symbolisobservable)

#### Defined in

[src/globals.ts:8](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/globals.ts#L8)

___

### symbolUndef

• `Const` **symbolUndef**: typeof [`symbolUndef`](modules.md#symbolundef)

#### Defined in

[src/globals.ts:11](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/globals.ts#L11)

___

### tracking

• `Const` **tracking**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `current` | `TrackingState` |
| `inRemoteChange` | `boolean` |

#### Defined in

[src/tracking.ts:13](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/tracking.ts#L13)

## Functions

### ObservablePrimitiveClass

▸ **ObservablePrimitiveClass**<`T`\>(`this`, `node`): `void`

#### Type parameters

| Name |
| :------ |
| `T` |

#### Parameters

| Name | Type |
| :------ | :------ |
| `this` | [`ObservablePrimitiveFns`](modules.md#observableprimitivefns)<`T`\> & `ObservablePrimitiveState` |
| `node` | [`NodeValue`](modules.md#nodevalue) |

#### Returns

`void`

#### Defined in

[src/ObservablePrimitive.ts:20](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/ObservablePrimitive.ts#L20)

___

### batch

▸ **batch**(`fn`): `void`

#### Parameters

| Name | Type |
| :------ | :------ |
| `fn` | () => `void` |

#### Returns

`void`

#### Defined in

[src/batching.ts:53](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/batching.ts#L53)

___

### beginBatch

▸ **beginBatch**(): `void`

#### Returns

`void`

#### Defined in

[src/batching.ts:58](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/batching.ts#L58)

___

### beginTracking

▸ **beginTracking**(): `void`

#### Returns

`void`

#### Defined in

[src/tracking.ts:18](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/tracking.ts#L18)

___

### clone

▸ **clone**(`obj`): `any`

#### Parameters

| Name | Type |
| :------ | :------ |
| `obj` | `any` |

#### Returns

`any`

#### Defined in

[src/helpers.ts:108](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/helpers.ts#L108)

___

### computeSelector

▸ **computeSelector**<`T`\>(`selector`, `e?`): `any`

#### Type parameters

| Name |
| :------ |
| `T` |

#### Parameters

| Name | Type |
| :------ | :------ |
| `selector` | [`Selector`](modules.md#selector)<`T`\> |
| `e?` | [`ObserveEvent`](interfaces/ObserveEvent.md)<`T`\> |

#### Returns

`any`

#### Defined in

[src/helpers.ts:16](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/helpers.ts#L16)

___

### computed

▸ **computed**<`T`\>(`compute`): [`ObservableComputed`](modules.md#observablecomputed)<`T`\>

#### Type parameters

| Name |
| :------ |
| `T` |

#### Parameters

| Name | Type |
| :------ | :------ |
| `compute` | () => `T` \| `Promise`<`T`\> |

#### Returns

[`ObservableComputed`](modules.md#observablecomputed)<`T`\>

#### Defined in

[src/computed.ts:7](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/computed.ts#L7)

___

### constructObject

▸ **constructObject**(`path`, `value`): `object`

#### Parameters

| Name | Type |
| :------ | :------ |
| `path` | (`string` \| `number`)[] |
| `value` | `any` |

#### Returns

`object`

#### Defined in

[src/helpers.ts:84](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/helpers.ts#L84)

___

### deconstructObject

▸ **deconstructObject**(`path`, `value`): `object`

#### Parameters

| Name | Type |
| :------ | :------ |
| `path` | (`string` \| `number`)[] |
| `value` | `any` |

#### Returns

`object`

#### Defined in

[src/helpers.ts:99](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/helpers.ts#L99)

___

### endBatch

▸ **endBatch**(`force?`): `void`

#### Parameters

| Name | Type |
| :------ | :------ |
| `force?` | `boolean` |

#### Returns

`void`

#### Defined in

[src/batching.ts:65](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/batching.ts#L65)

___

### endTracking

▸ **endTracking**(): `void`

#### Returns

`void`

#### Defined in

[src/tracking.ts:25](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/tracking.ts#L25)

___

### event

▸ **event**(): [`ObservableEvent`](interfaces/ObservableEvent.md)

#### Returns

[`ObservableEvent`](interfaces/ObservableEvent.md)

#### Defined in

[src/event.ts:5](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/event.ts#L5)

___

### getNode

▸ **getNode**(`obs`): [`NodeValue`](modules.md#nodevalue)

#### Parameters

| Name | Type |
| :------ | :------ |
| `obs` | [`ObservableReadable`](modules.md#observablereadable)<`any`\> |

#### Returns

[`NodeValue`](modules.md#nodevalue)

#### Defined in

[src/helpers.ts:25](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/helpers.ts#L25)

___

### getNodeValue

▸ **getNodeValue**(`node`): `any`

#### Parameters

| Name | Type |
| :------ | :------ |
| `node` | [`NodeValue`](modules.md#nodevalue) |

#### Returns

`any`

#### Defined in

[src/globals.ts:39](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/globals.ts#L39)

___

### getObservableIndex

▸ **getObservableIndex**(`obs`): `number`

#### Parameters

| Name | Type |
| :------ | :------ |
| `obs` | [`ObservableReadable`](modules.md#observablereadable)<`any`\> |

#### Returns

`number`

#### Defined in

[src/helpers.ts:29](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/helpers.ts#L29)

___

### isArray

▸ **isArray**(`obj`): obj is any[]

#### Parameters

| Name | Type |
| :------ | :------ |
| `obj` | `unknown` |

#### Returns

obj is any[]

#### Defined in

[src/is.ts:3](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/is.ts#L3)

___

### isBoolean

▸ **isBoolean**(`obj`): obj is boolean

#### Parameters

| Name | Type |
| :------ | :------ |
| `obj` | `unknown` |

#### Returns

obj is boolean

#### Defined in

[src/is.ts:22](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/is.ts#L22)

___

### isEmpty

▸ **isEmpty**(`obj`): `boolean`

#### Parameters

| Name | Type |
| :------ | :------ |
| `obj` | `object` |

#### Returns

`boolean`

#### Defined in

[src/is.ts:28](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/is.ts#L28)

___

### isFunction

▸ **isFunction**(`obj`): obj is Function

#### Parameters

| Name | Type |
| :------ | :------ |
| `obj` | `unknown` |

#### Returns

obj is Function

#### Defined in

[src/is.ts:12](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/is.ts#L12)

___

### isObject

▸ **isObject**(`obj`): obj is Record<any, any\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `obj` | `unknown` |

#### Returns

obj is Record<any, any\>

#### Defined in

[src/is.ts:9](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/is.ts#L9)

___

### isObservable

▸ **isObservable**(`obs`): obs is ObservableObject<any\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `obs` | `any` |

#### Returns

obs is ObservableObject<any\>

#### Defined in

[src/helpers.ts:12](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/helpers.ts#L12)

___

### isPrimitive

▸ **isPrimitive**(`arg`): arg is string \| number \| bigint \| boolean \| symbol

#### Parameters

| Name | Type |
| :------ | :------ |
| `arg` | `unknown` |

#### Returns

arg is string \| number \| bigint \| boolean \| symbol

#### Defined in

[src/is.ts:15](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/is.ts#L15)

___

### isPromise

▸ **isPromise**<`T`\>(`obj`): obj is Promise<T\>

#### Type parameters

| Name |
| :------ |
| `T` |

#### Parameters

| Name | Type |
| :------ | :------ |
| `obj` | `unknown` |

#### Returns

obj is Promise<T\>

#### Defined in

[src/is.ts:25](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/is.ts#L25)

___

### isString

▸ **isString**(`obj`): obj is string

#### Parameters

| Name | Type |
| :------ | :------ |
| `obj` | `unknown` |

#### Returns

obj is string

#### Defined in

[src/is.ts:6](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/is.ts#L6)

___

### isSymbol

▸ **isSymbol**(`obj`): obj is symbol

#### Parameters

| Name | Type |
| :------ | :------ |
| `obj` | `unknown` |

#### Returns

obj is symbol

#### Defined in

[src/is.ts:19](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/is.ts#L19)

___

### lockObservable

▸ **lockObservable**(`obs`, `value`): `void`

#### Parameters

| Name | Type |
| :------ | :------ |
| `obs` | [`ObservableReadable`](modules.md#observablereadable)<`any`\> |
| `value` | `boolean` |

#### Returns

`void`

#### Defined in

[src/helpers.ts:40](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/helpers.ts#L40)

___

### mergeIntoObservable

▸ **mergeIntoObservable**<`T`\>(`target`, `...sources`): `T`

#### Type parameters

| Name | Type |
| :------ | :------ |
| `T` | extends `object` \| [`ObservableObject`](modules.md#observableobject)<`any`\> |

#### Parameters

| Name | Type |
| :------ | :------ |
| `target` | `T` |
| `...sources` | `any`[] |

#### Returns

`T`

#### Defined in

[src/helpers.ts:46](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/helpers.ts#L46)

___

### observable

▸ **observable**<`T`\>(`value?`): [`Observable`](modules.md#observable)<`T`\>

#### Type parameters

| Name |
| :------ |
| `T` |

#### Parameters

| Name | Type |
| :------ | :------ |
| `value?` | `T` \| `Promise`<`T`\> |

#### Returns

[`Observable`](modules.md#observable)<`T`\>

#### Defined in

[src/observable.ts:548](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observable.ts#L548)

___

### observablePrimitive

▸ **observablePrimitive**<`T`\>(`value?`): [`ObservablePrimitive`](modules.md#observableprimitive)<`T`\>

#### Type parameters

| Name |
| :------ |
| `T` |

#### Parameters

| Name | Type |
| :------ | :------ |
| `value?` | `T` \| `Promise`<`T`\> |

#### Returns

[`ObservablePrimitive`](modules.md#observableprimitive)<`T`\>

#### Defined in

[src/observable.ts:552](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observable.ts#L552)

___

### observe

▸ **observe**<`T`\>(`run`): () => `void`

#### Type parameters

| Name |
| :------ |
| `T` |

#### Parameters

| Name | Type |
| :------ | :------ |
| `run` | (`e`: [`ObserveEvent`](interfaces/ObserveEvent.md)<`T`\>) => `void` \| `T` |

#### Returns

`fn`

▸ (): `void`

##### Returns

`void`

#### Defined in

[src/observe.ts:28](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observe.ts#L28)

▸ **observe**<`T`\>(`selector`, `reaction?`): () => `void`

#### Type parameters

| Name |
| :------ |
| `T` |

#### Parameters

| Name | Type |
| :------ | :------ |
| `selector` | [`Selector`](modules.md#selector)<`T`\> |
| `reaction?` | (`e`: [`ObserveEventCallback`](interfaces/ObserveEventCallback.md)<`T`\>) => `void` \| `T` |

#### Returns

`fn`

▸ (): `void`

##### Returns

`void`

#### Defined in

[src/observe.ts:29](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observe.ts#L29)

___

### onChange

▸ **onChange**(`node`, `callback`, `track?`, `noArgs?`): () => `void`

#### Parameters

| Name | Type |
| :------ | :------ |
| `node` | [`NodeValue`](modules.md#nodevalue) |
| `callback` | [`ListenerFn`](modules.md#listenerfn)<`any`\> |
| `track?` | ``true`` |
| `noArgs?` | `boolean` |

#### Returns

`fn`

▸ (): `void`

##### Returns

`void`

#### Defined in

[src/onChange.ts:3](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/onChange.ts#L3)

___

### opaqueObject

▸ **opaqueObject**<`T`\>(`value`): [`OpaqueObject`](modules.md#opaqueobject)<`T`\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `T` | extends `object` |

#### Parameters

| Name | Type |
| :------ | :------ |
| `value` | `T` |

#### Returns

[`OpaqueObject`](modules.md#opaqueobject)<`T`\>

#### Defined in

[src/helpers.ts:35](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/helpers.ts#L35)

___

### updateTracking

▸ **updateTracking**(`node`, `track?`): `void`

#### Parameters

| Name | Type |
| :------ | :------ |
| `node` | [`NodeValue`](modules.md#nodevalue) |
| `track?` | ``true`` |

#### Returns

`void`

#### Defined in

[src/tracking.ts:38](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/tracking.ts#L38)

___

### when

▸ **when**<`T`\>(`predicate`): `Promise`<`T`\>

#### Type parameters

| Name |
| :------ |
| `T` |

#### Parameters

| Name | Type |
| :------ | :------ |
| `predicate` | [`Selector`](modules.md#selector)<`T`\> |

#### Returns

`Promise`<`T`\>

#### Defined in

[src/when.ts:6](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/when.ts#L6)

▸ **when**<`T`\>(`predicate`, `effect`): () => `void`

#### Type parameters

| Name |
| :------ |
| `T` |

#### Parameters

| Name | Type |
| :------ | :------ |
| `predicate` | [`Selector`](modules.md#selector)<`T`\> |
| `effect` | (`value`: `T`) => `any` |

#### Returns

`fn`

▸ (): `void`

##### Returns

`void`

#### Defined in

[src/when.ts:7](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/when.ts#L7)
