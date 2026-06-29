import {
  Board,
  BoardSettings,
  ComponentDefinition,
  ComponentInstance,
  ConnectionEndpoint,
  CopperStrip,
  NetLabelAssignment,
  ProjectModel,
  SolderJoint,
  StripCut,
  Wire,
} from './types';
import { regenerateBoard } from './createBoard';
import { cloneComponentDefinition, createDefaultComponentDefinitions } from './componentLibrary';
import { normalizeRotationDeg } from './componentGeometry';

interface HoleRef {
  row: number;
  col: number;
}

type SerializedConnectionEndpoint =
  | { type: 'hole'; hole: HoleRef }
  | { type: 'componentPin'; componentId: string; pinId: string };

interface SerializedWire extends Omit<Wire, 'from' | 'to'> {
  from: SerializedConnectionEndpoint;
  to: SerializedConnectionEndpoint;
}

interface LegacySerializedWire extends Omit<Wire, 'from' | 'to'> {
  fromHole: HoleRef;
  toHole: HoleRef;
}

interface LegacyProjectWire extends Omit<Wire, 'from' | 'to'> {
  fromHoleId: string;
  toHoleId: string;
}

interface SerializedSolderJoint extends Omit<SolderJoint, 'holeId'> {
  hole: HoleRef;
}

interface SerializedStripCut extends Omit<StripCut, 'stripId' | 'afterHoleId'> {
  stripIndex: number;
  afterHole: HoleRef;
}

interface SerializedComponentInstance extends Omit<ComponentInstance, 'pinHoleMap'> {
  pinHoleMap: Record<string, HoleRef | null>;
}

interface SerializedProjectModelV2 {
  format: 'stripboard-studio-project';
  version: 4;
  project: {
    id: string;
    name: string;
    boardSettings: BoardSettings;
    componentDefinitions?: ComponentDefinition[];
    cuts: SerializedStripCut[];
    components: SerializedComponentInstance[];
    wires: SerializedWire[];
    solderJoints: SerializedSolderJoint[];
    annotations: ProjectModel['annotations'];
    netLabels?: NetLabelAssignment[];
    settings: ProjectModel['settings'];
  };
}

type SupportedProjectFile = SerializedProjectModelV2 | ProjectModel;

function isSerializedWireWithEndpoints(
  wire: SerializedWire | LegacySerializedWire
): wire is SerializedWire {
  return 'from' in wire && 'to' in wire;
}

function isLegacyProjectWire(value: unknown): value is LegacyProjectWire {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.fromHoleId === 'string' && typeof record.toHoleId === 'string';
}

function normalizeComponentDefinitions(
  componentDefinitions: ComponentDefinition[] | undefined
): ComponentDefinition[] {
  if (!componentDefinitions || componentDefinitions.length === 0) {
    return createDefaultComponentDefinitions();
  }

  return componentDefinitions.map(cloneComponentDefinition);
}

function normalizeProjectSettings(settings: ProjectModel['settings']): ProjectModel['settings'] {
  const overlayOpacity = settings.overlayOpacity ?? 0.3;

  return {
    ...settings,
    boardPrepMode: settings.boardPrepMode ?? false,
    autoHighlightNets: settings.autoHighlightNets ?? false,
    showOppositeSideOverlay: settings.showOppositeSideOverlay ?? false,
    boardColor: settings.boardColor ?? '#2d5a27',
    copperColor: settings.copperColor ?? '#b87333',
    cutColor: settings.cutColor ?? '#ff5d5d',
    overlayOpacity: Math.min(Math.max(overlayOpacity, 0), 1),
    canvasWidthPx: settings.canvasWidthPx ?? 1000,
    canvasHeightPx: settings.canvasHeightPx ?? 700,
  };
}

function normalizeNetLabels(netLabels: NetLabelAssignment[] | undefined): NetLabelAssignment[] {
  if (!netLabels) {
    return [];
  }

  return netLabels
    .map((label) => {
      if (label.target.type === 'segment') {
        return {
          target: {
            type: 'segment' as const,
            stripIndex: Math.max(0, Math.round(label.target.stripIndex)),
            fromHoleIndex: Math.max(0, Math.round(label.target.fromHoleIndex)),
            toHoleIndex: Math.max(0, Math.round(label.target.toHoleIndex)),
          },
          netName: label.netName?.trim() || undefined,
          color: label.color,
        };
      }

      return {
        target: {
          type: 'wire' as const,
          wireId: label.target.wireId,
        },
        netName: label.netName?.trim() || undefined,
        color: label.color,
      };
    })
    .filter((label) => {
      if (label.target.type === 'segment') {
        return label.target.fromHoleIndex <= label.target.toHoleIndex;
      }

      return label.target.wireId.trim().length > 0;
    });
}

