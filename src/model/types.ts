export type Side = "top" | "bottom";
export type WireSide = Side | "external";
export type StripDirection = "horizontal" | "vertical";
export type ToolMode = "select" | "cut" | "solder" | "wire" | "component" | "annotation" | "colorSegment";
export type PlacementType = "onBoard" | "external";

export interface ProjectModel {
  id: string;
  name: string;
  board: Board;
  componentDefinitions: ComponentDefinition[];
  components: ComponentInstance[];
  wires: Wire[];
  solderJoints: SolderJoint[];
  annotations: Annotation[];
  netLabels: NetLabelAssignment[];
  settings: ProjectSettings;
}

export interface BoardSettings {
  widthMm: number;
  heightMm: number;
  pitchMm: number;
  thicknessMm: number;
  stripDirection: StripDirection;
  stripCount: number;
  holesPerStrip: number;
}

export interface Board {
  widthMm: number;
  heightMm: number;
  pitchMm: number;
  thicknessMm: number;
  stripDirection: StripDirection;
  strips: CopperStrip[];
  holes: Hole[];
}

export interface Hole {
  id: string;
  row: number;
  col: number;
  xMm: number;
  yMm: number;
}

export interface CopperStrip {
  id: string;
  index: number;
  holeIds: string[];
  cuts: StripCut[];
}

export interface StripCut {
  id: string;
  stripId: string;
  afterHoleId: string;
  side: "bottom";
  completed?: boolean;
}

export interface CopperSegment {
  id: string;
  stripId: string;
  stripIndex: number;
  fromHoleIndex: number;
  toHoleIndex: number;
  holeIds: string[];
  netName?: string;
  color?: string;
}

export interface Wire {
  id: string;
  from: ConnectionEndpoint;
  to: ConnectionEndpoint;
  side: WireSide;
  color: string;
  label?: string;
}

export type ConnectionEndpoint =
  | { type: "hole"; holeId: string }
  | { type: "componentPin"; componentId: string; pinId: string };

export interface SolderJoint {
  id: string;
  holeId: string;
  side: Side;
  color?: string;
  completed?: boolean;
}

export interface ComponentPinDefinition {
  id: string;
  name: string;
  xMm: number;
  yMm: number;
  electricalType?: "power" | "ground" | "passive" | "input" | "output";
}

export interface ComponentDefinition {
  id: string;
  name: string;
  category: string;
  body: {
    widthMm: number;
    heightMm: number;
  };
  pins: ComponentPinDefinition[];
  defaultColor?: string;
  defaultPlacementType?: PlacementType;
}

export interface ComponentPinLayoutMm {
  xMm: number;
  yMm: number;
}

export interface ComponentInstance {
  id: string;
  definitionId: string;
  name: string;
  xMm: number;
  yMm: number;
  widthMm?: number;
  heightMm?: number;
  rotationDeg: 0 | 90 | 180 | 270;
  placementType: PlacementType;
  pinLayoutOverrides: Record<string, ComponentPinLayoutMm>;
  pinHoleMap: Record<string, string | null>;
  color?: string;
}

export interface Annotation {
  id: string;
  type: "label" | "area" | "keepout" | "dimension";
  text?: string;
  xMm: number;
  yMm: number;
  color?: string;
}

export interface NetLabelSegmentTarget {
  type: "segment";
  stripIndex: number;
  fromHoleIndex: number;
  toHoleIndex: number;
}

export interface NetLabelWireTarget {
  type: "wire";
  wireId: string;
}

export type NetLabelTarget = NetLabelSegmentTarget | NetLabelWireTarget;

export interface NetLabelAssignment {
  target: NetLabelTarget;
  netName?: string;
  color?: string;
}

export interface ProjectSettings {
  activeView: "top" | "bottom" | "split";
  boardPrepMode: boolean;
  autoHighlightNets: boolean;
  showCopper: boolean;
  showHoles: boolean;
  showLabels: boolean;
  showOppositeSideOverlay: boolean;
  boardColor: string;
  copperColor: string;
  cutColor: string;
  overlayOpacity: number;
  gridSnap: boolean;
  canvasWidthPx: number;
  canvasHeightPx: number;
}

export type ElectricalNodeType =
  | "hole"
  | "copperSegment"
  | "wire"
  | "componentPin"
  | "solderJoint";

export interface ElectricalNode {
  id: string;
  type: ElectricalNodeType;
  objectId: string;
}

export interface ElectricalEdge {
  from: string;
  to: string;
  reason:
    | "hole-on-copper-segment"
    | "wire-end"
    | "component-pin-to-hole"
    | "solder-on-hole";
}

export interface ElectricalGraph {
  nodes: ElectricalNode[];
  edges: ElectricalEdge[];
}

export interface Net {
  id: string;
  name: string;
  nodeIds: string[];
  objectRefs: {
    holes: string[];
    copperSegments: string[];
    wires: string[];
    componentPins: string[];
    solderJoints: string[];
  };
  color?: string;
  assignedNames?: string[];
  assignedColors?: string[];
}

export interface DrcIssue {
  id: string;
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  objectRefs: string[];
}

export interface ProjectElectricalAnalysis {
  copperSegments: CopperSegment[];
  electricalGraph: ElectricalGraph;
  nets: Net[];
  drcIssues: DrcIssue[];
}

export type SelectableId =
  | { type: "hole"; id: string }
  | { type: "wire"; id: string }
  | { type: "component"; id: string }
  | { type: "componentPin"; id: string }
  | { type: "solder"; id: string }
  | { type: "cut"; id: string }
  | { type: "segment"; id: string }
  | { type: "annotation"; id: string };
