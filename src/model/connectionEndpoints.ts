import {
  Board,
  ComponentDefinition,
  ComponentInstance,
  ConnectionEndpoint,
  Hole,
  Wire,
} from './types';
import { getComponentPinObjectId } from './electricalIds';
import { getComponentPinPositionsMm } from './componentGeometry';

export interface ResolvedConnectionEndpoint {
  endpoint: ConnectionEndpoint;
  hole?: Hole;
  component?: ComponentInstance;
  componentDefinition?: ComponentDefinition;
  pinId?: string;
  pinName?: string;
  xMm: number;
  yMm: number;
}

export function isSameConnectionEndpoint(
  left: ConnectionEndpoint | null,
  right: ConnectionEndpoint | null
): boolean {
  if (!left || !right || left.type !== right.type) {
    return false;
  }

  if (left.type === 'hole' && right.type === 'hole') {
    return left.holeId === right.holeId;
  }

  return (
    left.type === 'componentPin' &&
    right.type === 'componentPin' &&
    left.componentId === right.componentId &&
    left.pinId === right.pinId
  );
}

export function isHoleEndpoint(endpoint: ConnectionEndpoint): endpoint is { type: 'hole'; holeId: string } {
  return endpoint.type === 'hole';
}

export function isComponentPinEndpoint(
  endpoint: ConnectionEndpoint
): endpoint is { type: 'componentPin'; componentId: string; pinId: string } {
  return endpoint.type === 'componentPin';
}

export function getConnectionEndpointComponentPinObjectId(
  endpoint: ConnectionEndpoint
): string | null {
  if (!isComponentPinEndpoint(endpoint)) {
    return null;
  }

  return getComponentPinObjectId(endpoint.componentId, endpoint.pinId);
}

export function wireUsesComponentId(wire: Wire, componentId: string): boolean {
  return [wire.from, wire.to].some(
    (endpoint) => isComponentPinEndpoint(endpoint) && endpoint.componentId === componentId
  );
}

export function wireUsesComponentPin(wire: Wire, componentId: string, pinId: string): boolean {
  return [wire.from, wire.to].some(
    (endpoint) =>
      isComponentPinEndpoint(endpoint) &&
      endpoint.componentId === componentId &&
      endpoint.pinId === pinId
  );
}

export function resolveConnectionEndpoint(
  endpoint: ConnectionEndpoint,
  board: Board,
  components: ComponentInstance[],
  componentDefinitions: ComponentDefinition[]
): ResolvedConnectionEndpoint | null {
  if (isHoleEndpoint(endpoint)) {
    const hole = board.holes.find((entry) => entry.id === endpoint.holeId);
    if (!hole) {
      return null;
    }

    return {
      endpoint,
      hole,
      xMm: hole.xMm,
      yMm: hole.yMm,
    };
  }

  const component = components.find((entry) => entry.id === endpoint.componentId);
  if (!component) {
    return null;
  }

  const componentDefinition = componentDefinitions.find(
    (entry) => entry.id === component.definitionId
  );
  if (!componentDefinition) {
    return null;
  }

  const pin = getComponentPinPositionsMm(component, componentDefinition).find(
    (entry) => entry.pinId === endpoint.pinId
  );
  if (!pin) {
    return null;
  }

  return {
    endpoint,
    component,
    componentDefinition,
    pinId: pin.pinId,
    pinName: pin.name,
    xMm: pin.xMm,
    yMm: pin.yMm,
  };
}

export function getConnectionEndpointDisplayName(
  endpoint: ConnectionEndpoint,
  board: Board,
  components: ComponentInstance[],
  componentDefinitions: ComponentDefinition[]
): string {
  const resolved = resolveConnectionEndpoint(endpoint, board, components, componentDefinitions);

  if (!resolved) {
    if (endpoint.type === 'hole') {
      return `Hole ${endpoint.holeId}`;
    }

    return `${endpoint.componentId} ${endpoint.pinId}`;
  }

  if (resolved.hole) {
    return `Hole R${resolved.hole.row + 1} C${resolved.hole.col + 1}`;
  }

  if (endpoint.type === 'componentPin') {
    return `${resolved.component?.name ?? endpoint.componentId} ${resolved.pinName ?? endpoint.pinId}`;
  }

  return `Hole ${endpoint.holeId}`;
}