function getHoleKey(row: number, col: number): string {
  return `${row}:${col}`;
}

function deriveBoardSettings(board: Board): BoardSettings {
  const stripCount =
    board.holes.length > 0 ? Math.max(...board.holes.map((hole) => hole.col)) + 1 : 0;
  const holesPerStrip =
    board.holes.length > 0 ? Math.max(...board.holes.map((hole) => hole.row)) + 1 : 0;

  return {
    widthMm: board.widthMm,
    heightMm: board.heightMm,
    pitchMm: board.pitchMm,
    thicknessMm: board.thicknessMm,
    stripDirection: board.stripDirection,
    stripCount,
    holesPerStrip,
  };
}

function createHoleIdLookup(board: Board): Map<string, HoleRef> {
  return new Map(
    board.holes.map((hole) => [hole.id, { row: hole.row, col: hole.col }])
  );
}

function createHoleRefLookup(board: Board): Map<string, string> {
  return new Map(
    board.holes.map((hole) => [getHoleKey(hole.row, hole.col), hole.id])
  );
}

function normalizePlacementType(
  component: Partial<Pick<ComponentInstance, 'placementType'>>,
  definition: ComponentDefinition | undefined
): ComponentInstance['placementType'] {
  return component.placementType ?? definition?.defaultPlacementType ?? 'onBoard';
}

function requireHoleRef(holeLookup: Map<string, HoleRef>, holeId: string, context: string): HoleRef {
  const holeRef = holeLookup.get(holeId);
  if (!holeRef) {
    throw new Error(`Cannot serialize missing hole "${holeId}" for ${context}.`);
  }

  return holeRef;
}

function requireHoleId(holeLookup: Map<string, string>, holeRef: HoleRef, context: string): string {
  const holeId = holeLookup.get(getHoleKey(holeRef.row, holeRef.col));
  if (!holeId) {
    throw new Error(
      `Cannot resolve hole at row ${holeRef.row + 1}, col ${holeRef.col + 1} for ${context}.`
    );
  }

  return holeId;
}

function serializeConnectionEndpoint(
  endpoint: ConnectionEndpoint,
  holeLookup: Map<string, HoleRef>,
  context: string
): SerializedConnectionEndpoint {
  if (endpoint.type === 'hole') {
    return {
      type: 'hole',
      hole: requireHoleRef(holeLookup, endpoint.holeId, context),
    };
  }

  return {
    type: 'componentPin',
    componentId: endpoint.componentId,
    pinId: endpoint.pinId,
  };
}

function deserializeConnectionEndpoint(
  endpoint: SerializedConnectionEndpoint,
  holeLookup: Map<string, string>,
  context: string
): ConnectionEndpoint {
  if (endpoint.type === 'hole') {
    return {
      type: 'hole',
      holeId: requireHoleId(holeLookup, endpoint.hole, context),
    };
  }

  return {
    type: 'componentPin',
    componentId: endpoint.componentId,
    pinId: endpoint.pinId,
  };
}

function serializePinHoleMap(
  pinHoleMap: ComponentInstance['pinHoleMap'],
  holeLookup: Map<string, HoleRef>
): Record<string, HoleRef | null> {
  return Object.fromEntries(
    Object.entries(pinHoleMap).map(([pinId, holeId]) => [
      pinId,
      holeId ? requireHoleRef(holeLookup, holeId, `component pin "${pinId}"`) : null,
    ])
  );
}

function deserializePinHoleMap(
  pinHoleMap: SerializedComponentInstance['pinHoleMap'],
  holeLookup: Map<string, string>
): ComponentInstance['pinHoleMap'] {
  return Object.fromEntries(
    Object.entries(pinHoleMap).map(([pinId, holeRef]) => [
      pinId,
      holeRef ? requireHoleId(holeLookup, holeRef, `component pin "${pinId}"`) : null,
    ])
  );
}

