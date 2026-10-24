// @ts-expect-error — bun:test is provided by the Bun runtime; viewer does not
// depend on @types/bun so the import type is unresolved at compile time.
import { describe, expect, test } from 'bun:test'
import * as THREE from 'three'
import { SCENE_LAYER } from './layers'
import { syncRoofVisibility } from './roof-visibility'
import { hideFromScene, showInScene } from './scene-visibility'

function sceneObject(): THREE.Object3D {
  const obj = new THREE.Object3D()
  obj.layers.set(SCENE_LAYER)
  return obj
}

describe('roof visibility', () => {
  test('turning roofs off hides a roof and what is under it, and turning them on restores it', () => {
    const roof = sceneObject()
    const segment = sceneObject()
    roof.add(segment)
    const original = [roof.layers.mask, segment.layers.mask]

    const held = syncRoofVisibility([roof], false, new Set())
    expect(roof.layers.isEnabled(SCENE_LAYER)).toBe(false)
    expect(segment.layers.isEnabled(SCENE_LAYER)).toBe(false)

    const after = syncRoofVisibility([roof], true, held)
    expect([roof.layers.mask, segment.layers.mask]).toEqual(original)
    expect(after.size).toBe(0)
  })

  test('an object that stops being a roof is handed back', () => {
    const roof = sceneObject()
    const other = sceneObject()

    const held = syncRoofVisibility([roof, other], false, new Set())
    syncRoofVisibility([roof], false, held)

    expect(roof.layers.isEnabled(SCENE_LAYER)).toBe(false)
    expect(other.layers.isEnabled(SCENE_LAYER)).toBe(true)
  })

  test('a roof also held by another reason stays hidden until that reason leaves too', () => {
    const roof = sceneObject()
    hideFromScene(roof, 'isolated')

    const held = syncRoofVisibility([roof], false, new Set())
    syncRoofVisibility([roof], true, held)
    expect(roof.layers.isEnabled(SCENE_LAYER)).toBe(false)

    showInScene(roof, 'isolated')
    expect(roof.layers.isEnabled(SCENE_LAYER)).toBe(true)
  })
})
