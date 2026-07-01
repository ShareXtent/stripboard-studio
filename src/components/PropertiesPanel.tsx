import React from 'react';
import {
  getConnectionEndpointDisplayName,
  wireUsesComponentPin,
} from '../model/connectionEndpoints';
import {
  getComponentPinPositionsMm,
} from '../model/componentGeometry';
import { getComponentPinObjectId, parseComponentPinObjectId } from '../model/electricalIds';
import { findNetIdForSelectable } from '../model/nets';
import { Net, NetLabelTarget } from '../model/types';
import { useProjectStore } from '../store/projectStore';
import { CollapsibleSection } from './CollapsibleSection';

function getSeverityColor(severity: 'info' | 'warning' | 'error'): string {
  switch (severity) {
    case 'error':
      return '#ff8b8b';
    case 'warning':
      return '#ffd166';
    default:
      return '#8ecae6';
  }
}

function getNetObjectCount(net: Net): number {
  return (
    net.objectRefs.holes.length +
    net.objectRefs.copperSegments.length +
    net.objectRefs.wires.length +
    net.objectRefs.componentPins.length +
    net.objectRefs.solderJoints.length
  );
}

export const PropertiesPanel: React.FC = () => {
  const {
    project,
    selectedId,
    selectedTool,
    deleteSelected,
    componentDefinitions,
    copperSegments,
    nets,
    drcIssues,
    highlightedNetId,
    updateAnnotation,
    updateComponentSize,
    updateComponentRotation,
    updateComponentPlacementType,
    updateComponentPinOffset,
    snapComponentPinsToNearestHoles,
    applyComponentPinPositionsToInstance,
    setProject,
    setSelectedTool,
    setSelectedId,
    setHighlightedNetId,
    setAutoHighlightNets,
    clearNetHighlight,
    selectObjectRef,
    upsertNetLabel,
  } = useProjectStore();

  if (!project) return null;

  const updateSettings = (nextSettings: Partial<typeof project.settings>) => {
    setProject({
      ...project,
      settings: {
        ...project.settings,
        ...nextSettings,
      },
    });
  };
  const handleToggleBoardPrepMode = (enabled: boolean) => {
    if (enabled) {
      setSelectedTool('select');
    }

    setSelectedId(null);
    updateSettings({
      boardPrepMode: enabled,
      showOppositeSideOverlay: enabled ? false : project.settings.showOppositeSideOverlay,
    });
  };

  const selectedHole = project.board.holes.find(
    (hole) => selectedId?.type === 'hole' && hole.id === selectedId.id
  );
  const selectedWire = project.wires.find(
    (wire) => selectedId?.type === 'wire' && wire.id === selectedId.id
  );
  const selectedComponent = project.components.find(
    (component) => selectedId?.type === 'component' && component.id === selectedId.id
  );
  const selectedSolder = project.solderJoints.find(
    (joint) => selectedId?.type === 'solder' && joint.id === selectedId.id
  );
  const selectedAnnotation = project.annotations.find(
    (annotation) => selectedId?.type === 'annotation' && annotation.id === selectedId.id
  );
  const selectedSegment = copperSegments.find(
    (segment) => selectedId?.type === 'segment' && segment.id === selectedId.id
  );
  const selectedComponentPinRef =
    selectedId?.type === 'componentPin' ? parseComponentPinObjectId(selectedId.id) : null;
  const selectedComponentPinComponent = selectedComponentPinRef
    ? project.components.find((component) => component.id === selectedComponentPinRef.componentId)
    : null;
  const selectedComponentForEditor = selectedComponent ?? selectedComponentPinComponent ?? null;
  const selectedComponentDefinition = selectedComponentForEditor
    ? componentDefinitions.find(
        (definition) => definition.id === selectedComponentForEditor.definitionId
      )
    : null;
  const selectedComponentPinDefinitionPin = selectedComponentDefinition?.pins.find(
    (pin) => pin.id === selectedComponentPinRef?.pinId
  );
  const selectedCut =
    selectedId?.type === 'cut'
      ? project.board.strips.flatMap((strip) => strip.cuts).find((cut) => cut.id === selectedId.id)
      : null;
  const selectedNetId = findNetIdForSelectable(selectedId, nets);
  const selectedNet = nets.find((net) => net.id === selectedNetId) ?? null;
  const highlightedNet = nets.find((net) => net.id === highlightedNetId) ?? null;
  const activeNet = highlightedNet ?? selectedNet;
  const canDeleteSelected =
    !!selectedId &&
    (
      selectedId.type === 'wire' ||
      selectedId.type === 'component' ||
      selectedId.type === 'solder' ||
      selectedId.type === 'cut' ||
      selectedId.type === 'annotation'
    );

  const selectedComponentPinData =
    selectedComponentForEditor && selectedComponentDefinition
      ? getComponentPinPositionsMm(selectedComponentForEditor, selectedComponentDefinition)
      : [];

  const getPinConnectionStatus = (
    componentId: string,
    pinId: string,
    mappedHoleId: string | null
  ): { label: string; color: string } => {
    const hasWireConnection = project.wires.some((wire) =>
      wireUsesComponentPin(wire, componentId, pinId)
    );

    if (hasWireConnection) {
      return { label: 'Wired', color: '#9be9a8' };
    }

    if (mappedHoleId) {
      return { label: 'Mapped to hole', color: '#8ecae6' };
    }

    return { label: 'Floating', color: '#ffb86b' };
  };

  let editableNetTarget: NetLabelTarget | null = null;
  if (selectedSegment) {
    editableNetTarget = {
      type: 'segment',
      stripIndex: selectedSegment.stripIndex,
      fromHoleIndex: selectedSegment.fromHoleIndex,
      toHoleIndex: selectedSegment.toHoleIndex,
    };
  } else if (selectedWire) {
    editableNetTarget = {
      type: 'wire',
      wireId: selectedWire.id,
    };
  } else if (activeNet?.objectRefs.copperSegments.length) {
    const primarySegment = copperSegments.find(
      (segment) => segment.id === [...activeNet.objectRefs.copperSegments].sort()[0]
    );
    if (primarySegment) {
      editableNetTarget = {
        type: 'segment',
        stripIndex: primarySegment.stripIndex,
        fromHoleIndex: primarySegment.fromHoleIndex,
        toHoleIndex: primarySegment.toHoleIndex,
      };
    }
  } else if (activeNet?.objectRefs.wires.length) {
    editableNetTarget = {
      type: 'wire',
      wireId: [...activeNet.objectRefs.wires].sort()[0],
    };
  }

  const currentNetLabel = editableNetTarget
    ? project.netLabels.find((label) => {
        if (label.target.type !== editableNetTarget!.type) {
          return false;
        }

        if (label.target.type === 'segment' && editableNetTarget!.type === 'segment') {
          return (
            label.target.stripIndex === editableNetTarget.stripIndex &&
            label.target.fromHoleIndex === editableNetTarget.fromHoleIndex &&
            label.target.toHoleIndex === editableNetTarget.toHoleIndex
          );
        }

        return (
          label.target.type === 'wire' &&
          editableNetTarget!.type === 'wire' &&
          label.target.wireId === editableNetTarget.wireId
        );
      })
    : undefined;

  const netNameValue =
    currentNetLabel?.netName ??
    (activeNet?.assignedNames?.length === 1 ? activeNet.assignedNames[0] : '');
  const netColorValue = currentNetLabel?.color ?? activeNet?.color ?? project.settings.copperColor;

  return (
    <div
      className="flex flex-col overflow-hidden min-h-0"
      style={{
        width: 320,
        height: '100%',
        minHeight: 0,
        flexShrink: 0,
        background: '#16213e',
        borderLeft: '1px solid #2d2d44',
        color: '#e0e0e0',
      }}
    >
      <div className="px-3 py-3 border-b" style={{ borderBottomColor: '#2d2d44' }}>
        <h2 className="text-sm font-semibold" style={{ color: '#c7d2fe' }}>
          Properties
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0" style={{ height: '100%' }}>
        <CollapsibleSection title="Selection" defaultOpen>
          {selectedHole && (
            <div className="text-xs space-y-1" style={{ color: '#d7dee9' }}>
              <div><span style={{ color: '#94a3b8' }}>Type:</span> Hole</div>
              <div><span style={{ color: '#94a3b8' }}>Row:</span> {selectedHole.row + 1}</div>
              <div><span style={{ color: '#94a3b8' }}>Col:</span> {selectedHole.col + 1}</div>
              <div><span style={{ color: '#94a3b8' }}>X:</span> {selectedHole.xMm.toFixed(2)}mm</div>
              <div><span style={{ color: '#94a3b8' }}>Y:</span> {selectedHole.yMm.toFixed(2)}mm</div>
            </div>
          )}
          {selectedWire && (
            <div className="text-xs space-y-1" style={{ color: '#d7dee9' }}>
              <div><span style={{ color: '#94a3b8' }}>Type:</span> Wire</div>
              <div>
                <span style={{ color: '#94a3b8' }}>From:</span>{' '}
                {getConnectionEndpointDisplayName(
                  selectedWire.from,
                  project.board,
                  project.components,
                  componentDefinitions
                )}
              </div>
              <div>
                <span style={{ color: '#94a3b8' }}>To:</span>{' '}
                {getConnectionEndpointDisplayName(
                  selectedWire.to,
                  project.board,
                  project.components,
                  componentDefinitions
                )}
              </div>
              <div><span style={{ color: '#94a3b8' }}>Side:</span> {selectedWire.side}</div>
            </div>
          )}
          {selectedSegment && (
            <div className="text-xs space-y-1" style={{ color: '#d7dee9' }}>
              <div><span style={{ color: '#94a3b8' }}>Type:</span> Copper Segment</div>
              <div><span style={{ color: '#94a3b8' }}>Strip:</span> {selectedSegment.stripIndex + 1}</div>
              <div>
                <span style={{ color: '#94a3b8' }}>Range:</span> {selectedSegment.fromHoleIndex + 1}-
                {selectedSegment.toHoleIndex + 1}
              </div>
              <div><span style={{ color: '#94a3b8' }}>Holes:</span> {selectedSegment.holeIds.length}</div>
            </div>
          )}
          {selectedComponentPinComponent && selectedComponentPinDefinitionPin && (
            <div className="text-xs space-y-1" style={{ color: '#d7dee9' }}>
              <div><span style={{ color: '#94a3b8' }}>Type:</span> Component Pin</div>
              <div><span style={{ color: '#94a3b8' }}>Component:</span> {selectedComponentPinComponent.name}</div>
              <div><span style={{ color: '#94a3b8' }}>Pin:</span> {selectedComponentPinDefinitionPin.name}</div>
              <div>
                <span style={{ color: '#94a3b8' }}>Mapped Hole:</span>{' '}
                {selectedComponentPinComponent.pinHoleMap[selectedComponentPinDefinitionPin.id] ?? 'Unmapped'}
              </div>
            </div>
          )}
          {selectedComponentForEditor && (
            <div className="text-xs space-y-1" style={{ color: '#d7dee9' }}>
              <div><span style={{ color: '#94a3b8' }}>Type:</span> Component</div>
              <div><span style={{ color: '#94a3b8' }}>Name:</span> {selectedComponentForEditor.name}</div>
              <div>
                <span style={{ color: '#94a3b8' }}>Placement:</span>{' '}
                {selectedComponentForEditor.placementType === 'external' ? 'External / Off-board' : 'On-board'}
              </div>
              <div><span style={{ color: '#94a3b8' }}>X:</span> {selectedComponentForEditor.xMm.toFixed(2)}mm</div>
              <div><span style={{ color: '#94a3b8' }}>Y:</span> {selectedComponentForEditor.yMm.toFixed(2)}mm</div>
              <div>
                <span style={{ color: '#94a3b8' }}>Width:</span>{' '}
                {(selectedComponentForEditor.widthMm ?? selectedComponentDefinition?.body.widthMm ?? 0).toFixed(2)}mm
              </div>
              <div>
                <span style={{ color: '#94a3b8' }}>Height:</span>{' '}
                {(selectedComponentForEditor.heightMm ?? selectedComponentDefinition?.body.heightMm ?? 0).toFixed(2)}mm
              </div>
              <div><span style={{ color: '#94a3b8' }}>Rotation:</span> {selectedComponentForEditor.rotationDeg}deg</div>
            </div>
          )}
          {selectedSolder && (
            <div className="text-xs space-y-1" style={{ color: '#d7dee9' }}>
              <div><span style={{ color: '#94a3b8' }}>Type:</span> Solder Joint</div>
              <div><span style={{ color: '#94a3b8' }}>Hole:</span> {selectedSolder.holeId}</div>
              <div><span style={{ color: '#94a3b8' }}>Side:</span> {selectedSolder.side}</div>
            </div>
          )}
          {selectedAnnotation && (
            <div className="text-xs space-y-1" style={{ color: '#d7dee9' }}>
              <div><span style={{ color: '#94a3b8' }}>Type:</span> Annotation</div>
              <div><span style={{ color: '#94a3b8' }}>Annotation Type:</span> {selectedAnnotation.type}</div>
              <div><span style={{ color: '#94a3b8' }}>Text:</span> {selectedAnnotation.text || 'Note'}</div>
              <div><span style={{ color: '#94a3b8' }}>X:</span> {selectedAnnotation.xMm.toFixed(2)}mm</div>
              <div><span style={{ color: '#94a3b8' }}>Y:</span> {selectedAnnotation.yMm.toFixed(2)}mm</div>
              <div><span style={{ color: '#94a3b8' }}>Color:</span> {selectedAnnotation.color || '#ffd166'}</div>
            </div>
          )}
          {selectedCut && (
            <div className="text-xs space-y-1" style={{ color: '#d7dee9' }}>
              <div><span style={{ color: '#94a3b8' }}>Type:</span> Cut</div>
              <div><span style={{ color: '#94a3b8' }}>Strip:</span> {selectedCut.stripId}</div>
              <div><span style={{ color: '#94a3b8' }}>After Hole:</span> {selectedCut.afterHoleId}</div>
              <div><span style={{ color: '#94a3b8' }}>Color:</span> {project.settings.cutColor || '#ff5d5d'}</div>
            </div>
          )}
          {!selectedHole &&
            !selectedWire &&
            !selectedSegment &&
            !selectedComponentPinComponent &&
            !selectedComponentForEditor &&
            !selectedSolder &&
            !selectedAnnotation &&
            !selectedCut && (
              <div className="text-xs" style={{ color: '#6b7280' }}>
                No object selected
              </div>
            )}
        </CollapsibleSection>

        <CollapsibleSection title="Actions" defaultOpen>
          <div className="space-y-2">
            <button
              type="button"
              onClick={deleteSelected}
              disabled={!canDeleteSelected}
              className="w-full rounded px-3 py-2 text-sm font-medium"
              style={{
                background: canDeleteSelected ? '#9f2f2f' : '#233044',
                color: canDeleteSelected ? '#fff5f5' : '#667085',
                border: canDeleteSelected ? '1px solid #e57373' : '1px solid #2d2d44',
                cursor: canDeleteSelected ? 'pointer' : 'not-allowed',
              }}
            >
              Delete Selected
            </button>
          </div>
        </CollapsibleSection>

        {selectedComponentForEditor && selectedComponentDefinition && (
          <div className="p-3 border-b" style={{ borderBottomColor: '#2d2d44' }}>
            <h3 className="text-xs font-semibold mb-2" style={{ color: '#94a3b8' }}>
              Component Transform
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={selectedComponentForEditor.widthMm ?? selectedComponentDefinition.body.widthMm}
                onChange={(e) =>
                  updateComponentSize(
                    selectedComponentForEditor.id,
                    Number(e.target.value),
                    selectedComponentForEditor.heightMm ?? selectedComponentDefinition.body.heightMm
                  )
                }
                className="w-full px-2 py-1 rounded text-xs"
                style={{ background: '#0f3460', color: '#e0e0e0', border: '1px solid #2d2d44' }}
              />
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={selectedComponentForEditor.heightMm ?? selectedComponentDefinition.body.heightMm}
                onChange={(e) =>
                  updateComponentSize(
                    selectedComponentForEditor.id,
                    selectedComponentForEditor.widthMm ?? selectedComponentDefinition.body.widthMm,
                    Number(e.target.value)
                  )
                }
                className="w-full px-2 py-1 rounded text-xs"
                style={{ background: '#0f3460', color: '#e0e0e0', border: '1px solid #2d2d44' }}
              />
              <select
                value={selectedComponentForEditor.rotationDeg}
                onChange={(e) =>
                  updateComponentRotation(
                    selectedComponentForEditor.id,
                    Number(e.target.value) as 0 | 90 | 180 | 270
                  )
                }
                className="w-full px-2 py-1 rounded text-xs"
                style={{ background: '#0f3460', color: '#e0e0e0', border: '1px solid #2d2d44' }}
              >
                <option value={0}>0 deg</option>
                <option value={90}>90 deg</option>
                <option value={180}>180 deg</option>
                <option value={270}>270 deg</option>
              </select>
            </div>

            <div className="mt-3">
              <div className="mb-1 text-xs" style={{ color: '#94a3b8' }}>
                Placement Type
              </div>
              <select
                value={selectedComponentForEditor.placementType}
                onChange={(e) =>
                  updateComponentPlacementType(
                    selectedComponentForEditor.id,
                    e.target.value as 'onBoard' | 'external'
                  )
                }
                className="w-full px-2 py-1 rounded text-xs"
                style={{ background: '#0f3460', color: '#e0e0e0', border: '1px solid #2d2d44' }}
              >
                <option value="onBoard">On-board</option>
                <option value="external">External / Off-board</option>
              </select>
            </div>

            {selectedComponentForEditor.placementType === 'external' && (
              <div
                className="mt-3 rounded px-2 py-2 text-xs"
                style={{ background: '#102743', border: '1px solid #406a98', color: '#d7dee9' }}
              >
                External component: pins are connected using wires, not by hole alignment.
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => snapComponentPinsToNearestHoles(selectedComponentForEditor.id)}
                disabled={selectedComponentForEditor.placementType === 'external'}
                className="flex-1 px-2 py-2 rounded text-xs font-medium"
                style={{
                  background:
                    selectedComponentForEditor.placementType === 'external' ? '#23383a' : '#285943',
                  color:
                    selectedComponentForEditor.placementType === 'external' ? '#7f9bb8' : '#effff7',
                  border:
                    selectedComponentForEditor.placementType === 'external'
                      ? '1px solid #37515a'
                      : '1px solid #3f8264',
                  cursor:
                    selectedComponentForEditor.placementType === 'external'
                      ? 'not-allowed'
                      : 'pointer',
                }}
              >
                Snap pins to nearest holes
              </button>
              <button
                type="button"
                onClick={() => applyComponentPinPositionsToInstance(selectedComponentForEditor.id)}
                className="flex-1 px-2 py-2 rounded text-xs font-medium"
                style={{ background: '#2a4365', color: '#edf6ff', border: '1px solid #406a98' }}
              >
                Apply pin positions to this instance
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="text-xs font-semibold" style={{ color: '#94a3b8' }}>
                Pin Editor
              </div>
              {selectedComponentPinData.map((pin) => {
                const componentPinId = getComponentPinObjectId(selectedComponentForEditor.id, pin.pinId);
                const mappedHoleId = selectedComponentForEditor.pinHoleMap[pin.pinId];
                const pinNet = nets.find((net) => net.objectRefs.componentPins.includes(componentPinId));
                const pinStatus = getPinConnectionStatus(
                  selectedComponentForEditor.id,
                  pin.pinId,
                  mappedHoleId
                );
                const isFloating = pinStatus.label === 'Floating';

                return (
                  <div
                    key={pin.pinId}
                    className="rounded px-2 py-2 text-xs space-y-2"
                    style={{
                      background: '#102743',
                      border: `1px solid ${isFloating ? '#8a4b14' : '#243b5a'}`,
                      color: '#d7dee9',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div style={{ color: '#f8fafc', fontWeight: 600 }}>{pin.name}</div>
                      <div style={{ color: pinStatus.color }}>
                        {pinStatus.label}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="mb-1" style={{ color: '#94a3b8' }}>Local X (mm)</div>
                        <input
                          type="number"
                          step={0.1}
                          value={pin.localXMm}
                          onChange={(e) =>
                            updateComponentPinOffset(
                              selectedComponentForEditor.id,
                              pin.pinId,
                              Number(e.target.value),
                              pin.localYMm
                            )
                          }
                          className="w-full px-2 py-1 rounded text-xs"
                          style={{ background: '#0f3460', color: '#e0e0e0', border: '1px solid #2d2d44' }}
                        />
                      </div>
                      <div>
                        <div className="mb-1" style={{ color: '#94a3b8' }}>Local Y (mm)</div>
                        <input
                          type="number"
                          step={0.1}
                          value={pin.localYMm}
                          onChange={(e) =>
                            updateComponentPinOffset(
                              selectedComponentForEditor.id,
                              pin.pinId,
                              pin.localXMm,
                              Number(e.target.value)
                            )
                          }
                          className="w-full px-2 py-1 rounded text-xs"
                          style={{ background: '#0f3460', color: '#e0e0e0', border: '1px solid #2d2d44' }}
                        />
                      </div>
                    </div>
                    <div><span style={{ color: '#94a3b8' }}>Mapped Hole:</span> {mappedHoleId ?? 'None'}</div>
                    <div><span style={{ color: '#94a3b8' }}>Net:</span> {pinNet?.name ?? 'Unconnected'}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {selectedAnnotation && (
          <div className="p-3 border-b" style={{ borderBottomColor: '#2d2d44' }}>
            <h3 className="text-xs font-semibold mb-2" style={{ color: '#94a3b8' }}>
              Annotation
            </h3>
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-xs" style={{ color: '#94a3b8' }}>
                  Text
                </div>
                <input
                  type="text"
                  value={selectedAnnotation.text ?? ''}
                  onChange={(e) =>
                    updateAnnotation(selectedAnnotation.id, {
                      text: e.target.value,
                    })
                  }
                  className="w-full px-2 py-1 rounded text-xs"
                  style={{ background: '#0f3460', color: '#e0e0e0', border: '1px solid #2d2d44' }}
                />
              </div>
              <div>
                <div className="mb-1 text-xs" style={{ color: '#94a3b8' }}>
                  Color
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={selectedAnnotation.color ?? '#ffd166'}
                    onChange={(e) =>
                      updateAnnotation(selectedAnnotation.id, {
                        color: e.target.value,
                      })
                    }
                    className="w-8 h-8 rounded"
                    style={{ background: 'none', border: 'none' }}
                  />
                  <span className="text-xs" style={{ color: '#d7dee9' }}>
                    {selectedAnnotation.color ?? '#ffd166'}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="mb-1 text-xs" style={{ color: '#94a3b8' }}>
                    X (mm)
                  </div>
                  <input
                    type="number"
                    step={0.1}
                    value={selectedAnnotation.xMm}
                    onChange={(e) =>
                      updateAnnotation(selectedAnnotation.id, {
                        xMm: Number(e.target.value),
                      })
                    }
                    className="w-full px-2 py-1 rounded text-xs"
                    style={{ background: '#0f3460', color: '#e0e0e0', border: '1px solid #2d2d44' }}
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs" style={{ color: '#94a3b8' }}>
                    Y (mm)
                  </div>
                  <input
                    type="number"
                    step={0.1}
                    value={selectedAnnotation.yMm}
                    onChange={(e) =>
                      updateAnnotation(selectedAnnotation.id, {
                        yMm: Number(e.target.value),
                      })
                    }
                    className="w-full px-2 py-1 rounded text-xs"
                    style={{ background: '#0f3460', color: '#e0e0e0', border: '1px solid #2d2d44' }}
                  />
                </div>
              </div>
              <div className="text-xs" style={{ color: '#7f9bb8' }}>
                Label annotations are stored in millimeter coordinates and exported with the
                project JSON.
              </div>
            </div>
          </div>
        )}

        <CollapsibleSection title="View" defaultOpen>
          <div className="text-xs space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={project.settings.boardPrepMode}
                onChange={(e) => handleToggleBoardPrepMode(e.target.checked)}
                style={{ accentColor: '#4a90d9' }}
              />
              <span style={{ color: '#d7dee9' }}>Board Prep View</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={project.settings.boardPrepMode ? true : project.settings.showCopper}
                onChange={(e) => updateSettings({ showCopper: e.target.checked })}
                disabled={project.settings.boardPrepMode}
                style={{ accentColor: '#4a90d9' }}
              />
              <span style={{ color: project.settings.boardPrepMode ? '#667085' : '#d7dee9' }}>
                Show Copper
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={project.settings.boardPrepMode ? true : project.settings.showHoles}
                onChange={(e) => updateSettings({ showHoles: e.target.checked })}
                disabled={project.settings.boardPrepMode}
                style={{ accentColor: '#4a90d9' }}
              />
              <span style={{ color: project.settings.boardPrepMode ? '#667085' : '#d7dee9' }}>
                Show Holes
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={project.settings.boardPrepMode ? true : project.settings.showLabels}
                onChange={(e) => updateSettings({ showLabels: e.target.checked })}
                disabled={project.settings.boardPrepMode}
                style={{ accentColor: '#4a90d9' }}
              />
              <span style={{ color: project.settings.boardPrepMode ? '#667085' : '#d7dee9' }}>
                Show Labels
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={project.settings.showOppositeSideOverlay}
                onChange={(e) => updateSettings({ showOppositeSideOverlay: e.target.checked })}
                disabled={project.settings.boardPrepMode}
                style={{ accentColor: '#4a90d9' }}
              />
              <span style={{ color: project.settings.boardPrepMode ? '#667085' : '#d7dee9' }}>
                Show Opposite Side Overlay
              </span>
            </div>
            {project.settings.boardPrepMode && (
              <div className="text-xs" style={{ color: '#7f9bb8' }}>
                Prep view shows the board only: copper, holes, and cuts.
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={project.settings.autoHighlightNets}
                onChange={(e) => setAutoHighlightNets(e.target.checked)}
                style={{ accentColor: '#7c6dd0' }}
              />
              <span style={{ color: '#d7dee9' }}>Auto-follow selected net</span>
            </div>
            <div className="pt-2 space-y-3">
              <div>
                <div className="mb-1" style={{ color: '#94a3b8' }}>Board Color</div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={project.settings.boardColor}
                    onChange={(e) => updateSettings({ boardColor: e.target.value })}
                    className="w-8 h-8 rounded"
                    style={{ background: 'none', border: 'none' }}
                  />
                  <span style={{ color: '#d7dee9' }}>{project.settings.boardColor}</span>
                </div>
              </div>
              <div>
                <div className="mb-1" style={{ color: '#94a3b8' }}>Copper Color</div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={project.settings.copperColor}
                    onChange={(e) => updateSettings({ copperColor: e.target.value })}
                    className="w-8 h-8 rounded"
                    style={{ background: 'none', border: 'none' }}
                  />
                  <span style={{ color: '#d7dee9' }}>{project.settings.copperColor}</span>
                </div>
              </div>
              <div>
                <div className="mb-1" style={{ color: '#94a3b8' }}>Cut Color</div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={project.settings.cutColor ?? '#ff5d5d'}
                    onChange={(e) => updateSettings({ cutColor: e.target.value })}
                    className="w-8 h-8 rounded"
                    style={{ background: 'none', border: 'none' }}
                  />
                  <span style={{ color: '#d7dee9' }}>{project.settings.cutColor ?? '#ff5d5d'}</span>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span style={{ color: '#94a3b8' }}>Overlay Opacity</span>
                  <span style={{ color: '#d7dee9' }}>
                    {Math.round((project.settings.overlayOpacity ?? 0.3) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round((project.settings.overlayOpacity ?? 0.3) * 100)}
                  onChange={(e) => updateSettings({ overlayOpacity: Number(e.target.value) / 100 })}
                  className="w-full"
                  style={{ accentColor: '#4a90d9' }}
                />
              </div>
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Net"
          defaultOpen={!!activeNet || project.settings.autoHighlightNets}
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setHighlightedNetId(selectedNet?.id ?? null)}
                disabled={!selectedNet}
                className="px-2 py-1 rounded text-xs"
                style={{
                  background: selectedNet ? '#284b63' : '#1b2f40',
                  color: selectedNet ? '#d7dee9' : '#6b7280',
                  border: '1px solid #334e68',
                  cursor: selectedNet ? 'pointer' : 'not-allowed',
                }}
              >
                Highlight Selected Net
              </button>
              <button
                type="button"
                onClick={clearNetHighlight}
                className="px-2 py-1 rounded text-xs"
                style={{ background: '#243b55', color: '#d7dee9', border: '1px solid #334e68' }}
              >
                Clear
              </button>
            </div>
            {activeNet ? (
              <div className="space-y-3 text-xs" style={{ color: '#d7dee9' }}>
                <div>
                  <div>
                    <span style={{ color: '#94a3b8' }}>Mode:</span>{' '}
                    {highlightedNet ? 'Manual/Active Highlight' : 'Selected Object Net'}
                  </div>
                  <div><span style={{ color: '#94a3b8' }}>Name:</span> {activeNet.name}</div>
                  <div><span style={{ color: '#94a3b8' }}>Objects:</span> {getNetObjectCount(activeNet)}</div>
                  <div><span style={{ color: '#94a3b8' }}>Holes:</span> {activeNet.objectRefs.holes.length}</div>
                </div>
                {activeNet.assignedNames && activeNet.assignedNames.length > 1 && (
                  <div
                    className="rounded px-2 py-2"
                    style={{ background: '#3d241f', border: '1px solid #6f3c32', color: '#ffd8c2' }}
                  >
                    Conflicting names: {activeNet.assignedNames.join(', ')}
                  </div>
                )}
                {editableNetTarget && (
                  <div className="space-y-2">
                    <div className="text-xs" style={{ color: '#94a3b8' }}>Net Label / Color</div>
                    <input
                      type="text"
                      value={netNameValue}
                      onChange={(e) =>
                        upsertNetLabel(editableNetTarget!, {
                          netName: e.target.value,
                          color: netColorValue,
                        })
                      }
                      placeholder="Set net name"
                      className="w-full px-2 py-1 rounded text-xs"
                      style={{ background: '#0f3460', color: '#e0e0e0', border: '1px solid #2d2d44' }}
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={netColorValue}
                        onChange={(e) =>
                          upsertNetLabel(editableNetTarget!, {
                            netName: netNameValue,
                            color: e.target.value,
                          })
                        }
                        className="w-8 h-8 rounded"
                        style={{ background: 'none', border: 'none' }}
                      />
                      <span>{netColorValue}</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs" style={{ color: '#6b7280' }}>
                Select a hole, segment, wire, or component pin to inspect its connected net. Use
                manual highlight only when you want the full continuity overlay.
              </div>
            )}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Design Rule Check" defaultOpen={drcIssues.length > 0} badge={drcIssues.length}>
          <div className="text-xs mb-2" style={{ color: '#d7dee9' }}>
            {drcIssues.length} issue{drcIssues.length === 1 ? '' : 's'}
          </div>
          <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 220 }}>
            {drcIssues.length === 0 && (
              <div className="text-xs" style={{ color: '#6b7280' }}>
                No DRC issues.
              </div>
            )}
            {drcIssues.map((issue) => (
              <button
                key={issue.id}
                type="button"
                onClick={() => {
                  const firstRef = issue.objectRefs[0];
                  if (firstRef) {
                    selectObjectRef(firstRef);
                  }
                }}
                className="w-full text-left rounded px-2 py-2"
                style={{
                  background: '#102743',
                  border: `1px solid ${getSeverityColor(issue.severity)}55`,
                  color: '#d7dee9',
                }}
              >
                <div
                  className="font-semibold"
                  style={{ color: getSeverityColor(issue.severity), textTransform: 'uppercase' }}
                >
                  {issue.severity} | {issue.code}
                </div>
                <div className="mt-1">{issue.message}</div>
              </button>
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Project" defaultOpen={false}>
          <div className="text-xs space-y-1" style={{ color: '#d7dee9' }}>
            <div><span style={{ color: '#94a3b8' }}>Name:</span> {project.name}</div>
            <div><span style={{ color: '#94a3b8' }}>Size:</span> {project.board.widthMm}mm x {project.board.heightMm}mm</div>
            <div><span style={{ color: '#94a3b8' }}>Pitch:</span> {project.board.pitchMm}mm</div>
            <div><span style={{ color: '#94a3b8' }}>Segments:</span> {copperSegments.length}</div>
            <div><span style={{ color: '#94a3b8' }}>Nets:</span> {nets.length}</div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Current Tool" defaultOpen={false}>
          <div className="text-xs" style={{ color: '#d7dee9' }}>
            <div className="font-medium mb-1" style={{ color: '#f8fafc' }}>
              {selectedTool}
            </div>
            <div style={{ color: '#94a3b8' }}>
              {selectedTool === 'select' &&
                'Select objects to inspect geometry, footprint pins, nets, and DRC.'}
              {selectedTool === 'cut' &&
                'Click a hole on the bottom view to toggle a strip cut and split copper continuity.'}
              {selectedTool === 'solder' && 'Click a hole to toggle a solder joint marker.'}
              {selectedTool === 'wire' &&
                'Click two holes, or click a visible component pin and then a hole, to create a wire and bridge nets or cuts.'}
              {selectedTool === 'component' &&
                'Select a component preset in the left panel, then click in the workspace to place it from its top-left anchor.'}
              {selectedTool === 'annotation' &&
                'Set annotation text and color in the left panel, then click in the workspace to place a label.'}
            </div>
          </div>
        </CollapsibleSection>
      </div>
    </div>
  );
};