function normalizeComponentInstance(
  component: ComponentInstance,
  definition: ComponentDefinition | undefined
): ComponentInstance {
  const pinLayoutOverrides = Object.fromEntries(
    Object.entries(component.pinLayoutOverrides ?? {}).filter((entry) => {
      const value = entry[1];
      return (
        !!value &&
        Number.isFinite(value.xMm) &&
        Number.isFinite(value.yMm)
      );
    })
  );

  return {
    ...component,
    placementType: normalizePlacementType(component, definition),
    rotationDeg: normalizeRotationDeg(component.rotationDeg),
    pinLayoutOverrides,
  };
}

function serializeCuts(strips: CopperStrip[], holeLookup: Map<string, HoleRef>): SerializedStripCut[] {
  return strips.flatMap((strip) =>
    strip.cuts.map((cut) => ({
      id: cut.id,
      stripIndex: strip.index,
      afterHole: requireHoleRef(holeLookup, cut.afterHoleId, `cut "${cut.id}"`),
      side: cut.side,
      completed: cut.completed,
    }))
  );
}

function deserializeCuts(
  strips: CopperStrip[],
  serializedCuts: SerializedStripCut[],
  holeLookup: Map<string, string>
): CopperStrip[] {
  return strips.map((strip) => ({
    ...strip,
    cuts: serializedCuts
      .filter((cut) => cut.stripIndex === strip.index)
      .map((cut) => ({
        id: cut.id,
        stripId: strip.id,
        afterHoleId: requireHoleId(
          holeLookup,
          cut.afterHole,
          `cut "${cut.id}" on strip ${strip.index + 1}`
        ),
        side: cut.side,
        completed: cut.completed,
      })),
  }));
}

function serializeProject(project: ProjectModel): SerializedProjectModelV2 {
  const holeLookup = createHoleIdLookup(project.board);
  const definitionsById = new Map(
    normalizeComponentDefinitions(project.componentDefinitions).map((definition) => [
      definition.id,
      definition,
    ])
  );

  return {
    format: 'stripboard-studio-project',
    version: 4,
    project: {
      id: project.id,
      name: project.name,
      boardSettings: deriveBoardSettings(project.board),
      componentDefinitions: normalizeComponentDefinitions(project.componentDefinitions),
      cuts: serializeCuts(project.board.strips, holeLookup),
      components: project.components.map((component) => ({
        ...normalizeComponentInstance(component, definitionsById.get(component.definitionId)),
        pinHoleMap: serializePinHoleMap(component.pinHoleMap, holeLookup),
      })),
      wires: project.wires.map((wire) => ({
        id: wire.id,
        from: serializeConnectionEndpoint(wire.from, holeLookup, `wire "${wire.id}" start`),
        to: serializeConnectionEndpoint(wire.to, holeLookup, `wire "${wire.id}" end`),
        side: wire.side,
        color: wire.color,
        label: wire.label,
      })),
      solderJoints: project.solderJoints.map((joint) => ({
        id: joint.id,
        hole: requireHoleRef(holeLookup, joint.holeId, `solder joint "${joint.id}"`),
        side: joint.side,
        color: joint.color,
        completed: joint.completed,
      })),
      annotations: project.annotations,
      netLabels: normalizeNetLabels(project.netLabels),
      settings: project.settings,
    },
  };
}

