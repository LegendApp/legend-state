[@legendapp/state](../README.md) / [Exports](../modules.md) / RootNodeValue

# Interface: RootNodeValue

## Hierarchy

- `BaseNodeValue`

  ↳ **`RootNodeValue`**

## Table of contents

### Properties

- [children](RootNodeValue.md#children)
- [id](RootNodeValue.md#id)
- [isActivatedPrimitive](RootNodeValue.md#isactivatedprimitive)
- [key](RootNodeValue.md#key)
- [listeners](RootNodeValue.md#listeners)
- [parent](RootNodeValue.md#parent)
- [proxy](RootNodeValue.md#proxy)
- [root](RootNodeValue.md#root)

## Properties

### children

• `Optional` **children**: `Map`<`string` \| `number`, [`ChildNodeValue`](ChildNodeValue.md)\>

#### Inherited from

BaseNodeValue.children

#### Defined in

[src/observableInterfaces.ts:333](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L333)

___

### id

• **id**: `number`

#### Inherited from

BaseNodeValue.id

#### Defined in

[src/observableInterfaces.ts:332](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L332)

___

### isActivatedPrimitive

• `Optional` **isActivatedPrimitive**: `boolean`

#### Inherited from

BaseNodeValue.isActivatedPrimitive

#### Defined in

[src/observableInterfaces.ts:335](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L335)

___

### key

• `Optional` **key**: `undefined`

#### Defined in

[src/observableInterfaces.ts:342](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L342)

___

### listeners

• `Optional` **listeners**: `Set`<`NodeValueListener`\>

#### Inherited from

BaseNodeValue.listeners

#### Defined in

[src/observableInterfaces.ts:337](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L337)

___

### parent

• `Optional` **parent**: `undefined`

#### Defined in

[src/observableInterfaces.ts:341](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L341)

___

### proxy

• `Optional` **proxy**: `object`

#### Inherited from

BaseNodeValue.proxy

#### Defined in

[src/observableInterfaces.ts:334](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L334)

___

### root

• **root**: [`ObservableWrapper`](ObservableWrapper.md)

#### Inherited from

BaseNodeValue.root

#### Defined in

[src/observableInterfaces.ts:336](https://github.com/LegendApp/legend-state/blob/c6d45b4/src/observableInterfaces.ts#L336)
