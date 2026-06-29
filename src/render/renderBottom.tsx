import React from 'react';
import { Board, SelectableId, ToolMode } from '../model/types';
import { getHolePixelPosition, mmToPx } from '../utils/geometry';
import { useProjectStore } from '../store/projectStore';
import {
  getBoardFillColor,
  getBoardOutlineColor,
  getCopperFillColor,
  getCopperStrokeColor,
} from './colors';
import { getSegmentBoundsPx } from './segmentLayout';
import {
  getRenderedWireLineMm,
  resolveWireGeometry,
} from './wireVisuals';

interface RenderBottomViewProps {
  board: Board;
  scale: number;
  offsetX: number;
  offsetY: number;
  selectedId: SelectableId | null;
  wireStartEndpoint: { type: 'hole'; holeId: string } | { type: 'componentPin'; componentId: string; pinId: string } | null;
  selectedTool: ToolMode;
  includeBoardBase?: boolean;
  includeHoles?: boolean;
  includeLabels?: boolean;
  opacity?: number;
  pointerEvents?: 'auto' | 'none';
}

export const renderBottomView = ({
  board,
  scale,
  offsetX,
  offsetY,
  selectedId,
  wireStartEndpoint,
  selectedTool,
  includeBoardBase = true,
  includeHoles,
  includeLabels,
  opacity = 1,
  pointerEvents = 'auto',
}: RenderBottomViewProps) => {
  const { project, copperSegments, nets, highlightedNetId } = useProjectStore.getState();
  if (!project) return null;

  const highlightedNet = nets.find((net) => net.id === highlightedNetId) ?? null;
  const highlightedHoleIds = new Set(highlightedNet?.objectRefs.holes ?? []);
  const highlightedSegmentIds = new Set(highlightedNet?.objectRefs.copperSegments ?? []);
  const highlightedWireIds = new Set(highlightedNet?.objectRefs.wires ?? []);
  const highlightedSolderIds = new Set(highlightedNet?.objectRefs.solderJoints ?? []);
  const highlightColor = highlightedNet?.color ?? '#ffd166';
  const { wires, solderJoints, settings } = project;
  const showBoardPrepView = settings.boardPrepMode;
  const showCopper = showBoardPrepView ? true : settings.showCopper;
  const shouldShowHoles = showBoardPrepView ? true : includeHoles ?? settings.showHoles;
  const shouldShowLabels = showBoardPrepView ? false : includeLabels ?? settings.showLabels;
  const boardFillColor = getBoardFillColor(settings.boardColor);
  const boardOutlineColor = getBoardOutlineColor(settings.boardColor);
  const copperFillColor = getCopperFillColor(settings.copperColor);
  const copperStrokeColor = getCopperStrokeColor(settings.copperColor);
  const elements: React.ReactElement[] = [];
  const bridgeWireElements: React.ReactElement[] = [];
  const bottomSolderHoleIds = new Set(
    solderJoints.filter((joint) => joint.side === 'bottom').map((joint) => joint.holeId)
  );

  if (includeBoardBase) {
    elements.push(
      <rect
        key="board-bg"
        x={offsetX}
        y={offsetY}
        width={mmToPx(board.widthMm, scale)}
        height={mmToPx(board.heightMm, scale)}
        fill={boardFillColor}
      />
    );

    elements.push(
      <rect
        key="board-outline"
        x={offsetX}
        y={offsetY}
        width={mmToPx(board.widthMm, scale)}
        height={mmToPx(board.heightMm, scale)}
        fill="none"
        stroke={boardOutlineColor}
        strokeWidth={mmToPx(0.5, scale)}
      />
    );
  }

  if (showCopper) {
    copperSegments.forEach((segment) => {
      const bounds = getSegmentBoundsPx(board, segment, scale, offsetX, offsetY);
      if (!bounds) {
        return;
      }

      const isSelected = selectedId?.type === 'segment' && selectedId.id === segment.id;
      const isHighlighted = highlightedSegmentIds.has(segment.id);
      const fillColor = segment.color || (isHighlighted ? highlightColor : copperFillColor);

      elements.push(
        <rect
          key={`segment-${segment.id}`}
          x={bounds.x}
          y={bounds.y}
          width={bounds.width}
          height={bounds.height}
          fill={fillColor}
          stroke={isSelected ? '#fff0b3' : isHighlighted ? highlightColor : copperStrokeColor}
          strokeWidth={mmToPx(isSelected ? 0.22 : isHighlighted ? 0.18 : 0.1, scale)}
          rx={mmToPx(0.15, scale)}
        />
      );
    });

    board.strips.forEach((strip) => {
      strip.cuts.forEach((cut) => {
        const cutHole = board.holes.find((hole) => hole.id === cut.afterHoleId);
        if (!cutHole) return;

        const cutPos = getHolePixelPosition(cutHole.xMm, cutHole.yMm, scale, offsetX, offsetY);
        const isCutSelected = selectedId?.type === 'cut' && selectedId.id === cut.id;
        const cutColor = settings.cutColor || '#ff5d5d';
        const xSize = mmToPx(1.5, scale);

        elements.push(
          <g key={`cut-${cut.id}`}>
            {isCutSelected && (
              <>
                <line
                  x1={cutPos.x - xSize}
                  y1={cutPos.y - xSize}
                  x2={cutPos.x + xSize}
                  y2={cutPos.y + xSize}
                  stroke="#fff0b3"
                  strokeWidth={mmToPx(0.72, scale)}
                />
                <line
                  x1={cutPos.x + xSize}
                  y1={cutPos.y - xSize}
                  x2={cutPos.x - xSize}
                  y2={cutPos.y + xSize}
                  stroke="#fff0b3"
                  strokeWidth={mmToPx(0.72, scale)}
                />
              </>
            )}
            <line
              x1={cutPos.x - xSize}
              y1={cutPos.y - xSize}
              x2={cutPos.x + xSize}
              y2={cutPos.y + xSize}
              stroke={cutColor}
              strokeWidth={mmToPx(0.4, scale)}
            />
            <line
              x1={cutPos.x + xSize}
              y1={cutPos.y - xSize}
              x2={cutPos.x - xSize}
              y2={cutPos.y + xSize}
              stroke={cutColor}
              strokeWidth={mmToPx(0.4, scale)}
            />
          </g>
        );
      });
    });
  }

  if (shouldShowHoles) {
    board.holes.forEach((hole) => {
      const pos = getHolePixelPosition(hole.xMm, hole.yMm, scale, offsetX, offsetY);
      const holeRadius = mmToPx(0.6, scale);
      const isSelected = selectedId?.type === 'hole' && selectedId.id === hole.id;
      const isWireStart = wireStartEndpoint?.type === 'hole' && hole.id === wireStartEndpoint.holeId;
      const isHighlighted = highlightedHoleIds.has(hole.id);

      elements.push(
        <circle
          key={`hole-${hole.id}`}
          cx={pos.x}
          cy={pos.y}
          r={holeRadius}
          fill={
            isSelected
              ? '#4a90d9'
              : isWireStart
                ? '#50c878'
                : isHighlighted
                  ? highlightColor
                  : '#1a1a1a'
          }
          stroke={
            isSelected
              ? '#6ab0ff'
              : isWireStart
                ? '#70e8a0'
                : isHighlighted
                  ? '#fff3bf'
                  : '#333'
          }
          strokeWidth={
            isSelected || isHighlighted ? mmToPx(0.28, scale) : mmToPx(0.1, scale)
          }
          style={{ cursor: selectedTool !== 'select' ? 'pointer' : 'default' }}
        />
      );
    });
  }

  if (!showBoardPrepView) {
    wires
      .filter((wire) => wire.side === 'bottom')
      .forEach((wire) => {
        const geometry = resolveWireGeometry(
          wire,
          board,
          project.components,
          project.componentDefinitions
        );
        if (!geometry) return;

        const isSelected = selectedId?.type === 'wire' && selectedId.id === wire.id;
        const isHighlighted = highlightedWireIds.has(wire.id);
        const lineMm = getRenderedWireLineMm(wire, geometry, bottomSolderHoleIds);
        const isBridgeWire = lineMm.x1Mm !== geometry.from.xMm || lineMm.y1Mm !== geometry.from.yMm;
        const fromPos = getHolePixelPosition(lineMm.x1Mm, lineMm.y1Mm, scale, offsetX, offsetY);
        const toPos = getHolePixelPosition(lineMm.x2Mm, lineMm.y2Mm, scale, offsetX, offsetY);
        const wireColor = isHighlighted ? highlightColor : wire.color || '#0000ff';
        const wireElements = isBridgeWire ? bridgeWireElements : elements;

        if (isBridgeWire) {
          wireElements.push(
            <line
              key={`wire-bridge-outer-${wire.id}`}
              x1={fromPos.x}
              y1={fromPos.y}
              x2={toPos.x}
              y2={toPos.y}
              stroke={isSelected ? '#f8fafc' : isHighlighted ? '#fff3bf' : '#0f172a'}
              strokeWidth={mmToPx(isSelected ? 1.18 : isHighlighted ? 1.06 : 0.96, scale)}
              strokeLinecap="round"
              opacity={0.92}
            />
          );
        }

        wireElements.push(
          <line
            key={`wire-${wire.id}`}
            x1={fromPos.x}
            y1={fromPos.y}
            x2={toPos.x}
            y2={toPos.y}
            stroke={wireColor}
            strokeWidth={mmToPx(
              isBridgeWire
                ? isSelected
                  ? 0.92
                  : isHighlighted
                    ? 0.84
                    : 0.74
                : isSelected
                  ? 0.95
                  : isHighlighted
                    ? 0.8
                    : 0.5,
              scale
            )}
            strokeLinecap="round"
          />
        );

        if (shouldShowLabels && wire.label) {
          const midX = (fromPos.x + toPos.x) / 2;
          const midY = (fromPos.y + toPos.y) / 2;

          wireElements.push(
            <text
              key={`wire-label-${wire.id}`}
              x={midX}
              y={midY - mmToPx(2, scale)}
              textAnchor="middle"
              fill="#ddd"
              fontSize={mmToPx(3, scale)}
            >
              {wire.label}
            </text>
          );
        }
      });

    solderJoints
      .filter((joint) => joint.side === 'bottom')
      .forEach((joint) => {
        const hole = board.holes.find((entry) => entry.id === joint.holeId);
        if (!hole) return;

        const pos = getHolePixelPosition(hole.xMm, hole.yMm, scale, offsetX, offsetY);
        const jointRadius = mmToPx(1.0, scale);
        const isSelected = selectedId?.type === 'solder' && selectedId.id === joint.id;
        const isHighlighted = highlightedSolderIds.has(joint.id);

        elements.push(
          <circle
            key={`solder-${joint.id}`}
            cx={pos.x}
            cy={pos.y}
            r={jointRadius}
            fill={
              isHighlighted ? highlightColor : joint.color || (isSelected ? '#e0e0e0' : '#c0c0c0')
            }
            stroke={isHighlighted ? '#fff3bf' : '#888'}
            strokeWidth={mmToPx(isHighlighted ? 0.3 : 0.2, scale)}
          />
        );
      });
  }

  elements.push(...bridgeWireElements);

  return (
    <g opacity={opacity} pointerEvents={pointerEvents}>
      {elements}
    </g>
  );
};