function deserializeProject(serializedProject: SerializedProjectModelV2): ProjectModel {
  const board = regenerateBoard(serializedProject.project.boardSettings);
  const holeLookup = createHoleRefLookup(board);
  const componentDefinitions = normalizeComponentDefinitions(
    serializedProject.project.componentDefinitions
  );
  const definitionsById = new Map(
    componentDefinitions.map((definition) => [definition.id, definition])
  );

  return {
    id: serializedProject.project.id,
    name: serializedProject.project.name,
    board: {
      ...board,
      strips: deserializeCuts(board.strips, serializedProject.project.cuts, holeLookup),
    },
    componentDefinitions,
    components: serializedProject.project.components.map((component) =>
      normalizeComponentInstance({
        ...component,
        pinHoleMap: deserializePinHoleMap(component.pinHoleMap, holeLookup),
      }, definitionsById.get(component.definitionId))
    ),
    wires: (serializedProject.project.wires as Array<SerializedWire | LegacySerializedWire>).map(
      (wire) => {
        const from = isSerializedWireWithEndpoints(wire)
          ? deserializeConnectionEndpoint(wire.from, holeLookup, `wire "${wire.id}" start`)
          : deserializeConnectionEndpoint(
              { type: 'hole', hole: wire.fromHole },
              holeLookup,
              `wire "${wire.id}" start`
            );
        const to = isSerializedWireWithEndpoints(wire)
          ? deserializeConnectionEndpoint(wire.to, holeLookup, `wire "${wire.id}" end`)
          : deserializeConnectionEndpoint(
              { type: 'hole', hole: wire.toHole },
              holeLookup,
              `wire "${wire.id}" end`
            );

        return {
          id: wire.id,
          from,
          to,
          side: wire.side,
          color: wire.color,
          label: wire.label,
        };
      }
    ),
    solderJoints: serializedProject.project.solderJoints.map((joint) => ({
      id: joint.id,
      holeId: requireHoleId(holeLookup, joint.hole, `solder joint "${joint.id}"`),
      side: joint.side,
      color: joint.color,
      completed: joint.completed,
    })),
    annotations: serializedProject.project.annotations,
    netLabels: normalizeNetLabels(serializedProject.project.netLabels),
    settings: normalizeProjectSettings(serializedProject.project.settings),
  };
}

function isSerializedProjectModelV2(value: unknown): value is SerializedProjectModelV2 {
  if (!value || typeof value !== 'object') return false;

  const record = value as Record<string, unknown>;
  return (
    record.format === 'stripboard-studio-project' &&
    (record.version === 2 || record.version === 3 || record.version === 4) &&
    !!record.project &&
    typeof record.project === 'object'
  );
}

function isLegacyProjectModel(value: unknown): value is ProjectModel {
  if (!value || typeof value !== 'object') return false;

  const record = value as Record<string, unknown>;
  const board = record.board as Record<string, unknown> | undefined;
  return (
    typeof record.id === 'string' &&
    typeof record.name === 'string' &&
    Array.isArray(record.components) &&
    Array.isArray(record.wires) &&
    Array.isArray(record.solderJoints) &&
    Array.isArray(record.annotations) &&
    !!record.settings &&
    !!board &&
    Array.isArray(board.holes) &&
    Array.isArray(board.strips)
  );
}

export function exportProjectToJson(project: ProjectModel): string {
  return JSON.stringify(serializeProject(project), null, 2);
}

export function importProjectFromJson(json: string): ProjectModel {
  const parsed = JSON.parse(json) as SupportedProjectFile;

  if (isSerializedProjectModelV2(parsed)) {
    return deserializeProject(parsed);
  }

  if (isLegacyProjectModel(parsed)) {
    const componentDefinitions = normalizeComponentDefinitions(parsed.componentDefinitions);
    const definitionsById = new Map(
      componentDefinitions.map((definition) => [definition.id, definition])
    );

    return {
      ...parsed,
      componentDefinitions,
      components: parsed.components.map((component) =>
        normalizeComponentInstance(
          {
            ...component,
            placementType:
              component.placementType ??
              definitionsById.get(component.definitionId)?.defaultPlacementType ??
              'onBoard',
          },
          definitionsById.get(component.definitionId)
        )
      ),
      wires: (parsed.wires as Array<Wire | LegacyProjectWire>).map((wire) =>
        isLegacyProjectWire(wire)
          ? {
              id: wire.id,
              from: { type: 'hole' as const, holeId: wire.fromHoleId },
              to: { type: 'hole' as const, holeId: wire.toHoleId },
              side: wire.side,
              color: wire.color,
              label: wire.label,
            }
          : wire
      ),
      netLabels: normalizeNetLabels(parsed.netLabels),
      settings: normalizeProjectSettings(parsed.settings),
    };
  }

  throw new Error('Unsupported project file format.');
}

export function saveToLocalStorage(project: ProjectModel): void {
  try {
    localStorage.setItem('stripboard-studio-project', exportProjectToJson(project));
  } catch (error) {
    console.error('Failed to save to localStorage:', error);
  }
}

export function loadFromLocalStorage(): ProjectModel | null {
  try {
    const saved = localStorage.getItem('stripboard-studio-project');
    if (!saved) return null;

    return importProjectFromJson(saved);
  } catch (error) {
    console.error('Failed to load from localStorage:', error);
    return null;
  }
}
