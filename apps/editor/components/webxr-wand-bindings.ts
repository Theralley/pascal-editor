'use client'

import { useEditor } from '@pascal-app/editor'
import type { PascalXRWandBindings } from '@webxr/plugin/pascal-editor'
import {
  activateBuildTool,
  activateModularCabinetTool,
  activatePaintMode,
  activateRoofFeatureTool,
  activateRoofFootprintSource,
  activateRoofType,
  activateSelectMode,
  activateTerrainSculptMode,
  collectBuildTypes,
  collectRoofFeatures,
  MEP_ITEMS,
} from '@/lib/build-palette'
import {
  localizedFootprintSources,
  localizedRoofTypeOptions,
  useBuildPanelModel,
  useBuildToolOptions,
} from '@/lib/build-panel-model'

export const webXRWandBindings: PascalXRWandBindings = {
  useBuildPalette: useBuildPanelModel,
  useToolOptions: useBuildToolOptions,
  activateBuildTool,
  activateModularCabinetTool,
  activatePaintMode,
  activateRoofFeatureTool,
  activateRoofFootprintSource,
  activateRoofType,
  activateSelectMode: () => {
    activateSelectMode()
    useEditor.getState().setTool(null)
  },
  activateTerrainSculptMode,
  collectBuildTypes,
  collectRoofFeatures,
  getRoofFootprintSources: localizedFootprintSources,
  get roofTypeOptions() {
    return localizedRoofTypeOptions()
  },
  xrMepItems: MEP_ITEMS,
}
