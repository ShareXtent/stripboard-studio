import React, { useMemo, useState } from 'react';
import { ComponentDefinition } from '../model/types';
import { useProjectStore } from '../store/projectStore';
import { CollapsibleSection } from './CollapsibleSection';

const STANDARD_COLORS = [
  { name: 'Red', value: '#ff0000' },
  { name: 'Black', value: '#000000' },
  { name: 'Blue', value: '#0000ff' },
  { name: 'Green', value: '#008000' },
  { name: 'Yellow', value: '#ffff00' },
  { name: 'Orange', value: '#ff8c00' },
  { name: 'White', value: '#ffffff' },
  { name: 'Gray', value: '#808080' },
  { name: 'Copper', value: '#b87333' },
];

interface ColorPaletteFieldProps {
  label: string;
  onChange: (value: string) => void;
  value: string;
}

const ColorPaletteField: React.FC<ColorPaletteFieldProps> = ({ label, onChange, value }) => (
  <div>
    <label className="text-xs" style={{ color: '#94a3b8' }}>
      {label}
    </label>
    <div className="mt-1 flex flex-wrap gap-1">
      {STANDARD_COLORS.map((color) => (
        <button
          key={`${label}-${color.value}`}
          type="button"
          onClick={() => onChange(color.value)}
          className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
          style={{
            backgroundColor: color.value,
            borderColor: value === color.value ? '#4a90d9' : '#555',
          }}
          title={color.name}
        />
      ))}
    </div>
    <div className="mt-2 flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-8 rounded"
        style={{ background: 'none', border: 'none' }}
      />
      <span className="text-xs" style={{ color: '#d7dee9' }}>
        {value}
      </span>
    </div>
  </div>
);

