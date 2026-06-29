import componentLibraryData from '../data/component-library.json';
import {
  ComponentDefinition,
  ComponentPinDefinition,
  ComponentInstance,
  PlacementType,
} from './types';

interface ComponentLibraryFile {
  format?: string;
  version?: number;
  definitions: ComponentDefinition[];
}

const VALID_ELECTRICAL_TYPES = new Set<ComponentPinDefinition['electricalType']>([
  'power',
  'ground',
  'passive',
  'input',
  'output',
]);
const VALID_PLACEMENT_TYPES = new Set<PlacementType>(['onBoard', 'external']);

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isElectricalType(value: unknown): value is NonNullable<ComponentPinDefinition['electricalType']> {
  return typeof value === 'string' && VALID_ELECTRICAL_TYPES.has(value as ComponentPinDefinition['electricalType']);
}

function isPlacementType(value: unknown): value is PlacementType {
  return typeof value === 'string' && VALID_PLACEMENT_TYPES.has(value as PlacementType);
}

function extractComponentDefinitions(value: unknown): ComponentDefinition[] {
  if (Array.isArray(value)) {
    return value as ComponentDefinition[];
  }

  if (isObject(value) && Array.isArray(value.definitions)) {
    return value.definitions as ComponentDefinition[];
  }

  throw new Error('Unsupported component library format.');
}

function requireText(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Component library field "${fieldName}" must be a non-empty string.`);
  }

  return value.trim();
}

function normalizeComponentPinDefinition(
  pin: unknown,
  index: number,
  componentId: string
): ComponentPinDefinition {
  if (!isObject(pin)) {
    throw new Error(`Pin ${index + 1} on component "${componentId}" is invalid.`);
  }

  const id = requireText(pin.id, `components[${componentId}].pins[${index}].id`);
  const name = requireText(pin.name, `components[${componentId}].pins[${index}].name`);
  const xMm = Number(pin.xMm);
  const yMm = Number(pin.yMm);

  if (!Number.isFinite(xMm) || !Number.isFinite(yMm)) {
    throw new Error(`Pin "${id}" on component "${componentId}" must have numeric xMm/yMm values.`);
  }

  return {
    id,
    name,
    xMm,
    yMm,
    electricalType: isElectricalType(pin.electricalType) ? pin.electricalType : undefined,
  };
}

function clampDimensionMm(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0.5, value);
}

export function clampPinCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.max(1, Math.min(32, Math.round(value)));
}

export function buildLinearPins(
  pinCount: number,
  widthMm: number,
  existingPins: ComponentPinDefinition[] = []
): ComponentPinDefinition[] {
  const safePinCount = clampPinCount(pinCount);
  const safeWidthMm = clampDimensionMm(widthMm, 10);
  const marginMm =
    safePinCount === 1
      ? safeWidthMm / 2
      : Math.min(Math.max(safeWidthMm * 0.16, 1.27), safeWidthMm / 3);
  const usableWidthMm = Math.max(0, safeWidthMm - marginMm * 2);

  return Array.from({ length: safePinCount }, (_, index) => {
    const previousPin = existingPins[index];
    const xMm =
      safePinCount === 1
        ? safeWidthMm / 2
        : marginMm + (usableWidthMm * index) / Math.max(1, safePinCount - 1);

    return {
      id: `pin${index + 1}`,
      name: previousPin?.name ?? `${index + 1}`,
      xMm,
      yMm: 0,
      electricalType: previousPin?.electricalType ?? 'passive',
    };
  });
}

export function sanitizeComponentPinHoleMap(
  pinHoleMap: ComponentInstance['pinHoleMap'],
  pins: ComponentPinDefinition[]
): ComponentInstance['pinHoleMap'] {
  return Object.fromEntries(pins.map((pin) => [pin.id, pinHoleMap[pin.id] ?? null]));
}

export function cloneComponentDefinition(definition: ComponentDefinition): ComponentDefinition {
  return {
    ...definition,
    body: { ...definition.body },
    pins: definition.pins.map((pin) => ({ ...pin })),
  };
}

function normalizeComponentDefinition(definition: unknown, index: number): ComponentDefinition {
  if (!isObject(definition)) {
    throw new Error(`Component definition at index ${index} is invalid.`);
  }

  const id = requireText(definition.id, `components[${index}].id`);
  const name = requireText(definition.name, `components[${index}].name`);
  const category =
    typeof definition.category === 'string' && definition.category.trim().length > 0
      ? definition.category.trim()
      : 'Custom';

  if (!isObject(definition.body)) {
    throw new Error(`Component "${id}" is missing a valid body object.`);
  }

  const widthMm = clampDimensionMm(Number(definition.body.widthMm), 10);
  const heightMm = clampDimensionMm(Number(definition.body.heightMm), 5);
  const pins = Array.isArray(definition.pins)
    ? definition.pins.map((pin, pinIndex) => normalizeComponentPinDefinition(pin, pinIndex, id))
    : buildLinearPins(2, widthMm);

  return {
    id,
    name,
    category,
    body: {
      widthMm,
      heightMm,
    },
    pins,
    defaultColor: typeof definition.defaultColor === 'string' ? definition.defaultColor : undefined,
    defaultPlacementType: isPlacementType(definition.defaultPlacementType)
      ? definition.defaultPlacementType
      : 'onBoard',
  };
}

export function normalizeComponentDefinitions(definitions: ComponentDefinition[]): ComponentDefinition[] {
  const normalizedDefinitions = definitions.map((definition, index) =>
    normalizeComponentDefinition(definition, index)
  );
  const seenIds = new Set<string>();

  normalizedDefinitions.forEach((definition) => {
    if (seenIds.has(definition.id)) {
      throw new Error(`Duplicate component definition id "${definition.id}" in component library.`);
    }
    seenIds.add(definition.id);
  });

  return normalizedDefinitions.map(cloneComponentDefinition);
}

export function createDefaultComponentDefinitions(): ComponentDefinition[] {
  return normalizeComponentDefinitions(extractComponentDefinitions(componentLibraryData));
}

export function exportComponentLibraryToJson(definitions: ComponentDefinition[]): string {
  const file: ComponentLibraryFile = {
    format: 'stripboard-studio-component-library',
    version: 1,
    definitions: normalizeComponentDefinitions(definitions),
  };

  return JSON.stringify(file, null, 2);
}

export function importComponentLibraryFromJson(json: string): ComponentDefinition[] {
  const parsed = JSON.parse(json) as unknown;
  return normalizeComponentDefinitions(extractComponentDefinitions(parsed));
}
