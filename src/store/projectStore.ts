import { create } from 'zustand';
import { deriveProjectElectricalAnalysis } from '../model/analysis';
import { wireUsesComponentId } from '../model/connectionEndpoints';
import {
  createInstancePinLayoutOverrides,
  deriveComponentPinHoleMap,
  normalizeRotationDeg,
} from '../model/componentGeometry';
import {
  buildLinearPins,
  createDefaultComponentDefinitions,
  normalizeComponentDefinitions,
  sanitizeComponentPinHoleMap,
} from '../model/componentLibrary';
import { regenerateBoard } from '../model/createBoard';
import { parseComponentPinObjectId } from '../model/electricalIds';
import { findNetIdForSelectable } from '../model/nets';
import { parseObjectRef } from '../model/objectRefs';
import {
  Annotation,
  Board,
  BoardSettings,
  ComponentDefinition,
  ComponentInstance,
  ConnectionEndpoint,
  CopperSegment,
  DrcIssue,
  ElectricalGraph,
  Net,
  NetLabelTarget,
  ProjectModel,
  SelectableId,
  SolderJoint,
  ToolMode,
  Wire,
} from '../model/types';
import { generateId } from '../utils/ids';

function deriveBoardSettings(project: ProjectModel): BoardSettings {
  const stripCount =
    project.board.holes.length > 0
      ? Math.max(...project.board.holes.map((hole) => hole.col)) + 1
      : 0;
  const holesPerStrip =
    project.board.holes.length > 0
      ? Math.max(...project.board.holes.map((hole) => hole.row)) + 1
      : 0;

  return {
    widthMm: project.board.widthMm,
    heightMm: project.board.heightMm,
    pitchMm: project.board.pitchMm,
    thicknessMm: project.board.thicknessMm,
    stripDirection: project.board.stripDirection,
    stripCount,
    holesPerStrip,
  };
}

interface ProjectState {
  project: ProjectModel | null;
  copperSegments: CopperSegment[];
  electricalGraph: ElectricalGraph;
  nets: Net[];
  drcIssues: DrcIssue[];
  selectedTool: ToolMode;
  selectedId: SelectableId | null;
  highlightedNetId: string | null;
  wireStartEndpoint: ConnectionEndpoint | null;
  wireColor: string;
  componentDefinitions: ComponentDefinition[];
  selectedComponentDefinitionId: string | null;
  componentLabel: string;
  componentColor: string;
  annotationText: string;
  annotationColor: string;
  componentWidthMm: number;
  componentHeightMm: number;
  componentRotationDeg: ComponentInstance['rotationDeg'];
  componentPlacementType: ComponentInstance['placementType'];
  boardSettings: BoardSettings;
  solderColor: string;
  setProject: (project: ProjectModel) => void;
  setSelectedTool: (tool: ToolMode) => void;
  setSelectedId: (id: SelectableId | null) => void;
  setHighlightedNetId: (netId: string | null) => void;
  setAutoHighlightNets: (enabled: boolean) => void;
  clearNetHighlight: () => void;
  selectObjectRef: (objectRef: string) => void;
  setWireStartEndpoint: (endpoint: ConnectionEndpoint | null) => void;
  setWireColor: (color: string) => void;
  setComponentDefinitions: (definitions: ComponentDefinition[]) => void;
  setSelectedComponentDefinitionId: (id: string | null) => void;
  setComponentLabel: (label: string) => void;
  setComponentColor: (color: string) => void;
  setAnnotationText: (text: string) => void;
  setAnnotationColor: (color: string) => void;
  setComponentWidthMm: (widthMm: number) => void;
  setComponentHeightMm: (heightMm: number) => void;
  setComponentRotationDeg: (rotationDeg: ComponentInstance['rotationDeg']) => void;
  setComponentPlacementType: (placementType: ComponentInstance['placementType']) => void;
  setBoardSettings: (settings: Partial<BoardSettings>) => void;
  setSolderColor: (color: string) => void;
  upsertNetLabel: (
    target: NetLabelTarget,
    updates: { netName?: string; color?: string }
  ) => void;
  addAnnotation: (annotation: Annotation) => void;
  addComponent: (component: ComponentInstance) => void;
  addWire: (wire: Wire) => void;
  addComponentDefinition: (definition?: ComponentDefinition) => void;
  updateComponentDefinition: (
    definitionId: string,
    updates: Partial<Pick<ComponentDefinition, 'name' | 'category' | 'defaultColor'>> & {
      widthMm?: number;
      heightMm?: number;
      pinCount?: number;
    }
  ) => void;
  addSolderJoint: (joint: Omit<SolderJoint, 'id'> & { id?: string }) => void;
  updateBoard: (board: Board) => void;
  resetProject: () => void;
  deleteSelected: () => void;
  updateAnnotation: (
    annotationId: string,
    updates: Partial<Pick<Annotation, 'text' | 'color' | 'xMm' | 'yMm'>>
  ) => void;
  updateComponentPosition: (componentId: string, xMm: number, yMm: number) => void;
  updateComponentSize: (componentId: string, widthMm: number, heightMm: number) => void;
  updateComponentRotation: (componentId: string, rotationDeg: ComponentInstance['rotationDeg']) => void;
  updateComponentPlacementType: (
    componentId: string,
    placementType: ComponentInstance['placementType']
  ) => void;
  updateComponentPinOffset: (
    componentId: string,
    pinId: string,
    xMm: number,
    yMm: number
  ) => void;
  snapComponentPinsToNearestHoles: (componentId: string) => void;
  applyComponentPinPositionsToInstance: (componentId: string) => void;
}

