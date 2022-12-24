[@legendapp/state](../README.md) / [Exports](../modules.md) / ChildNodeValue

# Interface: ChildNodeValue

## Hierarchy

- `BaseNodeValue`

  ↳ **`ChildNodeValue`**

## Table of contents

### Properties

- [children](ChildNodeValue.md#children)
- [id](ChildNodeValue.md#id)
- [isActivatedPrimitive](ChildNodeValue.md#isactivatedprimitive)
- [key](ChildNodeValue.md#key)
- [listeners](ChildNodeValue.md#listeners)
- [parent](ChildNodeValue.md#parent)
- [proxy](ChildNodeValue.md#proxy)
- [root](ChildNodeValue.md#root)

## Properties

### children

• `Optional` **children**: `Map`<`string` \| `number`, [`ChildNodeValue`](ChildNodeValue.md)\>

#### Inherited from

BaseNodeValue.children

#### Defined in

[src/observableInterfaces.ts:333](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L333)

___

### id

• **id**: `number`

#### Inherited from

BaseNodeValue.id

#### Defined in

[src/observableInterfaces.ts:332](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L332)

___

### isActivatedPrimitive

• `Optional` **isActivatedPrimitive**: `boolean`

#### Inherited from

BaseNodeValue.isActivatedPrimitive

#### Defined in

[src/observableInterfaces.ts:335](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L335)

___

### key

• **key**: `string` \| `number`

#### Defined in

[src/observableInterfaces.ts:347](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L347)

___

### listeners

• `Optional` **listeners**: `Set`<`NodeValueListener`\>

#### Inherited from

BaseNodeValue.listeners

#### Defined in

[src/observableInterfaces.ts:337](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L337)

___

### parent

• **parent**: [`NodeValue`](../modules.md#nodevalue)

#### Defined in

[src/observableInterfaces.ts:346](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L346)

___

### proxy

• `Optional` **proxy**: `object`

#### Inherited from

BaseNodeValue.proxy

#### Defined in

[src/observableInterfaces.ts:334](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L334)

___

### root

• **root**: [`ObservableWrapper`](ObservableWrapper.md)

#### Inherited from

BaseNodeValue.root

#### Defined in

[src/observableInterfaces.ts:336](https://github.com/matthewmturner/legend-state/blob/69a8199/src/observableInterfaces.ts#L336)
