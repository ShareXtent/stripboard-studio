import { Board, CopperSegment, Hole } from '../model/types';
import { getHolePixelPosition, mmToPx } from '../utils/geometry';

export interface SegmentBoundsPx {
  x: number;
  y: number;
  width: number;
  height: number;
}

function sortSegmentHoles(board: Board, holes: Hole[]): Hole[] {
  return holes.sort((left, right) => {
    const leftIndex = board.stripDirection === 'vertical' ? left.row : left.col;
    const rightIndex = board.stripDirection === 'vertical' ? right.row : right.col;
    return leftIndex - rightIndex;
  });
}

export function getSegmentHoles(board: Board, segment: CopperSegment): Hole[] {
  const holeLookup = new Map(board.holes.map((hole) => [hole.id, hole]));

  return sortSegmentHoles(
    board,
    segment.holeIds
      .map((holeId) => holeLookup.get(holeId))
      .filter((hole): hole is Hole => !!hole)
  );
}

export function getSegmentBoundsPx(
  board: Board,
  segment: CopperSegment,
  scale: number,
  offsetX: number,
  offsetY: number,
  stripWidthMm = 1.2,
  stripEndCapMm = 0.6
): SegmentBoundsPx | null {
  const segmentHoles = getSegmentHoles(board, segment);
  if (segmentHoles.length === 0) {
    return null;
  }

  const firstHole = segmentHoles[0];
  const lastHole = segmentHoles[segmentHoles.length - 1];
  const firstPos = getHolePixelPosition(firstHole.xMm, firstHole.yMm, scale, offsetX, offsetY);
  const lastPos = getHolePixelPosition(lastHole.xMm, lastHole.yMm, scale, offsetX, offsetY);
  const stripWidthPx = mmToPx(stripWidthMm, scale);
  const stripEndCapPx = mmToPx(stripEndCapMm, scale);

  if (board.stripDirection === 'vertical') {
    return {
      x: firstPos.x - stripWidthPx / 2,
      y: firstPos.y - stripEndCapPx,
      width: stripWidthPx,
      height: Math.max(stripWidthPx, lastPos.y - firstPos.y + stripEndCapPx * 2),
    };
  }

  return {
    x: firstPos.x - stripEndCapPx,
    y: firstPos.y - stripWidthPx / 2,
    width: Math.max(stripWidthPx, lastPos.x - firstPos.x + stripEndCapPx * 2),
    height: stripWidthPx,
  };
}

export function isPointInsideSegment(
  board: Board,
  segment: CopperSegment,
  clickX: number,
  clickY: number,
  scale: number,
  offsetX: number,
  offsetY: number,
  thresholdPx = 0
): boolean {
  const bounds = getSegmentBoundsPx(board, segment, scale, offsetX, offsetY);
  if (!bounds) {
    return false;
  }

  return (
    clickX >= bounds.x - thresholdPx &&
    clickX <= bounds.x + bounds.width + thresholdPx &&
    clickY >= bounds.y - thresholdPx &&
    clickY <= bounds.y + bounds.height + thresholdPx
  );
}