const defaultComponentDefinitions = createDefaultComponentDefinitions();
const emptyElectricalGraph: ElectricalGraph = { nodes: [], edges: [] };

function cloneDefinitions(definitions: ComponentDefinition[]): ComponentDefinition[] {
  return normalizeComponentDefinitions(definitions);
}

function getDefaultProjectSettings(): ProjectModel['settings'] {
  return {
    activeView: 'top',
    boardPrepMode: false,
    autoHighlightNets: false,
    showCopper: true,
    showHoles: true,
    showLabels: true,
    showOppositeSideOverlay: false,
    boardColor: '#2d5a27',
    copperColor: '#b87333',
    cutColor: '#ff5d5d',
    overlayOpacity: 0.3,
    gridSnap: true,
    canvasWidthPx: 1000,
    canvasHeightPx: 700,
  };
}

function isSameNetLabelTarget(left: NetLabelTarget, right: NetLabelTarget): boolean {
  if (left.type !== right.type) {
    return false;
  }

  if (left.type === 'segment' && right.type === 'segment') {
    return (
      left.stripIndex === right.stripIndex &&
      left.fromHoleIndex === right.fromHoleIndex &&
      left.toHoleIndex === right.toHoleIndex
    );
  }

  return left.type === 'wire' && right.type === 'wire' && left.wireId === right.wireId;
}

function sanitizePinLayoutOverrides(
  pinLayoutOverrides: ComponentInstance['pinLayoutOverrides'] | undefined,
  definition: ComponentDefinition
): ComponentInstance['pinLayoutOverrides'] {
  return Object.fromEntries(
    definition.pins.flatMap((pin) => {
      const override = pinLayoutOverrides?.[pin.id];

      if (!override || !Number.isFinite(override.xMm) || !Number.isFinite(override.yMm)) {
        return [];
      }

      return [[pin.id, { xMm: override.xMm, yMm: override.yMm }] as const];
    })
  );
}

