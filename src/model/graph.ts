import { deriveCopperSegments } from "./copperSegments";
import { getConnectionEndpointComponentPinObjectId } from "./connectionEndpoints";
import {
  CopperSegment,
  ElectricalEdge,
  ElectricalGraph,
  ElectricalNode,
  ProjectModel,
} from "./types";
import {
  getComponentPinNodeId,
  getComponentPinObjectId,
  getCopperSegmentNodeId,
  getHoleNodeId,
  getSolderJointNodeId,
  getWireNodeId,
} from "./electricalIds";

function addNode(nodes: Map<string, ElectricalNode>, node: ElectricalNode): void {
  nodes.set(node.id, node);
}

function addEdge(edges: ElectricalEdge[], edge: ElectricalEdge): void {
  edges.push(edge);
}

function addWireEndpointEdge(
  edges: ElectricalEdge[],
  holeIds: Set<string>,
  wireNodeId: string,
  endpoint: ProjectModel["wires"][number]["from"]
): void {
  if (endpoint.type === "hole") {
    if (!holeIds.has(endpoint.holeId)) {
      return;
    }

    addEdge(edges, {
      from: wireNodeId,
      to: getHoleNodeId(endpoint.holeId),
      reason: "wire-end",
    });
    return;
  }

  const componentPinId = getConnectionEndpointComponentPinObjectId(endpoint);
  if (!componentPinId) {
    return;
  }

  addEdge(edges, {
    from: wireNodeId,
    to: getComponentPinNodeId(componentPinId),
    reason: "wire-end",
  });
}

export function buildElectricalGraphFromSegments(
  project: ProjectModel,
  copperSegments: CopperSegment[]
): ElectricalGraph {
  const nodes = new Map<string, ElectricalNode>();
  const edges: ElectricalEdge[] = [];
  const holeIds = new Set(project.board.holes.map((hole) => hole.id));

  project.board.holes.forEach((hole) => {
    addNode(nodes, {
      id: getHoleNodeId(hole.id),
      type: "hole",
      objectId: hole.id,
    });
  });

  copperSegments.forEach((segment) => {
    const segmentNodeId = getCopperSegmentNodeId(segment.id);
    addNode(nodes, {
      id: segmentNodeId,
      type: "copperSegment",
      objectId: segment.id,
    });

    segment.holeIds.forEach((holeId) => {
      if (!holeIds.has(holeId)) {
        return;
      }

      addEdge(edges, {
        from: segmentNodeId,
        to: getHoleNodeId(holeId),
        reason: "hole-on-copper-segment",
      });
    });
  });

  project.wires.forEach((wire) => {
    const wireNodeId = getWireNodeId(wire.id);
    addNode(nodes, {
      id: wireNodeId,
      type: "wire",
      objectId: wire.id,
    });

    addWireEndpointEdge(edges, holeIds, wireNodeId, wire.from);
    addWireEndpointEdge(edges, holeIds, wireNodeId, wire.to);
  });

  project.components.forEach((component) => {
    Object.entries(component.pinHoleMap).forEach(([pinId, holeId]) => {
      const componentPinId = getComponentPinObjectId(component.id, pinId);
      const componentPinNodeId = getComponentPinNodeId(componentPinId);

      addNode(nodes, {
        id: componentPinNodeId,
        type: "componentPin",
        objectId: componentPinId,
      });

      if (holeId && holeIds.has(holeId)) {
        addEdge(edges, {
          from: componentPinNodeId,
          to: getHoleNodeId(holeId),
          reason: "component-pin-to-hole",
        });
      }
    });
  });

  project.solderJoints.forEach((joint) => {
    const solderJointNodeId = getSolderJointNodeId(joint.id);
    addNode(nodes, {
      id: solderJointNodeId,
      type: "solderJoint",
      objectId: joint.id,
    });

    if (holeIds.has(joint.holeId)) {
      addEdge(edges, {
        from: solderJointNodeId,
        to: getHoleNodeId(joint.holeId),
        reason: "solder-on-hole",
      });
    }
  });

  return {
    nodes: Array.from(nodes.values()),
    edges,
  };
}

export function deriveElectricalGraph(project: ProjectModel): ElectricalGraph {
  const copperSegments = deriveCopperSegments(project);
  return buildElectricalGraphFromSegments(project, copperSegments);
}
