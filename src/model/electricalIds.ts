export const COMPONENT_PIN_SEPARATOR = "::";

export function getComponentPinObjectId(componentId: string, pinId: string): string {
  return `${componentId}${COMPONENT_PIN_SEPARATOR}${pinId}`;
}

export function parseComponentPinObjectId(
  objectId: string
): { componentId: string; pinId: string } | null {
  const separatorIndex = objectId.indexOf(COMPONENT_PIN_SEPARATOR);
  if (separatorIndex < 0) {
    return null;
  }

  return {
    componentId: objectId.slice(0, separatorIndex),
    pinId: objectId.slice(separatorIndex + COMPONENT_PIN_SEPARATOR.length),
  };
}

export function getHoleNodeId(holeId: string): string {
  return `hole:${holeId}`;
}

export function getCopperSegmentNodeId(segmentId: string): string {
  return `copperSegment:${segmentId}`;
}

export function getWireNodeId(wireId: string): string {
  return `wire:${wireId}`;
}

export function getComponentPinNodeId(componentPinId: string): string {
  return `componentPin:${componentPinId}`;
}

export function getSolderJointNodeId(solderJointId: string): string {
  return `solderJoint:${solderJointId}`;
}