function syncComponentInstance(
  component: ComponentInstance,
  board: Board,
  componentDefinitions: ComponentDefinition[]
): ComponentInstance {
  const definition = componentDefinitions.find((entry) => entry.id === component.definitionId);
  const normalizedComponent = {
    ...component,
    rotationDeg: normalizeRotationDeg(component.rotationDeg),
    placementType: component.placementType ?? definition?.defaultPlacementType ?? 'onBoard',
  };

  if (!definition) {
    return {
      ...normalizedComponent,
      pinLayoutOverrides: {},
      pinHoleMap: sanitizeComponentPinHoleMap(normalizedComponent.pinHoleMap, []),
    };
  }

  const pinLayoutOverrides = sanitizePinLayoutOverrides(
    normalizedComponent.pinLayoutOverrides,
    definition
  );

  return {
    ...normalizedComponent,
    pinLayoutOverrides,
    pinHoleMap:
      normalizedComponent.placementType === 'onBoard'
        ? deriveComponentPinHoleMap(
            {
              ...normalizedComponent,
              pinLayoutOverrides,
            },
            definition,
            board
          )
        : sanitizeComponentPinHoleMap(normalizedComponent.pinHoleMap, definition.pins),
  };
}

function normalizeProjectModel(
  project: ProjectModel,
  componentDefinitions: ComponentDefinition[]
): ProjectModel {
  return {
    ...project,
    componentDefinitions,
    components: project.components.map((component) =>
      syncComponentInstance(component, project.board, componentDefinitions)
    ),
    annotations: project.annotations ?? [],
    netLabels: project.netLabels ?? [],
    settings: {
      ...getDefaultProjectSettings(),
      ...project.settings,
      overlayOpacity: Math.min(Math.max(project.settings.overlayOpacity ?? 0.3, 0), 1),
    },
  };
}

function isSelectablePresent(
  project: ProjectModel,
  copperSegments: CopperSegment[],
  selectedId: SelectableId | null
): boolean {
  if (!selectedId) {
    return false;
  }

  switch (selectedId.type) {
    case 'hole':
      return project.board.holes.some((hole) => hole.id === selectedId.id);
    case 'wire':
      return project.wires.some((wire) => wire.id === selectedId.id);
    case 'component':
      return project.components.some((component) => component.id === selectedId.id);
    case 'componentPin': {
      const componentPin = parseComponentPinObjectId(selectedId.id);
      if (!componentPin) {
        return false;
      }

      return project.components.some(
        (component) =>
          component.id === componentPin.componentId &&
          Object.prototype.hasOwnProperty.call(component.pinHoleMap, componentPin.pinId)
      );
    }
    case 'solder':
      return project.solderJoints.some((joint) => joint.id === selectedId.id);
    case 'cut':
      return project.board.strips.some((strip) => strip.cuts.some((cut) => cut.id === selectedId.id));
    case 'segment':
      return copperSegments.some((segment) => segment.id === selectedId.id);
    case 'annotation':
      return project.annotations.some((annotation) => annotation.id === selectedId.id);
    default:
      return false;
  }
}

