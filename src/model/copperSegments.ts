import {
  Board,
  CopperSegment,
  CopperStrip,
  Hole,
  NetLabelAssignment,
  ProjectModel,
} from "./types";

function getStripAxisIndex(board: Board, hole: Hole): number {
  return board.stripDirection === "vertical" ? hole.row : hole.col;
}

function sortStripHoles(board: Board, strip: CopperStrip): Hole[] {
  const holeLookup = new Map(board.holes.map((hole) => [hole.id, hole]));

  return strip.holeIds
    .map((holeId) => holeLookup.get(holeId))
    .filter((hole): hole is Hole => !!hole)
    .sort((left, right) => getStripAxisIndex(board, left) - getStripAxisIndex(board, right));
}

function createSegmentId(stripIndex: number, fromHoleIndex: number, toHoleIndex: number): string {
  return `segment:${stripIndex}:${fromHoleIndex}-${toHoleIndex}`;
}

function findSegmentLabel(
  netLabels: NetLabelAssignment[],
  stripIndex: number,
  fromHoleIndex: number,
  toHoleIndex: number
): NetLabelAssignment | undefined {
  return netLabels.find(
    (label) =>
      label.target.type === "segment" &&
      label.target.stripIndex === stripIndex &&
      label.target.fromHoleIndex === fromHoleIndex &&
      label.target.toHoleIndex === toHoleIndex
  );
}

export function deriveCopperSegments(project: ProjectModel): CopperSegment[] {
  const { board } = project;
  const segments: CopperSegment[] = [];

  board.strips
    .slice()
    .sort((left, right) => left.index - right.index)
    .forEach((strip) => {
      const sortedHoles = sortStripHoles(board, strip);

      if (sortedHoles.length === 0) {
        return;
      }

      const cutPositions = new Set<number>();
      strip.cuts.forEach((cut) => {
        const cutPosition = sortedHoles.findIndex((hole) => hole.id === cut.afterHoleId);
        if (cutPosition >= 0 && cutPosition < sortedHoles.length - 1) {
          cutPositions.add(cutPosition);
        }
      });

      let segmentStartPosition = 0;
      for (let position = 0; position < sortedHoles.length; position += 1) {
        const isLastHole = position === sortedHoles.length - 1;
        const endsAtCut = cutPositions.has(position);

        if (!isLastHole && !endsAtCut) {
          continue;
        }

        const segmentHoles = sortedHoles.slice(segmentStartPosition, position + 1);
        if (segmentHoles.length > 0) {
          const firstHole = segmentHoles[0];
          const lastHole = segmentHoles[segmentHoles.length - 1];
          const fromHoleIndex = getStripAxisIndex(board, firstHole);
          const toHoleIndex = getStripAxisIndex(board, lastHole);
          const label = findSegmentLabel(project.netLabels, strip.index, fromHoleIndex, toHoleIndex);

          segments.push({
            id: createSegmentId(strip.index, fromHoleIndex, toHoleIndex),
            stripId: strip.id,
            stripIndex: strip.index,
            fromHoleIndex,
            toHoleIndex,
            holeIds: segmentHoles.map((hole) => hole.id),
            netName: label?.netName?.trim() || undefined,
            color: label?.color,
          });
        }

        segmentStartPosition = position + 1;
      }
    });

  return segments;
}
