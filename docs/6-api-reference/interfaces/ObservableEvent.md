[@legendapp/state](../README.md) / [Exports](../modules.md) / ObservableEvent

# Interface: ObservableEvent

## Table of contents

### Methods

- [fire](ObservableEvent.md#fire)
- [get](ObservableEvent.md#get)
- [on](ObservableEvent.md#on)

## Methods

### fire

▸ **fire**(): `void`

#### Returns

`void`

#### Defined in

[src/observableInterfaces.ts:139](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L139)

___

### get

▸ **get**(): `void`

#### Returns

`void`

#### Defined in

[src/observableInterfaces.ts:142](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L142)

___

### on

▸ **on**(`cb?`): [`ObservableListenerDispose`](../modules.md#observablelistenerdispose)

#### Parameters

| Name | Type |
| :------ | :------ |
| `cb?` | () => `void` |

#### Returns

[`ObservableListenerDispose`](../modules.md#observablelistenerdispose)

#### Defined in

[src/observableInterfaces.ts:140](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L140)

▸ **on**(`eventType`, `cb?`): [`ObservableListenerDispose`](../modules.md#observablelistenerdispose)

#### Parameters

| Name | Type |
| :------ | :------ |
| `eventType` | ``"change"`` |
| `cb?` | () => `void` |

#### Returns

[`ObservableListenerDispose`](../modules.md#observablelistenerdispose)

#### Defined in

[src/observableInterfaces.ts:141](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L141)