function createDefaultProject(
  boardSettings: BoardSettings,
  componentDefinitions: ComponentDefinition[]
): ProjectModel {
  return {
    id: generateId(),
    name: 'Untitled Stripboard Project',
    board: regenerateBoard(boardSettings),
    componentDefinitions,
    components: [],
    wires: [],
    solderJoints: [],
    annotations: [],
    netLabels: [],
    settings: getDefaultProjectSettings(),
  };
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: null,
  copperSegments: [],
  electricalGraph: emptyElectricalGraph,
  nets: [],
  drcIssues: [],
  selectedTool: 'select',
  selectedId: null,
  highlightedNetId: null,
  wireStartEndpoint: null,
  wireColor: '#ff0000',
  componentDefinitions: defaultComponentDefinitions,
  selectedComponentDefinitionId: null,
  componentLabel: '',
  componentColor: '#888888',
  annotationText: 'Note',
  annotationColor: '#ffd166',
  componentWidthMm: defaultComponentDefinitions[0].body.widthMm,
  componentHeightMm: defaultComponentDefinitions[0].body.heightMm,
  componentRotationDeg: 0,
  componentPlacementType: defaultComponentDefinitions[0].defaultPlacementType ?? 'onBoard',
  boardSettings: {
    widthMm: 100,
    heightMm: 50,
    pitchMm: 2.54,
    thicknessMm: 1.6,
    stripDirection: 'vertical',
    stripCount: 39,
    holesPerStrip: 19,
  },
  solderColor: '#c0c0c0',

  setProject: (project) => {
    const state = get();
    const componentDefinitions =
      project.componentDefinitions.length > 0
        ? cloneDefinitions(project.componentDefinitions)
        : createDefaultComponentDefinitions();
    const normalizedProject = normalizeProjectModel(project, componentDefinitions);
    const analysis = deriveProjectElectricalAnalysis(normalizedProject);
    const selectedDefinition = componentDefinitions.find(
      (definition) => definition.id === state.selectedComponentDefinitionId
    );
    const nextSelectedId = isSelectablePresent(
      normalizedProject,
      analysis.copperSegments,
      state.selectedId
    )
      ? state.selectedId
      : null;
    const persistedHighlightedNetId =
      state.highlightedNetId && analysis.nets.some((net) => net.id === state.highlightedNetId)
        ? state.highlightedNetId
        : null;
    const nextHighlightedNetId =
      persistedHighlightedNetId ??
      (normalizedProject.settings.autoHighlightNets
        ? findNetIdForSelectable(nextSelectedId, analysis.nets)
        : null);

    set({
      project: normalizedProject,
      copperSegments: analysis.copperSegments,
      electricalGraph: analysis.electricalGraph,
      nets: analysis.nets,
      drcIssues: analysis.drcIssues,
      boardSettings: deriveBoardSettings(normalizedProject),
      componentDefinitions,
      selectedId: nextSelectedId,
      highlightedNetId: nextHighlightedNetId,
      selectedComponentDefinitionId: selectedDefinition ? selectedDefinition.id : null,
      componentWidthMm: selectedDefinition?.body.widthMm ?? state.componentWidthMm,
      componentHeightMm: selectedDefinition?.body.heightMm ?? state.componentHeightMm,
    });
  },
  setSelectedTool: (tool) =>
    set({
      selectedTool: tool,
      selectedId: null,
      highlightedNetId: null,
      wireStartEndpoint: null,
    }),
  setSelectedId: (id) =>
    set((state) => ({
      selectedId: id,
      highlightedNetId: state.project?.settings.autoHighlightNets
        ? findNetIdForSelectable(id, state.nets)
        : state.highlightedNetId,
    })),
  setHighlightedNetId: (netId) =>
    set((state) => ({
      highlightedNetId: netId && state.nets.some((net) => net.id === netId) ? netId : null,
    })),
  setAutoHighlightNets: (enabled) => {
    const state = get();
    if (!state.project) {
      return;
    }

    get().setProject({
      ...state.project,
      settings: {
        ...state.project.settings,
        autoHighlightNets: enabled,
      },
    });

    if (enabled) {
      set({
        highlightedNetId: findNetIdForSelectable(get().selectedId, get().nets),
      });
    } else {
      set({
        highlightedNetId: null,
      });
    }
  },
  clearNetHighlight: () => set({ highlightedNetId: null }),
  selectObjectRef: (objectRef) => {
    const selectable = parseObjectRef(objectRef);
    get().setSelectedId(selectable);
  },
  setWireStartEndpoint: (endpoint) => set({ wireStartEndpoint: endpoint }),
  setWireColor: (color) => set({ wireColor: color }),
  setComponentDefinitions: (definitions) => {
    const state = get();
    const nextDefinitions = cloneDefinitions(definitions);
    const missingActiveDefinitions = state.project
      ? state.project.components
          .map((component) => component.definitionId)
          .filter((definitionId, index, array) => array.indexOf(definitionId) === index)
          .filter(
            (definitionId) => !nextDefinitions.some((definition) => definition.id === definitionId)
          )
          .map((definitionId) =>
            state.componentDefinitions.find((definition) => definition.id === definitionId)
          )
          .filter((definition): definition is ComponentDefinition => !!definition)
      : [];
    const mergedDefinitions = [...nextDefinitions, ...cloneDefinitions(missingActiveDefinitions)];

    set({
      componentDefinitions: mergedDefinitions,
    });

    if (state.project) {
      get().setProject({
        ...state.project,
        componentDefinitions: mergedDefinitions,
      });
    }
  },
  setSelectedComponentDefinitionId: (id) => {
    const state = get();
    const definition = state.componentDefinitions.find((entry) => entry.id === id);

    set({
      selectedComponentDefinitionId: id,
      componentWidthMm: definition?.body.widthMm ?? state.componentWidthMm,
      componentHeightMm: definition?.body.heightMm ?? state.componentHeightMm,
      componentPlacementType: definition?.defaultPlacementType ?? 'onBoard',
    });
  },
  setComponentLabel: (label) => set({ componentLabel: label }),
  setComponentColor: (color) => set({ componentColor: color }),
  setAnnotationText: (text) => set({ annotationText: text }),
  setAnnotationColor: (color) => set({ annotationColor: color }),
  setComponentWidthMm: (widthMm) => set({ componentWidthMm: Math.max(0.5, widthMm) }),
  setComponentHeightMm: (heightMm) => set({ componentHeightMm: Math.max(0.5, heightMm) }),
  setComponentRotationDeg: (rotationDeg) =>
    set({ componentRotationDeg: normalizeRotationDeg(rotationDeg) }),
  setComponentPlacementType: (placementType) => set({ componentPlacementType: placementType }),
  setBoardSettings: (settings) => {
    const state = get();
    const draftSettings = { ...state.boardSettings, ...settings };
    const newSettings = {
      ...draftSettings,
      stripCount: Math.floor(draftSettings.widthMm / draftSettings.pitchMm),
      holesPerStrip: Math.floor(draftSettings.heightMm / draftSettings.pitchMm),
    };

    set({ boardSettings: newSettings });

    if (state.project) {
      const board = regenerateBoard(newSettings);
      get().setProject({
        ...state.project,
        board,
      });
    }
  },
  setSolderColor: (color) => set({ solderColor: color }),
  upsertNetLabel: (target, updates) => {
    const state = get();
    if (!state.project) {
      return;
    }

    const netName = updates.netName?.trim() || undefined;
    const color = updates.color?.trim() || undefined;
    const nextNetLabels = state.project.netLabels.filter(
      (label) => !isSameNetLabelTarget(label.target, target)
    );

    if (netName || color) {
      nextNetLabels.push({
        target,
        netName,
        color,
      });
    }

    get().setProject({
      ...state.project,
      netLabels: nextNetLabels,
    });
  },
  addAnnotation: (annotation) => {
    const state = get();
    if (!state.project) {
      return;
    }

    get().setProject({
      ...state.project,
      annotations: [...state.project.annotations, annotation],
    });
  },
  addComponent: (component) => {
    const state = get();
    if (!state.project) {
      return;
    }

    get().setProject({
      ...state.project,
      components: [...state.project.components, component],
    });
  },
  addComponentDefinition: (definition) => {
    const state = get();
    const baseDefinition = definition
      ? {
          ...cloneDefinitions([definition])[0],
          id: `custom_${Date.now()}`,
          name: `${definition.name} Copy`,
        }
      : {
          id: `custom_${Date.now()}`,
          name: 'Custom Component',
          category: 'Custom',
          body: { widthMm: 20, heightMm: 10 },
          pins: buildLinearPins(2, 20),
          defaultColor: '#888888',
          defaultPlacementType: 'onBoard' as const,
        };
    const nextDefinitions = [...state.componentDefinitions, baseDefinition];

    set({
      componentDefinitions: nextDefinitions,
      selectedComponentDefinitionId: baseDefinition.id,
      componentWidthMm: baseDefinition.body.widthMm,
      componentHeightMm: baseDefinition.body.heightMm,
      componentColor: baseDefinition.defaultColor ?? state.componentColor,
      componentPlacementType: baseDefinition.defaultPlacementType ?? 'onBoard',
    });

    if (state.project) {
      get().setProject({
        ...state.project,
        componentDefinitions: nextDefinitions,
      });
    }
  },
  updateComponentDefinition: (definitionId, updates) => {
    const state = get();
    const nextDefinitions = state.componentDefinitions.map((definition) => {
      if (definition.id !== definitionId) {
        return definition;
      }

      const widthMm =
        updates.widthMm !== undefined ? Math.max(0.5, updates.widthMm) : definition.body.widthMm;
      const heightMm =
        updates.heightMm !== undefined
          ? Math.max(0.5, updates.heightMm)
          : definition.body.heightMm;
      const nextPins = buildLinearPins(
        updates.pinCount ?? definition.pins.length,
        widthMm,
        definition.pins
      );

      return {
        ...definition,
        name: updates.name !== undefined ? updates.name || definition.name : definition.name,
        category: updates.category ?? definition.category,
        defaultColor: updates.defaultColor ?? definition.defaultColor,
        body: {
          widthMm,
          heightMm,
        },
        pins: nextPins,
      };
    });
    const updatedDefinition = nextDefinitions.find((definition) => definition.id === definitionId);

    set({
      componentDefinitions: nextDefinitions,
      componentWidthMm:
        state.selectedComponentDefinitionId === definitionId && updatedDefinition
          ? updatedDefinition.body.widthMm
          : state.componentWidthMm,
      componentHeightMm:
        state.selectedComponentDefinitionId === definitionId && updatedDefinition
          ? updatedDefinition.body.heightMm
          : state.componentHeightMm,
    });

    if (state.project) {
      get().setProject({
        ...state.project,
        componentDefinitions: nextDefinitions,
      });
    }
  },
  addWire: (wire) => {
    const state = get();
    if (!state.project) {
      return;
    }

    get().setProject({
      ...state.project,
      wires: [...state.project.wires, wire],
    });
  },
  addSolderJoint: (joint) => {
    const state = get();
    if (!state.project) {
      return;
    }

    get().setProject({
      ...state.project,
      solderJoints: [
        ...state.project.solderJoints,
        { ...joint, id: joint.id || `solder_${Date.now()}` },
      ],
    });
  },
  updateBoard: (board) => {
    const state = get();
    if (!state.project) {
      return;
    }

    get().setProject({
      ...state.project,
      board,
    });
  },
  resetProject: () => {
    const settings = get().boardSettings;
    const componentDefinitions = createDefaultComponentDefinitions();

    set({
      selectedTool: 'select',
      selectedId: null,
      highlightedNetId: null,
      wireStartEndpoint: null,
      componentDefinitions,
      selectedComponentDefinitionId: null,
      annotationText: 'Note',
      annotationColor: '#ffd166',
      componentWidthMm: componentDefinitions[0].body.widthMm,
      componentHeightMm: componentDefinitions[0].body.heightMm,
      componentRotationDeg: 0,
      componentPlacementType: componentDefinitions[0].defaultPlacementType ?? 'onBoard',
    });

    get().setProject(createDefaultProject(settings, componentDefinitions));
  },
  deleteSelected: () => {
    const state = get();
    if (!state.project || !state.selectedId) {
      return;
    }

    const { project } = state;

    switch (state.selectedId.type) {
      case 'wire':
        get().setProject({
          ...project,
          wires: project.wires.filter((wire) => wire.id !== state.selectedId!.id),
        });
        break;
      case 'component':
        get().setProject({
          ...project,
          components: project.components.filter((component) => component.id !== state.selectedId!.id),
          wires: project.wires.filter((wire) => !wireUsesComponentId(wire, state.selectedId!.id)),
        });
        break;
      case 'solder':
        get().setProject({
          ...project,
          solderJoints: project.solderJoints.filter((joint) => joint.id !== state.selectedId!.id),
        });
        break;
      case 'cut':
        get().setProject({
          ...project,
          board: {
            ...project.board,
            strips: project.board.strips.map((strip) => ({
              ...strip,
              cuts: strip.cuts.filter((cut) => cut.id !== state.selectedId!.id),
            })),
          },
        });
        break;
      case 'annotation':
        get().setProject({
          ...project,
          annotations: project.annotations.filter(
            (annotation) => annotation.id !== state.selectedId!.id
          ),
        });
        break;
      default:
        break;
    }

    set({ selectedId: null, highlightedNetId: null });
  },
  updateAnnotation: (annotationId, updates) => {
    const state = get();
    if (!state.project) {
      return;
    }

    get().setProject({
      ...state.project,
      annotations: state.project.annotations.map((annotation) =>
        annotation.id === annotationId
          ? {
              ...annotation,
              ...updates,
              text:
                updates.text !== undefined
                  ? updates.text
                  : annotation.text,
            }
          : annotation
      ),
    });
  },
  updateComponentPosition: (componentId, xMm, yMm) => {
    const state = get();
    if (!state.project) {
      return;
    }

    get().setProject({
      ...state.project,
      components: state.project.components.map((component) =>
        component.id === componentId ? { ...component, xMm, yMm } : component
      ),
    });
  },
  updateComponentSize: (componentId, widthMm, heightMm) => {
    const state = get();
    if (!state.project) {
      return;
    }

    get().setProject({
      ...state.project,
      components: state.project.components.map((component) =>
        component.id === componentId
          ? {
              ...component,
              widthMm: Math.max(0.5, widthMm),
              heightMm: Math.max(0.5, heightMm),
            }
          : component
      ),
    });
  },
  updateComponentRotation: (componentId, rotationDeg) => {
    const state = get();
    if (!state.project) {
      return;
    }

    get().setProject({
      ...state.project,
      components: state.project.components.map((component) =>
        component.id === componentId
          ? {
              ...component,
              rotationDeg: normalizeRotationDeg(rotationDeg),
            }
          : component
        ),
    });
  },
  updateComponentPlacementType: (componentId, placementType) => {
    const state = get();
    if (!state.project) {
      return;
    }

    get().setProject({
      ...state.project,
      components: state.project.components.map((component) =>
        component.id === componentId
          ? {
              ...component,
              placementType,
            }
          : component
      ),
    });
  },
  updateComponentPinOffset: (componentId, pinId, xMm, yMm) => {
    const state = get();
    if (!state.project) {
      return;
    }

    get().setProject({
      ...state.project,
      components: state.project.components.map((component) =>
        component.id === componentId
          ? {
              ...component,
              pinLayoutOverrides: {
                ...component.pinLayoutOverrides,
                [pinId]: {
                  xMm,
                  yMm,
                },
              },
            }
          : component
      ),
    });
  },
  snapComponentPinsToNearestHoles: (componentId) => {
    const state = get();
    if (!state.project) {
      return;
    }

    get().setProject({
      ...state.project,
      components: state.project.components.map((component) =>
        component.id === componentId
          ? {
              ...component,
              pinHoleMap: {
                ...component.pinHoleMap,
              },
            }
          : component
      ),
    });
  },
  applyComponentPinPositionsToInstance: (componentId) => {
    const state = get();
    if (!state.project) {
      return;
    }

    get().setProject({
      ...state.project,
      components: state.project.components.map((component) => {
        if (component.id !== componentId) {
          return component;
        }

        const definition = state.componentDefinitions.find(
          (entry) => entry.id === component.definitionId
        );

        if (!definition) {
          return component;
        }

        return {
          ...component,
          pinLayoutOverrides: createInstancePinLayoutOverrides(component, definition),
        };
      }),
    });
  },
}));