export const LeftPanel: React.FC = () => {
  const {
    project,
    selectedTool,
    setSelectedTool,
    componentDefinitions,
    selectedComponentDefinitionId,
    setSelectedComponentDefinitionId,
    componentLabel,
    setComponentLabel,
    componentColor,
    setComponentColor,
    annotationText,
    setAnnotationText,
    annotationColor,
    setAnnotationColor,
    componentWidthMm,
    setComponentWidthMm,
    componentHeightMm,
    setComponentHeightMm,
    componentRotationDeg,
    setComponentRotationDeg,
    componentPlacementType,
    setComponentPlacementType,
    wireColor,
    setWireColor,
    solderColor,
    setSolderColor,
    boardSettings,
    setBoardSettings,
    setProject,
    addComponentDefinition,
    updateComponentDefinition,
  } = useProjectStore();
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryCategory, setLibraryCategory] = useState('all');

  if (!project) {
    return null;
  }

  const categories = useMemo(
    () =>
      Array.from(
        new Set(componentDefinitions.map((definition) => definition.category.trim()).filter(Boolean))
      ).sort((left, right) => left.localeCompare(right)),
    [componentDefinitions]
  );
  const normalizedSearch = librarySearch.trim().toLowerCase();
  const filteredDefinitions = useMemo(
    () =>
      componentDefinitions.filter((definition) => {
        const matchesCategory =
          libraryCategory === 'all' || definition.category === libraryCategory;
        const matchesSearch =
          normalizedSearch.length === 0 ||
          definition.name.toLowerCase().includes(normalizedSearch) ||
          definition.category.toLowerCase().includes(normalizedSearch);

        return matchesCategory && matchesSearch;
      }),
    [componentDefinitions, libraryCategory, normalizedSearch]
  );
  const selectedDefinition =
    componentDefinitions.find((definition) => definition.id === selectedComponentDefinitionId) ?? null;

  const selectDefinition = (definitionId: string) => {
    setSelectedComponentDefinitionId(definitionId);
    setSelectedTool('component');
  };

  return (
    <div
      className="flex flex-col overflow-hidden min-h-0"
      style={{
        width: 300,
        background: '#16213e',
        borderRight: '1px solid #2d2d44',
        color: '#e0e0e0',
      }}
    >
      <div className="px-3 py-3 border-b" style={{ borderBottomColor: '#2d2d44' }}>
        <h2 className="text-sm font-semibold" style={{ color: '#c7d2fe' }}>
          Workspace
        </h2>
        <div className="mt-2 text-xs space-y-1" style={{ color: '#94a3b8' }}>
          <div>
            Current tool:{' '}
            <span style={{ color: '#f8fafc', fontWeight: 600 }}>{selectedTool}</span>
          </div>
          <div>
            Board: {project.board.widthMm}mm x {project.board.heightMm}mm
          </div>
          <div>
            Canvas: {project.settings.canvasWidthPx ?? 1000}px x{' '}
            {project.settings.canvasHeightPx ?? 700}px
          </div>
          <div>
            {project.board.strips.length} strips, {project.board.holes.length} holes
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <CollapsibleSection
          title="Library"
          defaultOpen
          badge={`${filteredDefinitions.length}/${componentDefinitions.length}`}
          action={
            selectedDefinition && (
              <button
                type="button"
                onClick={() => addComponentDefinition(selectedDefinition)}
                className="rounded px-2 py-1 text-xs font-medium"
                style={{
                  background: '#2d5a4a',
                  color: '#e8fff8',
                  border: '1px solid #4f8f77',
                }}
              >
                Duplicate
              </button>
            )
          }
        >
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_112px] gap-2">
              <input
                type="text"
                value={librarySearch}
                onChange={(e) => setLibrarySearch(e.target.value)}
                placeholder="Search presets"
                className="w-full px-2 py-1 rounded text-xs"
                style={{
                  background: '#0f3460',
                  color: '#e0e0e0',
                  border: '1px solid #2d2d44',
                }}
              />
              <select
                value={libraryCategory}
                onChange={(e) => setLibraryCategory(e.target.value)}
                className="w-full px-2 py-1 rounded text-xs"
                style={{
                  background: '#0f3460',
                  color: '#e0e0e0',
                  border: '1px solid #2d2d44',
                }}
              >
                <option value="all">All Categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1 overflow-y-auto" style={{ maxHeight: 320 }}>
              {filteredDefinitions.length === 0 && (
                <div
                  className="rounded px-2 py-2 text-xs"
                  style={{
                    background: '#102743',
                    border: '1px solid #2d2d44',
                    color: '#7f9bb8',
                  }}
                >
                  No presets match the current filter.
                </div>
              )}

              {filteredDefinitions.map((definition: ComponentDefinition) => {
                const isSelected = selectedDefinition?.id === definition.id;

                return (
                  <button
                    key={definition.id}
                    type="button"
                    onClick={() => selectDefinition(definition.id)}
                    className="w-full rounded px-2 py-2 text-left transition-colors"
                    style={{
                      background: isSelected ? '#1d4f7a' : '#0f3460',
                      border: isSelected ? '1px solid #63a7de' : '1px solid #2d2d44',
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className="text-xs font-medium"
                        style={{ color: isSelected ? '#f8fbff' : '#e0e0e0' }}
                      >
                        {definition.name}
                      </div>
                      <div className="text-[10px]" style={{ color: '#7f9bb8' }}>
                        {definition.category}
                      </div>
                    </div>
                    <div className="mt-1 text-[11px]" style={{ color: '#9fb3c8' }}>
                      {definition.body.widthMm}mm x {definition.body.heightMm}mm ·{' '}
                      {definition.pins.length} pins
                    </div>
                    <div className="mt-1 text-[11px]" style={{ color: '#7f9bb8' }}>
                      Default:{' '}
                      {definition.defaultPlacementType === 'external'
                        ? 'External / Off-board'
                        : 'On-board'}
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedDefinition && (
              <div
                className="rounded px-2 py-2 text-xs"
                style={{
                  background: '#102743',
                  border: '1px solid #2d2d44',
                  color: '#d7dee9',
                }}
              >
                <div className="font-medium" style={{ color: '#f8fafc' }}>
                  Selected preset: {selectedDefinition.name}
                </div>
                <div className="mt-1" style={{ color: '#7f9bb8' }}>
                  {selectedDefinition.body.widthMm}mm x {selectedDefinition.body.heightMm}mm ·{' '}
                  {selectedDefinition.pins.length} pins · {selectedDefinition.category}
                </div>
              </div>
            )}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Tool Options" defaultOpen badge={selectedTool}>
          {selectedTool === 'select' && (
            <div className="text-xs" style={{ color: '#7f9bb8' }}>
              Select an object on the board to inspect or edit it. Choose another tool when you want
              to place cuts, solder joints, wires, components, or annotations.
            </div>
          )}

          {selectedTool === 'cut' && (
            <div className="text-xs" style={{ color: '#7f9bb8' }}>
              Click a hole on the bottom view to toggle a strip cut. Prep view is useful when you
              want to focus only on copper and cuts.
            </div>
          )}

          {selectedTool === 'solder' && (
            <ColorPaletteField label="Solder Color" value={solderColor} onChange={setSolderColor} />
          )}

          {selectedTool === 'wire' && (
            <ColorPaletteField label="Wire Color" value={wireColor} onChange={setWireColor} />
          )}

          {selectedTool === 'annotation' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs" style={{ color: '#94a3b8' }}>
                  Text
                </label>
                <input
                  type="text"
                  value={annotationText}
                  onChange={(e) => setAnnotationText(e.target.value)}
                  placeholder="Note"
                  className="mt-1 w-full px-2 py-1 rounded text-xs"
                  style={{
                    background: '#0f3460',
                    color: '#e0e0e0',
                    border: '1px solid #2d2d44',
                  }}
                />
              </div>

              <ColorPaletteField
                label="Annotation Color"
                value={annotationColor}
                onChange={setAnnotationColor}
              />

              <div
                className="rounded px-2 py-2 text-xs"
                style={{
                  background: '#102743',
                  border: '1px solid #406a98',
                  color: '#d7dee9',
                }}
              >
                Click in the workspace to place a label annotation. It will snap to the nearest
                hole when you place it close to one.
              </div>
            </div>
          )}

          {selectedTool === 'component' && (
            <div className="space-y-3">
              {!selectedDefinition && (
                <div
                  className="rounded px-2 py-2 text-xs"
                  style={{
                    background: '#102743',
                    border: '1px solid #406a98',
                    color: '#d7dee9',
                  }}
                >
                  Choose a preset from the library to configure placement options.
                </div>
              )}

              {selectedDefinition && (
                <>
                  <div
                    className="rounded px-2 py-2 text-xs"
                    style={{
                      background: '#102743',
                      border: '1px solid #2d2d44',
                      color: '#d7dee9',
                    }}
                  >
                    <div className="font-medium" style={{ color: '#f8fafc' }}>
                      {selectedDefinition.name}
                    </div>
                    <div className="mt-1" style={{ color: '#7f9bb8' }}>
                      {selectedDefinition.body.widthMm}mm x {selectedDefinition.body.heightMm}mm ·{' '}
                      {selectedDefinition.pins.length} pins
                    </div>
                  </div>

                  <div>
                    <label className="text-xs" style={{ color: '#94a3b8' }}>
                      Label
                    </label>
                    <input
                      type="text"
                      value={componentLabel}
                      onChange={(e) => setComponentLabel(e.target.value)}
                      placeholder="Enter label"
                      className="mt-1 w-full px-2 py-1 rounded text-xs"
                      style={{
                        background: '#0f3460',
                        color: '#e0e0e0',
                        border: '1px solid #2d2d44',
                      }}
                    />
                  </div>

                  <div>
                    <label className="text-xs" style={{ color: '#94a3b8' }}>
                      Placement Type
                    </label>
                    <select
                      value={componentPlacementType}
                      onChange={(e) =>
                        setComponentPlacementType(e.target.value as 'onBoard' | 'external')
                      }
                      className="mt-1 w-full px-2 py-1 rounded text-xs"
                      style={{
                        background: '#0f3460',
                        color: '#e0e0e0',
                        border: '1px solid #2d2d44',
                      }}
                    >
                      <option value="onBoard">On-board</option>
                      <option value="external">External / Off-board</option>
                    </select>
                  </div>

                  {componentPlacementType === 'external' && (
                    <div
                      className="rounded px-2 py-2 text-xs"
                      style={{
                        background: '#102743',
                        border: '1px solid #406a98',
                        color: '#d7dee9',
                      }}
                    >
                      External components are connected using wires, not by hole alignment.
                    </div>
                  )}

                  <ColorPaletteField
                    label="Component Color"
                    value={componentColor}
                    onChange={setComponentColor}
                  />

                  <div>
                    <label className="text-xs" style={{ color: '#94a3b8' }}>
                      Placement Width / Height (mm)
                    </label>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        min={0.5}
                        step={0.5}
                        value={componentWidthMm}
                        onChange={(e) => setComponentWidthMm(Number(e.target.value))}
                        className="w-full px-2 py-1 rounded text-xs"
                        style={{
                          background: '#0f3460',
                          color: '#e0e0e0',
                          border: '1px solid #2d2d44',
                        }}
                      />
                      <input
                        type="number"
                        min={0.5}
                        step={0.5}
                        value={componentHeightMm}
                        onChange={(e) => setComponentHeightMm(Number(e.target.value))}
                        className="w-full px-2 py-1 rounded text-xs"
                        style={{
                          background: '#0f3460',
                          color: '#e0e0e0',
                          border: '1px solid #2d2d44',
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs" style={{ color: '#94a3b8' }}>
                      Rotation
                    </label>
                    <select
                      value={componentRotationDeg}
                      onChange={(e) =>
                        setComponentRotationDeg(Number(e.target.value) as 0 | 90 | 180 | 270)
                      }
                      className="mt-1 w-full px-2 py-1 rounded text-xs"
                      style={{
                        background: '#0f3460',
                        color: '#e0e0e0',
                        border: '1px solid #2d2d44',
                      }}
                    >
                      <option value={0}>0 deg</option>
                      <option value={90}>90 deg</option>
                      <option value={180}>180 deg</option>
                      <option value={270}>270 deg</option>
                    </select>
                  </div>

                  <div
                    className="rounded px-2 py-2 text-xs"
                    style={{
                      background: '#102743',
                      border: '1px solid #406a98',
                      color: '#d7dee9',
                    }}
                  >
                    Placement mode is active. Click in the workspace to place the selected preset
                    from its top-left anchor.
                  </div>

                  <div className="space-y-2 rounded px-2 py-2" style={{ background: '#102743', border: '1px solid #2d2d44' }}>
                    <div className="text-xs font-semibold" style={{ color: '#c7d2fe' }}>
                      Preset Editor
                    </div>
                    <div>
                      <label className="text-xs" style={{ color: '#94a3b8' }}>
                        Preset Name
                      </label>
                      <input
                        type="text"
                        value={selectedDefinition.name}
                        onChange={(e) =>
                          updateComponentDefinition(selectedDefinition.id, { name: e.target.value })
                        }
                        className="mt-1 w-full px-2 py-1 rounded text-xs"
                        style={{
                          background: '#0f3460',
                          color: '#e0e0e0',
                          border: '1px solid #2d2d44',
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-xs" style={{ color: '#94a3b8' }}>
                        Default Size (mm)
                      </label>
                      <div className="mt-1 grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          min={0.5}
                          step={0.5}
                          value={selectedDefinition.body.widthMm}
                          onChange={(e) =>
                            updateComponentDefinition(selectedDefinition.id, {
                              widthMm: Number(e.target.value),
                            })
                          }
                          className="w-full px-2 py-1 rounded text-xs"
                          style={{
                            background: '#0f3460',
                            color: '#e0e0e0',
                            border: '1px solid #2d2d44',
                          }}
                        />
                        <input
                          type="number"
                          min={0.5}
                          step={0.5}
                          value={selectedDefinition.body.heightMm}
                          onChange={(e) =>
                            updateComponentDefinition(selectedDefinition.id, {
                              heightMm: Number(e.target.value),
                            })
                          }
                          className="w-full px-2 py-1 rounded text-xs"
                          style={{
                            background: '#0f3460',
                            color: '#e0e0e0',
                            border: '1px solid #2d2d44',
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs" style={{ color: '#94a3b8' }}>
                        Pin Count
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={32}
                        step={1}
                        value={selectedDefinition.pins.length}
                        onChange={(e) =>
                          updateComponentDefinition(selectedDefinition.id, {
                            pinCount: Number(e.target.value),
                          })
                        }
                        className="mt-1 w-full px-2 py-1 rounded text-xs"
                        style={{
                          background: '#0f3460',
                          color: '#e0e0e0',
                          border: '1px solid #2d2d44',
                        }}
                      />
                    </div>
                    <div className="text-xs" style={{ color: '#7f9bb8' }}>
                      Pin positions are regenerated automatically when width or pin count changes.
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="Board" defaultOpen={false}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs" style={{ color: '#94a3b8' }}>
                Width (mm)
              </label>
              <input
                type="number"
                value={boardSettings.widthMm}
                onChange={(e) => setBoardSettings({ widthMm: Number(e.target.value) })}
                className="w-full px-2 py-1 rounded text-xs"
                style={{
                  background: '#0f3460',
                  color: '#e0e0e0',
                  border: '1px solid #2d2d44',
                }}
              />
            </div>
            <div>
              <label className="text-xs" style={{ color: '#94a3b8' }}>
                Height (mm)
              </label>
              <input
                type="number"
                value={boardSettings.heightMm}
                onChange={(e) => setBoardSettings({ heightMm: Number(e.target.value) })}
                className="w-full px-2 py-1 rounded text-xs"
                style={{
                  background: '#0f3460',
                  color: '#e0e0e0',
                  border: '1px solid #2d2d44',
                }}
              />
            </div>
            <div>
              <label className="text-xs" style={{ color: '#94a3b8' }}>
                Pitch (mm)
              </label>
              <input
                type="number"
                value={boardSettings.pitchMm}
                onChange={(e) => setBoardSettings({ pitchMm: Number(e.target.value) })}
                className="w-full px-2 py-1 rounded text-xs"
                style={{
                  background: '#0f3460',
                  color: '#e0e0e0',
                  border: '1px solid #2d2d44',
                }}
              />
            </div>
            <div>
              <label className="text-xs" style={{ color: '#94a3b8' }}>
                Direction
              </label>
              <select
                value={boardSettings.stripDirection}
                onChange={(e) =>
                  setBoardSettings({
                    stripDirection: e.target.value as 'horizontal' | 'vertical',
                  })
                }
                className="w-full px-2 py-1 rounded text-xs"
                style={{
                  background: '#0f3460',
                  color: '#e0e0e0',
                  border: '1px solid #2d2d44',
                }}
              >
                <option value="vertical">Vertical</option>
                <option value="horizontal">Horizontal</option>
              </select>
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Canvas" defaultOpen={false}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs" style={{ color: '#94a3b8' }}>
                Width (px)
              </label>
              <input
                type="number"
                min={400}
                value={project.settings.canvasWidthPx ?? 1000}
                onChange={(e) =>
                  setProject({
                    ...project,
                    settings: {
                      ...project.settings,
                      canvasWidthPx: Math.max(400, Number(e.target.value)),
                    },
                  })
                }
                className="w-full px-2 py-1 rounded text-xs"
                style={{
                  background: '#0f3460',
                  color: '#e0e0e0',
                  border: '1px solid #2d2d44',
                }}
              />
            </div>
            <div>
              <label className="text-xs" style={{ color: '#94a3b8' }}>
                Height (px)
              </label>
              <input
                type="number"
                min={300}
                value={project.settings.canvasHeightPx ?? 700}
                onChange={(e) =>
                  setProject({
                    ...project,
                    settings: {
                      ...project.settings,
                      canvasHeightPx: Math.max(300, Number(e.target.value)),
                    },
                  })
                }
                className="w-full px-2 py-1 rounded text-xs"
                style={{
                  background: '#0f3460',
                  color: '#e0e0e0',
                  border: '1px solid #2d2d44',
                }}
              />
            </div>
          </div>
        </CollapsibleSection>
      </div>
    </div>
  );
};
