import { Board, ComponentDefinition, ComponentInstance } from './types';

export type RotationDeg = ComponentInstance['rotationDeg'];

export interface ComponentSizeMm {
  widthMm: number;
  heightMm: number;
}

export interface ComponentMarkerLineMm {
  x1Mm: number;
  y1Mm: number;
  x2Mm: number;
  y2Mm: number;
}

export function normalizeRotationDeg(rotationDeg: number | undefined): RotationDeg {
  const normalized = ((((rotationDeg ?? 0) % 360) + 360) % 360) as number;

  if (normalized === 90 || normalized === 180 || normalized === 270) {
    return normalized;
  }

  return 0;
}

export function getComponentBodySizeMm(
  component: Pick<ComponentInstance, 'widthMm' | 'heightMm'>,
  definition: Pick<ComponentDefinition, 'body'>
): ComponentSizeMm {
  return {
    widthMm: component.widthMm ?? definition.body.widthMm,
    heightMm: component.heightMm ?? definition.body.heightMm,
  };
}

export function getRotatedFootprintSizeMm(
  widthMm: number,
  heightMm: number,
  rotationDeg: RotationDeg
): ComponentSizeMm {
  if (rotationDeg === 90 || rotationDeg === 270) {
    return {
      widthMm: heightMm,
      heightMm: widthMm,
    };
  }

  return {
    widthMm,
    heightMm,
  };
}

export function getComponentFootprintSizeMm(
  component: Pick<ComponentInstance, 'widthMm' | 'heightMm' | 'rotationDeg'>,
  definition: Pick<ComponentDefinition, 'body'>
): ComponentSizeMm {
  const bodySize = getComponentBodySizeMm(component, definition);
  return getRotatedFootprintSizeMm(
    bodySize.widthMm,
    bodySize.heightMm,
    normalizeRotationDeg(component.rotationDeg)
  );
}

export function rotatePointInComponentMm(
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number,
  rotationDeg: RotationDeg
): { xMm: number; yMm: number } {
  switch (rotationDeg) {
    case 90:
      return {
        xMm: heightMm - yMm,
        yMm: xMm,
      };
    case 180:
      return {
        xMm: widthMm - xMm,
        yMm: heightMm - yMm,
      };
    case 270:
      return {
        xMm: yMm,
        yMm: widthMm - xMm,
      };
    default:
      return {
        xMm,
        yMm,
      };
  }
}

export function getComponentOrientationMarkerLineMm(
  widthMm: number,
  heightMm: number,
  rotationDeg: RotationDeg
): ComponentMarkerLineMm {
  const markerInsetMm = Math.min(Math.max(Math.min(widthMm, heightMm) * 0.18, 0.5), 2.4);
  const markerDepthMm = Math.min(Math.max(Math.min(widthMm, heightMm) * 0.42, 1.2), 4);
  const centerX = widthMm / 2;
  const start = rotatePointInComponentMm(centerX, markerInsetMm, widthMm, heightMm, rotationDeg);
  const end = rotatePointInComponentMm(
    centerX,
    Math.min(heightMm - 0.4, markerInsetMm + markerDepthMm),
    widthMm,
    heightMm,
    rotationDeg
  );

  return {
    x1Mm: start.xMm,
    y1Mm: start.yMm,
    x2Mm: end.xMm,
    y2Mm: end.yMm,
  };
}

export interface ComponentPinPositionMm {
  pinId: string;
  name: string;
  localXMm: number;
  localYMm: number;
  xMm: number;
  yMm: number;
  electricalType?: ComponentDefinition['pins'][number]['electricalType'];
}

export function getEffectiveComponentPinLayout(
  component: Pick<ComponentInstance, 'pinLayoutOverrides'>,
  definition: Pick<ComponentDefinition, 'pins'>
): Array<{
  pinId: string;
  name: string;
  xMm: number;
  yMm: number;
  electricalType?: ComponentDefinition['pins'][number]['electricalType'];
}> {
  return definition.pins.map((pin) => {
    const override = component.pinLayoutOverrides[pin.id];

    return {
      pinId: pin.id,
      name: pin.name,
      xMm: override?.xMm ?? pin.xMm,
      yMm: override?.yMm ?? pin.yMm,
      electricalType: pin.electricalType,
    };
  });
}

export function createInstancePinLayoutOverrides(
  component: Pick<ComponentInstance, 'pinLayoutOverrides'>,
  definition: Pick<ComponentDefinition, 'pins'>
): ComponentInstance['pinLayoutOverrides'] {
  return Object.fromEntries(
    getEffectiveComponentPinLayout(component, definition).map((pin) => [
      pin.pinId,
      {
        xMm: pin.xMm,
        yMm: pin.yMm,
      },
    ])
  );
}

export function getComponentPinPositionsMm(
  component: Pick<
    ComponentInstance,
    'id' | 'xMm' | 'yMm' | 'widthMm' | 'heightMm' | 'rotationDeg' | 'pinLayoutOverrides'
  >,
  definition: Pick<ComponentDefinition, 'body' | 'pins'>
): ComponentPinPositionMm[] {
  const bodySize = getComponentBodySizeMm(component, definition);
  const rotationDeg = normalizeRotationDeg(component.rotationDeg);

  return getEffectiveComponentPinLayout(component, definition).map((pin) => {
    const rotatedPin = rotatePointInComponentMm(
      pin.xMm,
      pin.yMm,
      bodySize.widthMm,
      bodySize.heightMm,
      rotationDeg
    );

    return {
      pinId: pin.pinId,
      name: pin.name,
      localXMm: pin.xMm,
      localYMm: pin.yMm,
      xMm: component.xMm + rotatedPin.xMm,
      yMm: component.yMm + rotatedPin.yMm,
      electricalType: pin.electricalType,
    };
  });
}

export function deriveComponentPinHoleMap(
  component: Pick<
    ComponentInstance,
    'id' | 'xMm' | 'yMm' | 'widthMm' | 'heightMm' | 'rotationDeg' | 'pinLayoutOverrides'
  >,
  definition: Pick<ComponentDefinition, 'body' | 'pins'>,
  board: Board
): ComponentInstance['pinHoleMap'] {
  const maxSnapDistanceMm = Math.max(board.pitchMm * 0.7, 1.2);

  return Object.fromEntries(
    getComponentPinPositionsMm(component, definition).map((pinPosition) => {
      let nearestHoleId: string | null = null;
      let nearestDistanceMm = maxSnapDistanceMm;

      board.holes.forEach((hole) => {
        const dxMm = hole.xMm - pinPosition.xMm;
        const dyMm = hole.yMm - pinPosition.yMm;
        const distanceMm = Math.sqrt(dxMm * dxMm + dyMm * dyMm);

        if (distanceMm <= nearestDistanceMm) {
          nearestDistanceMm = distanceMm;
          nearestHoleId = hole.id;
        }
      });

      return [pinPosition.pinId, nearestHoleId];
    })
  );
}
