import React from 'react';
import { useProjectStore } from '../store/projectStore';
import { ComponentDefinition } from '../model/types';
import { generateId } from '../utils/ids';

export const ComponentLibraryPanel: React.FC = () => {
  const { project, setSelectedTool, addComponent, componentDefinitions, setSelectedComponentDefinitionId } = useProjectStore();

  if (!project) return null;

  const handlePlaceComponent = (definitionId: string) => {
    const definition = componentDefinitions.find((d) => d.id === definitionId);
    if (!definition) return;

    const newComponent = {
      id: generateId(),
      definitionId,
      name: definition.name,
      xMm: 10,
      yMm: 10,
      widthMm: definition.body.widthMm,
      heightMm: definition.body.heightMm,
      rotationDeg: 0 as const,
      placementType: definition.defaultPlacementType ?? 'onBoard',
      pinLayoutOverrides: {},
      pinHoleMap: Object.fromEntries(definition.pins.map((pin) => [pin.id, null])),
    };

    addComponent(newComponent);
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <h2 className="text-lg font-semibold text-gray-900">Component Library</h2>
      </div>
      <div className="p-4 space-y-3">
        {componentDefinitions.map((definition: ComponentDefinition) => (
          <div
            key={definition.id}
            className="p-3 border border-gray-200 rounded-lg hover:border-blue-400 cursor-pointer bg-white hover:bg-blue-50 transition-colors"
            onClick={() => {
              setSelectedTool('component');
              setSelectedComponentDefinitionId(definition.id);
            }}
          >
            <div className="font-medium text-sm text-gray-900">{definition.name}</div>
            <div className="text-xs text-gray-600 mt-1">
              {definition.body.widthMm}mm × {definition.body.heightMm}mm
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {definition.pins.length} pins
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePlaceComponent(definition.id);
              }}
              className="mt-2 px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
            >
              Place
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

