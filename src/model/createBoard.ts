import { Board, Hole, CopperStrip, BoardSettings } from './types';
import { generateId } from '../utils/ids';

export function createStripboardPreset(
  widthMm = 100,
  heightMm = 50,
  pitchMm = 2.54,
  thicknessMm = 1.6
): Board {
  const numStrips = Math.floor(widthMm / pitchMm);
  const holesPerStrip = Math.floor(heightMm / pitchMm);

  return generateBoardFromSettings({
    widthMm,
    heightMm,
    pitchMm,
    thicknessMm,
    stripDirection: 'vertical',
    stripCount: numStrips,
    holesPerStrip,
  });
}

export function regenerateBoard(settings: BoardSettings): Board {
  return generateBoardFromSettings(settings);
}

function generateBoardFromSettings(settings: BoardSettings): Board {
  const { widthMm, heightMm, pitchMm, thicknessMm, stripDirection, stripCount, holesPerStrip } = settings;

  const holes: Hole[] = [];
  const strips: CopperStrip[] = [];

  for (let row = 0; row < holesPerStrip; row++) {
    for (let col = 0; col < stripCount; col++) {
      const xMm = col * pitchMm + pitchMm / 2;
      const yMm = row * pitchMm + pitchMm / 2;

      holes.push({
        id: generateId(),
        row,
        col,
        xMm,
        yMm,
      });
    }
  }

  if (stripDirection === 'vertical') {
    // Strips run along the height (vertical columns)
    for (let col = 0; col < stripCount; col++) {
      const stripHoles = holes.filter((h) => h.col === col).map((h) => h.id);

      strips.push({
        id: generateId(),
        index: col,
        holeIds: stripHoles,
        cuts: [],
      });
    }
  } else {
    // Strips run along the width (horizontal rows)
    for (let row = 0; row < holesPerStrip; row++) {
      const stripHoles = holes.filter((h) => h.row === row).map((h) => h.id);

      strips.push({
        id: generateId(),
        index: row,
        holeIds: stripHoles,
        cuts: [],
      });
    }
  }
  return {
    widthMm,
    heightMm,
    pitchMm,
    thicknessMm,
    stripDirection,
    strips,
    holes,
  };
}

export function addStripCut(
  board: Board,
  stripId: string,
  afterHoleId: string
): Board {
  const cutId = generateId();
  const newStrips = board.strips.map((strip) => {
    if (strip.id === stripId) {
      const existingCut = strip.cuts.find((c) => c.afterHoleId === afterHoleId);
      if (existingCut) {
        return strip;
      }
      return {
        ...strip,
        cuts: [
          ...strip.cuts,
          {
            id: cutId,
            stripId,
            afterHoleId,
            side: 'bottom' as const,
          },
        ],
      };
    }
    return strip;
  });

  return { ...board, strips: newStrips };
}

export function removeStripCut(
  board: Board,
  stripId: string,
  afterHoleId: string
): Board {
  const newStrips = board.strips.map((strip) => {
    if (strip.id === stripId) {
      return {
        ...strip,
        cuts: strip.cuts.filter(
          (c) => !(c.afterHoleId === afterHoleId && c.stripId === stripId)
        ),
      };
    }
    return strip;
  });

  return { ...board, strips: newStrips };
}

export function toggleStripCut(
  board: Board,
  stripId: string,
  afterHoleId: string
): Board {
  const strip = board.strips.find((s) => s.id === stripId);
  if (!strip) return board;

  const existingCut = strip.cuts.find((c) => c.afterHoleId === afterHoleId);
  if (existingCut) {
    return removeStripCut(board, stripId, afterHoleId);
  } else {
    return addStripCut(board, stripId, afterHoleId);
  }
}

