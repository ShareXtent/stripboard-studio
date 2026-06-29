export function mmToPx(mm: number, scale: number): number {
  return mm * scale;
}

export function pxToMm(px: number, scale: number): number {
  return px / scale;
}

export function getHolePixelPosition(
  xMm: number,
  yMm: number,
  scale: number,
  offsetX: number,
  offsetY: number
): { x: number; y: number } {
  return {
    x: mmToPx(xMm, scale) + offsetX,
    y: mmToPx(yMm, scale) + offsetY,
  };
}

export function distanceMm(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

export function snapToGrid(pxX: number, pxY: number, pitchMm: number, scale: number, offsetX: number, offsetY: number): { x: number; y: number } {
  const mmX = Math.round((pxX - offsetX) / scale / pitchMm) * pitchMm + pitchMm / 2;
  const mmY = Math.round((pxY - offsetY) / scale / pitchMm) * pitchMm + pitchMm / 2;
  return {
    x: mmToPx(mmX, scale) + offsetX,
    y: mmToPx(mmY, scale) + offsetY,
  };
}

export function findNearestHole(
  clickX: number,
  clickY: number,
  holes: { id: string; xMm: number; yMm: number }[],
  scale: number,
  offsetX: number,
  offsetY: number,
  thresholdMm: number = 2
): { id: string; xMm: number; yMm: number } | null {
  const thresholdPx = mmToPx(thresholdMm, scale);
  let nearest: { id: string; xMm: number; yMm: number } | null = null;
  let nearestDist = thresholdPx;

  for (const hole of holes) {
    const pos = getHolePixelPosition(hole.xMm, hole.yMm, scale, offsetX, offsetY);
    const dist = Math.sqrt(Math.pow(pos.x - clickX, 2) + Math.pow(pos.y - clickY, 2));
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = hole;
    }
  }

  return nearest;
}

