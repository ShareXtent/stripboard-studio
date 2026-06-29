import { deriveCopperSegments } from "./copperSegments";
import { wireUsesComponentPin } from "./connectionEndpoints";
import { getComponentPinObjectId } from "./electricalIds";
import { buildElectricalGraphFromSegments } from "./graph";
import { buildNetsFromGraph } from "./nets";
import { DrcIssue, Net, ProjectModel } from "./types";
import { toObjectRef } from "./objectRefs";

function sortIssueRefs(objectRefs: string[]): string[] {
  return Array.from(new Set(objectRefs)).sort((left, right) => left.localeCompare(right));
}

function createIssue(
  id: string,
  severity: DrcIssue["severity"],
  code: string,
  message: string,
  objectRefs: string[]
): DrcIssue {
  return {
    id,
    severity,
    code,
    message,
    objectRefs: sortIssueRefs(objectRefs),
  };
}

function isMeaningfulNet(net: Net | undefined, componentPinId: string): boolean {
  if (!net) {
    return false;
  }

  return (
    net.objectRefs.copperSegments.length > 0 ||
    net.objectRefs.wires.length > 0 ||
    net.objectRefs.solderJoints.length > 0 ||
    net.objectRefs.componentPins.some((pinId) => pinId !== componentPinId)
  );
}

