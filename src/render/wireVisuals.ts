import {
  resolveConnectionEndpoint,
  ResolvedConnectionEndpoint,
} from '../model/connectionEndpoints';
import { Board, ComponentDefinition, ComponentInstance, Hole, Wire } from '../model/types';

export interface WireLineMm {
  x1Mm: number;
  y1Mm: number;
  x2Mm: number;
  y2Mm: number;
}

export interface ResolvedWireGeometry {
  from: ResolvedConnectionEndpoint;
  to: ResolvedConnectionEndpoint;
}

export function isAdjacentHolePair(fromHole: Hole, toHole: Hole): boolean {
  const rowDelta = Math.abs(fromHole.row - toHole.row);
  const colDelta = Math.abs(fromHole.col - toHole.col);

  return rowDelta + colDelta === 1;
}

export function isAdjacentSolderBridgeWire(
  wire: Wire,
  geometry: ResolvedWireGeometry,
  solderHoleIds: Set<string>
): boolean {
  const fromHole = geometry.from.hole;
  const toHole = geometry.to.hole;

  if (!fromHole || !toHole || wire.from.type !== 'hole' || wire.to.type !== 'hole') {
    return false;
  }

  return (
    solderHoleIds.has(wire.from.holeId) &&
    solderHoleIds.has(wire.to.holeId) &&
    isAdjacentHolePair(fromHole, toHole)
  );
}

export function resolveWireGeometry(
  wire: Wire,
  board: Board,
  components: ComponentInstance[],
  componentDefinitions: ComponentDefinition[]
): ResolvedWireGeometry | null {
  const from = resolveConnectionEndpoint(wire.from, board, components, componentDefinitions);
  const to = resolveConnectionEndpoint(wire.to, board, components, componentDefinitions);

  if (!from || !to) {
    return null;
  }

  return { from, to };
}

export function getWireLineMm(
  fromPoint: Pick<ResolvedConnectionEndpoint, 'xMm' | 'yMm'>,
  toPoint: Pick<ResolvedConnectionEndpoint, 'xMm' | 'yMm'>
): WireLineMm {
  return {
    x1Mm: fromPoint.xMm,
    y1Mm: fromPoint.yMm,
    x2Mm: toPoint.xMm,
    y2Mm: toPoint.yMm,
  };
}

export function getAdjacentBridgeLineMm(fromHole: Hole, toHole: Hole): WireLineMm {
  const dx = toHole.xMm - fromHole.xMm;
  const dy = toHole.yMm - fromHole.yMm;
  const lengthMm = Math.hypot(dx, dy);

  if (lengthMm <= 0.001) {
    return getWireLineMm(fromHole, toHole);
  }

  const trimMm = Math.min(0.72, lengthMm * 0.28);
  if (lengthMm <= trimMm * 2 + 0.01) {
    return getWireLineMm(fromHole, toHole);
  }

  const unitX = dx / lengthMm;
  const unitY = dy / lengthMm;

  return {
    x1Mm: fromHole.xMm + unitX * trimMm,
    y1Mm: fromHole.yMm + unitY * trimMm,
    x2Mm: toHole.xMm - unitX * trimMm,
    y2Mm: toHole.yMm - unitY * trimMm,
  };
}

export function getRenderedWireLineMm(
  wire: Wire,
  geometry: ResolvedWireGeometry,
  solderHoleIds: Set<string>
): WireLineMm {
  return isAdjacentSolderBridgeWire(wire, geometry, solderHoleIds)
    ? getAdjacentBridgeLineMm(geometry.from.hole!, geometry.to.hole!)
    : getWireLineMm(geometry.from, geometry.to);
}
