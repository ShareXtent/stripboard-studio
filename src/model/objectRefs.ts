import { SelectableId } from "./types";

type ObjectRefType = SelectableId["type"];

export function toObjectRef(type: ObjectRefType, id: string): string {
  return `${type}:${id}`;
}

export function selectableToObjectRef(selectable: SelectableId): string {
  return toObjectRef(selectable.type, selectable.id);
}

export function parseObjectRef(objectRef: string): SelectableId | null {
  const separatorIndex = objectRef.indexOf(":");
  if (separatorIndex < 0) {
    return null;
  }

  const type = objectRef.slice(0, separatorIndex);
  const id = objectRef.slice(separatorIndex + 1);

  switch (type) {
    case "hole":
    case "wire":
    case "component":
    case "componentPin":
    case "solder":
    case "cut":
    case "segment":
      return { type, id };
    default:
      return null;
  }
}