export function runDesignRuleChecks(project: ProjectModel): DrcIssue[] {
  const copperSegments = deriveCopperSegments(project);
  const electricalGraph = buildElectricalGraphFromSegments(project, copperSegments);
  const nets = buildNetsFromGraph(project, copperSegments, electricalGraph);
  const issues: DrcIssue[] = [];
  const boardHoleIds = new Set(project.board.holes.map((hole) => hole.id));
  const stripsById = new Map(project.board.strips.map((strip) => [strip.id, strip]));
  const componentsById = new Map(project.components.map((component) => [component.id, component]));
  const definitionsById = new Map(
    project.componentDefinitions.map((definition) => [definition.id, definition])
  );
  const netByComponentPinId = new Map<string, Net>();

  nets.forEach((net) => {
    net.objectRefs.componentPins.forEach((componentPinId) => {
      netByComponentPinId.set(componentPinId, net);
    });

    if ((net.assignedNames?.length ?? 0) > 1) {
      issues.push(
        createIssue(
          `named-net-short:${net.id}`,
          "error",
          "NAMED_NET_SHORT",
          `Net "${net.name}" contains conflicting labels: ${net.assignedNames!.join(", ")}.`,
          [
            ...net.objectRefs.copperSegments.map((segmentId) => toObjectRef("segment", segmentId)),
            ...net.objectRefs.wires.map((wireId) => toObjectRef("wire", wireId)),
            ...net.objectRefs.componentPins.map((componentPinId) =>
              toObjectRef("componentPin", componentPinId)
            ),
          ]
        )
      );
    }
  });

  project.components.forEach((component) => {
    const definition = definitionsById.get(component.definitionId);
    const pinEntries =
      definition?.pins.map((pin) => ({ pinId: pin.id, pinName: pin.name })) ??
      Object.keys(component.pinHoleMap).map((pinId) => ({ pinId, pinName: pinId }));

    pinEntries.forEach(({ pinId, pinName }) => {
      const holeId = component.pinHoleMap[pinId] ?? null;
      const componentPinId = getComponentPinObjectId(component.id, pinId);
      const net = netByComponentPinId.get(componentPinId);
      const hasWireConnection = project.wires.some((wire) =>
        wireUsesComponentPin(wire, component.id, pinId)
      );

      if (holeId && !boardHoleIds.has(holeId)) {
        issues.push(
          createIssue(
            `invalid-pin-hole:${componentPinId}`,
            "error",
            "INVALID_COMPONENT_PIN_HOLE",
            `Component "${component.name}" pin "${pinName}" references an invalid hole.`,
            [toObjectRef("componentPin", componentPinId), toObjectRef("component", component.id)]
          )
        );
        return;
      }

      if (!holeId && !hasWireConnection) {
        const isExternal = component.placementType === "external";
        issues.push(
          createIssue(
            `${isExternal ? "unconnected-external-pin" : "unconnected-pin"}:${componentPinId}`,
            "warning",
            isExternal ? "UNCONNECTED_EXTERNAL_COMPONENT_PIN" : "UNCONNECTED_COMPONENT_PIN",
            isExternal
              ? `External component pin ${pinName} is not connected.`
              : `Component "${component.name}" pin "${pinName}" is not connected.`,
            [toObjectRef("componentPin", componentPinId), toObjectRef("component", component.id)]
          )
        );
        return;
      }

      if (component.placementType !== "external" && !isMeaningfulNet(net, componentPinId)) {
        issues.push(
          createIssue(
            `floating-pin:${componentPinId}`,
            "warning",
            "FLOATING_COMPONENT_PIN",
            `Component "${component.name}" pin "${pinName}" is not connected to a meaningful net.`,
            [
              toObjectRef("componentPin", componentPinId),
              ...(holeId ? [toObjectRef("hole", holeId)] : []),
              toObjectRef("component", component.id),
            ]
          )
        );
      }
    });
  });

  project.wires.forEach((wire) => {
    const missingEndpoints = [wire.from, wire.to]
      .map((endpoint, index) => {
        const label = index === 0 ? "start" : "end";

        if (endpoint.type === "hole") {
          return !boardHoleIds.has(endpoint.holeId) ? `${label} hole` : null;
        }

        const component = componentsById.get(endpoint.componentId);
        if (!component) {
          return `${label} component pin`;
        }

        const definition = definitionsById.get(component.definitionId);
        const hasPin = !!definition?.pins.some((pin) => pin.id === endpoint.pinId);

        return hasPin ? null : `${label} component pin`;
      })
      .filter((value): value is string => !!value);

    if (missingEndpoints.length > 0) {
      issues.push(
        createIssue(
          `floating-wire:${wire.id}`,
          "warning",
          "FLOATING_WIRE",
          `Wire "${wire.id}" has invalid ${missingEndpoints.join(" and ")} reference(s).`,
          [toObjectRef("wire", wire.id)]
        )
      );
    }
  });

  project.board.strips.forEach((strip) => {
    strip.cuts.forEach((cut) => {
      const owningStrip = stripsById.get(cut.stripId);
      const hasValidHole = !!owningStrip && owningStrip.holeIds.includes(cut.afterHoleId);

      if (!owningStrip || !hasValidHole) {
        issues.push(
          createIssue(
            `cut-sanity:${cut.id}`,
            "warning",
            "INVALID_CUT_REFERENCE",
            `Cut "${cut.id}" does not reference a valid strip/hole pair.`,
            [toObjectRef("cut", cut.id)]
          )
        );
      }
    });
  });

  const labelUsage = new Map<string, string[]>();
  project.components.forEach((component) => {
    const label = component.name.trim();
    if (!label) {
      return;
    }

    const componentIds = labelUsage.get(label) ?? [];
    componentIds.push(component.id);
    labelUsage.set(label, componentIds);
  });

  labelUsage.forEach((componentIds, label) => {
    if (componentIds.length < 2) {
      return;
    }

    issues.push(
      createIssue(
        `duplicate-component-label:${label}`,
        "warning",
        "DUPLICATE_COMPONENT_LABEL",
        `Component label "${label}" is used ${componentIds.length} times.`,
        componentIds.map((componentId) => toObjectRef("component", componentId))
      )
    );
  });

  const severityOrder: Record<DrcIssue['severity'], number> = {
    error: 0,
    warning: 1,
    info: 2,
  };

  return issues.sort(
    (left, right) =>
      severityOrder[left.severity] - severityOrder[right.severity] ||
      left.id.localeCompare(right.id)
  );
}
