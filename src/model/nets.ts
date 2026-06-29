import { deriveCopperSegments } from "./copperSegments";
import { buildElectricalGraphFromSegments } from "./graph";
import { NetLabelAssignment, CopperSegment, ElectricalGraph, Net, ProjectModel, SelectableId } from "./types";

function sortUnique(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function getWireLabelAssignments(project: ProjectModel, wireIds: string[]): NetLabelAssignment[] {
  const wireIdSet = new Set(wireIds);
  return project.netLabels.filter(
    (label) => label.target.type === "wire" && wireIdSet.has(label.target.wireId)
  );
}

function getSegmentAssignments(copperSegments: CopperSegment[]): NetLabelAssignment[] {
  return copperSegments
    .filter((segment) => segment.netName || segment.color)
    .map((segment) => ({
      target: {
        type: "segment" as const,
        stripIndex: segment.stripIndex,
        fromHoleIndex: segment.fromHoleIndex,
        toHoleIndex: segment.toHoleIndex,
      },
      netName: segment.netName,
      color: segment.color,
    }));
}

export function buildNetsFromGraph(
  project: ProjectModel,
  copperSegments: CopperSegment[],
  electricalGraph: ElectricalGraph
): Net[] {
  const adjacency = new Map<string, Set<string>>();
  const nodeById = new Map(electricalGraph.nodes.map((node) => [node.id, node]));

  electricalGraph.nodes.forEach((node) => {
    adjacency.set(node.id, new Set<string>());
  });

  electricalGraph.edges.forEach((edge) => {
    if (!adjacency.has(edge.from)) {
      adjacency.set(edge.from, new Set<string>());
    }
    if (!adjacency.has(edge.to)) {
      adjacency.set(edge.to, new Set<string>());
    }

    adjacency.get(edge.from)!.add(edge.to);
    adjacency.get(edge.to)!.add(edge.from);
  });

  const nets: Net[] = [];
  const visited = new Set<string>();
  const segmentsById = new Map(copperSegments.map((segment) => [segment.id, segment]));

  Array.from(adjacency.keys())
    .sort((left, right) => left.localeCompare(right))
    .forEach((startNodeId) => {
      if (visited.has(startNodeId)) {
        return;
      }

      const stack = [startNodeId];
      const componentNodeIds: string[] = [];

      while (stack.length > 0) {
        const nodeId = stack.pop();
        if (!nodeId || visited.has(nodeId)) {
          continue;
        }

        visited.add(nodeId);
        componentNodeIds.push(nodeId);

        const neighbors = adjacency.get(nodeId);
        if (!neighbors) {
          continue;
        }

        neighbors.forEach((neighborId) => {
          if (!visited.has(neighborId)) {
            stack.push(neighborId);
          }
        });
      }

      const sortedNodeIds = componentNodeIds.sort((left, right) => left.localeCompare(right));
      const holes: string[] = [];
      const copperSegmentIds: string[] = [];
      const wireIds: string[] = [];
      const componentPins: string[] = [];
      const solderJoints: string[] = [];

      sortedNodeIds.forEach((nodeId) => {
        const node = nodeById.get(nodeId);
        if (!node) {
          return;
        }

        switch (node.type) {
          case "hole":
            holes.push(node.objectId);
            break;
          case "copperSegment":
            copperSegmentIds.push(node.objectId);
            break;
          case "wire":
            wireIds.push(node.objectId);
            break;
          case "componentPin":
            componentPins.push(node.objectId);
            break;
          case "solderJoint":
            solderJoints.push(node.objectId);
            break;
        }
      });

      const segmentAssignments = getSegmentAssignments(
        copperSegmentIds
          .map((segmentId) => segmentsById.get(segmentId))
          .filter((segment): segment is CopperSegment => !!segment)
      );
      const wireAssignments = getWireLabelAssignments(project, wireIds);
      const labelAssignments = [...segmentAssignments, ...wireAssignments];
      const assignedNames = sortUnique(
        labelAssignments
          .map((assignment) => assignment.netName?.trim())
          .filter((value): value is string => !!value)
      );
      const assignedColors = sortUnique(
        labelAssignments
          .map((assignment) => assignment.color?.trim())
          .filter((value): value is string => !!value)
      );

      nets.push({
        id: `net:${sortedNodeIds[0]}`,
        name: assignedNames[0] ?? `NET-${String(nets.length + 1).padStart(3, "0")}`,
        nodeIds: sortedNodeIds,
        objectRefs: {
          holes,
          copperSegments: copperSegmentIds,
          wires: wireIds,
          componentPins,
          solderJoints,
        },
        color: assignedColors[0],
        assignedNames,
        assignedColors,
      });
    });

  return nets;
}

export function deriveNets(project: ProjectModel): Net[] {
  const copperSegments = deriveCopperSegments(project);
  const electricalGraph = buildElectricalGraphFromSegments(project, copperSegments);
  return buildNetsFromGraph(project, copperSegments, electricalGraph);
}

export function findNetIdForSelectable(selectable: SelectableId | null, nets: Net[]): string | null {
  if (!selectable) {
    return null;
  }

  const matchingNet = nets.find((net) => {
    switch (selectable.type) {
      case "hole":
        return net.objectRefs.holes.includes(selectable.id);
      case "wire":
        return net.objectRefs.wires.includes(selectable.id);
      case "componentPin":
        return net.objectRefs.componentPins.includes(selectable.id);
      case "solder":
        return net.objectRefs.solderJoints.includes(selectable.id);
      case "segment":
        return net.objectRefs.copperSegments.includes(selectable.id);
      default:
        return false;
    }
  });

  return matchingNet?.id ?? null;
}
