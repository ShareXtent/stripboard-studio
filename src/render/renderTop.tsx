import React from 'react';
import { Board, SelectableId, ToolMode } from '../model/types';
import {
  getComponentFootprintSizeMm,
  getComponentPinPositionsMm,
} from '../model/componentGeometry';
import { getComponentPinObjectId, parseComponentPinObjectId } from '../model/electricalIds';
import { getHolePixelPosition, mmToPx } from '../utils/geometry';
import { useProjectStore } from '../store/projectStore';
import { getBoardFillColor, getBoardOutlineColor, getCopperFillColor } from './colors';
import { getSegmentBoundsPx } from './segmentLayout';
import {
  getRenderedWireLineMm,
  resolveWireGeometry,
} from './wireVisuals';

interface RenderTopViewProps {
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

interface ComponentLabelLayout {
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
  fontSizePx: number;
  lines: string[];
  leaderLine?: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

const COMPONENT_LABEL_PADDING_X_PX = 8;
const COMPONENT_LABEL_PADDING_Y_PX = 4;
const COMPONENT_LABEL_GAP_PX = 8;
const COMPONENT_LABEL_LINE_HEIGHT = 1.08;
const COMPONENT_LABEL_MIN_FONT_PX = 9;
const COMPONENT_LABEL_MAX_FONT_PX = 18;
const COMPONENT_LABEL_MAX_LINES = 2;
const COMPONENT_LABEL_FILL = 'rgba(15, 23, 42, 0.82)';
const COMPONENT_LABEL_STROKE = 'rgba(148, 163, 184, 0.38)';

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeLabelText(label: string): string {
  return label.replace(/\s*\/\s*/g, ' / ').replace(/\s+/g, ' ').trim();
}

function estimateTextWidthPx(text: string, fontSizePx: number): number {
  return text.length * fontSizePx * 0.58;
}

function wrapLabelText(text: string, maxWidthPx: number, fontSizePx: number): string[] | null {
  const normalized = normalizeLabelText(text);
  if (!normalized) {
    return null;
  }

  const slashSegments = normalized.split(' / ').map((segment) => segment.trim()).filter(Boolean);
  if (
    slashSegments.length > 1 &&
    slashSegments.length <= COMPONENT_LABEL_MAX_LINES &&
    slashSegments.every((segment) => estimateTextWidthPx(segment, fontSizePx) <= maxWidthPx)
  ) {
    return slashSegments;
  }

  const words = normalized.split(' ').filter(Boolean);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (estimateTextWidthPx(nextLine, fontSizePx) <= maxWidthPx) {
      currentLine = nextLine;
      continue;
    }

    if (!currentLine || estimateTextWidthPx(word, fontSizePx) > maxWidthPx) {
      return null;
    }

    lines.push(currentLine);
    currentLine = word;

    if (lines.length >= COMPONENT_LABEL_MAX_LINES) {
      return null;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 && lines.length <= COMPONENT_LABEL_MAX_LINES ? lines : null;
}

function measureLabelBox(lines: string[], fontSizePx: number) {
  const maxLineWidth = Math.max(...lines.map((line) => estimateTextWidthPx(line, fontSizePx)));
  const lineHeightPx = fontSizePx * COMPONENT_LABEL_LINE_HEIGHT;
  const textBlockHeight = lines.length * lineHeightPx;

  return {
    boxWidth: maxLineWidth + COMPONENT_LABEL_PADDING_X_PX * 2,
    boxHeight: textBlockHeight + COMPONENT_LABEL_PADDING_Y_PX * 2,
    lineHeightPx,
  };
}

function createLabelLayout(
  boxX: number,
  boxY: number,
  lines: string[],
  fontSizePx: number,
  leaderLine?: ComponentLabelLayout['leaderLine']
): ComponentLabelLayout {
  const { boxWidth, boxHeight } = measureLabelBox(lines, fontSizePx);

  return {
    boxX,
    boxY,
    boxWidth,
    boxHeight,
    fontSizePx,
    lines,
    leaderLine,
  };
}

function resolveComponentLabelLayout(params: {
  label: string;
  compX: number;
  compY: number;
  compWidth: number;
  compHeight: number;
  boardLeft: number;
  boardTop: number;
  boardRight: number;
  boardBottom: number;
  scale: number;
  isExternal: boolean;
}): ComponentLabelLayout | null {
  const {
    label,
    compX,
    compY,
    compWidth,
    compHeight,
    boardLeft,
    boardTop,
    boardRight,
    boardBottom,
    scale,
    isExternal,
  } = params;
  const normalizedLabel = normalizeLabelText(label);

  if (!normalizedLabel) {
    return null;
  }

  const preferredFontSizePx = clampNumber(mmToPx(3, scale), 11, COMPONENT_LABEL_MAX_FONT_PX);
  const minimumFontSizePx = clampNumber(mmToPx(2, scale), COMPONENT_LABEL_MIN_FONT_PX, 14);
  const insideWidthPx = Math.max(36, compWidth - COMPONENT_LABEL_PADDING_X_PX * 2 - 4);
  const insideHeightPx = Math.max(16, compHeight - COMPONENT_LABEL_PADDING_Y_PX * 2 - 4);
  const isNarrowComponent = compHeight > compWidth * 1.2 || compWidth < 92 || compHeight < 34;

  if (!isNarrowComponent) {
    for (let fontSizePx = preferredFontSizePx; fontSizePx >= minimumFontSizePx; fontSizePx -= 1) {
      const lines = wrapLabelText(normalizedLabel, insideWidthPx, fontSizePx);
      if (!lines) {
        continue;
      }

      const { boxWidth, boxHeight } = measureLabelBox(lines, fontSizePx);
      if (boxWidth <= compWidth - 4 && boxHeight <= insideHeightPx) {
        return createLabelLayout(
          compX + (compWidth - boxWidth) / 2,
          compY + (compHeight - boxHeight) / 2,
          lines,
          fontSizePx
        );
      }
    }
  }

  const outsideMaxWidthPx = Math.max(96, Math.min(220, boardRight - boardLeft - 16));
  let outsideLines: string[] | null = null;
  let outsideFontSizePx = minimumFontSizePx;

  for (let fontSizePx = preferredFontSizePx; fontSizePx >= minimumFontSizePx; fontSizePx -= 1) {
    outsideLines = wrapLabelText(
      normalizedLabel,
      outsideMaxWidthPx - COMPONENT_LABEL_PADDING_X_PX * 2,
      fontSizePx
    );

    if (outsideLines) {
      outsideFontSizePx = fontSizePx;
      break;
    }
  }

  if (!outsideLines) {
    outsideLines = [normalizedLabel];
  }

  const { boxWidth, boxHeight } = measureLabelBox(outsideLines, outsideFontSizePx);
  const spaceAbove = compY - boardTop;
  const spaceBelow = boardBottom - (compY + compHeight);
  const spaceLeft = compX - boardLeft;
  const spaceRight = boardRight - (compX + compWidth);
  const preferSidePlacement = compHeight > compWidth || compWidth < 92;
  const candidatePlacements = preferSidePlacement
    ? ['right', 'left', 'below', 'above']
    : ['below', 'above', 'right', 'left'];

  for (const placement of candidatePlacements) {
    if (placement === 'right' && (spaceRight >= boxWidth + COMPONENT_LABEL_GAP_PX || isExternal)) {
      const boxX = compX + compWidth + COMPONENT_LABEL_GAP_PX;
      const unclampedBoxY = compY + (compHeight - boxHeight) / 2;
      const boxY = isExternal
        ? unclampedBoxY
        : clampNumber(unclampedBoxY, boardTop + 4, boardBottom - boxHeight - 4);

      return createLabelLayout(boxX, boxY, outsideLines, outsideFontSizePx, {
        x1: compX + compWidth,
        y1: compY + compHeight / 2,
        x2: boxX,
        y2: boxY + boxHeight / 2,
      });
    }

    if (placement === 'left' && (spaceLeft >= boxWidth + COMPONENT_LABEL_GAP_PX || isExternal)) {
      const boxX = compX - boxWidth - COMPONENT_LABEL_GAP_PX;
      const unclampedBoxY = compY + (compHeight - boxHeight) / 2;
      const boxY = isExternal
        ? unclampedBoxY
        : clampNumber(unclampedBoxY, boardTop + 4, boardBottom - boxHeight - 4);

      return createLabelLayout(boxX, boxY, outsideLines, outsideFontSizePx, {
        x1: compX,
        y1: compY + compHeight / 2,
        x2: boxX + boxWidth,
        y2: boxY + boxHeight / 2,
      });
    }

    if (placement === 'below' && (spaceBelow >= boxHeight + COMPONENT_LABEL_GAP_PX || isExternal)) {
      const unclampedBoxX = compX + (compWidth - boxWidth) / 2;
      const boxX = isExternal
        ? unclampedBoxX
        : clampNumber(unclampedBoxX, boardLeft + 4, boardRight - boxWidth - 4);
      const boxY = compY + compHeight + COMPONENT_LABEL_GAP_PX;

      return createLabelLayout(boxX, boxY, outsideLines, outsideFontSizePx, {
        x1: compX + compWidth / 2,
        y1: compY + compHeight,
        x2: boxX + boxWidth / 2,
        y2: boxY,
      });
    }

    if (placement === 'above' && (spaceAbove >= boxHeight + COMPONENT_LABEL_GAP_PX || isExternal)) {
      const unclampedBoxX = compX + (compWidth - boxWidth) / 2;
      const boxX = isExternal
        ? unclampedBoxX
        : clampNumber(unclampedBoxX, boardLeft + 4, boardRight - boxWidth - 4);
      const boxY = compY - boxHeight - COMPONENT_LABEL_GAP_PX;

      return createLabelLayout(boxX, boxY, outsideLines, outsideFontSizePx, {
        x1: compX + compWidth / 2,
        y1: compY,
        x2: boxX + boxWidth / 2,
        y2: boxY + boxHeight,
      });
    }
  }

  return createLabelLayout(
    compX + (compWidth - boxWidth) / 2,
    compY + (compHeight - boxHeight) / 2,
    outsideLines,
    outsideFontSizePx
  );
}

export const renderTopView = ({
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
}: RenderTopViewProps) => {
  const { project, componentDefinitions, copperSegments, nets, highlightedNetId } =
    useProjectStore.getState();
  if (!project) return null;

  const highlightedNet = nets.find((net) => net.id === highlightedNetId) ?? null;
  const highlightedHoleIds = new Set(highlightedNet?.objectRefs.holes ?? []);
  const highlightedSegmentIds = new Set(highlightedNet?.objectRefs.copperSegments ?? []);
  const highlightedWireIds = new Set(highlightedNet?.objectRefs.wires ?? []);
  const highlightedComponentPinIds = new Set(highlightedNet?.objectRefs.componentPins ?? []);
  const highlightedSolderIds = new Set(highlightedNet?.objectRefs.solderJoints ?? []);
  const highlightColor = highlightedNet?.color ?? '#ffd166';
  const { components, wires, solderJoints, settings } = project;
  const selectedComponentId =
    selectedId?.type === 'component'
      ? selectedId.id
      : selectedId?.type === 'componentPin'
        ? parseComponentPinObjectId(selectedId.id)?.componentId ?? null
        : null;
  const selectedComponent = selectedComponentId
    ? components.find((component) => component.id === selectedComponentId)
    : null;
  const selectedComponentMappedHoleIds = new Set(
    selectedComponent
      ? Object.values(selectedComponent.pinHoleMap).filter((holeId): holeId is string => !!holeId)
      : []
  );
  const componentSelectionColor = '#7ee787';
  const showCopper = settings.showCopper;
  const shouldShowHoles = includeHoles ?? settings.showHoles;
  const shouldShowLabels = includeLabels ?? settings.showLabels;
  const boardFillColor = getBoardFillColor(settings.boardColor);
  const boardOutlineColor = getBoardOutlineColor(settings.boardColor);
  const copperFillColor = getCopperFillColor(settings.copperColor);
  const elements: React.ReactElement[] = [];
  const bridgeWireElements: React.ReactElement[] = [];
  const boardLeft = offsetX;
  const boardTop = offsetY;
  const boardRight = offsetX + mmToPx(board.widthMm, scale);
  const boardBottom = offsetY + mmToPx(board.heightMm, scale);
  const topSolderHoleIds = new Set(
    solderJoints.filter((joint) => joint.side === 'top').map((joint) => joint.holeId)
  );
  const wiredComponentPinIds = new Set(
    wires.flatMap((wire) =>
      [wire.from, wire.to]
        .filter((endpoint) => endpoint.type === 'componentPin')
        .map((endpoint) => getComponentPinObjectId(endpoint.componentId, endpoint.pinId))
    )
  );
  const wireStartComponentPinId =
    wireStartEndpoint?.type === 'componentPin'
      ? getComponentPinObjectId(wireStartEndpoint.componentId, wireStartEndpoint.pinId)
      : null;

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
          opacity={isSelected ? 0.75 : isHighlighted ? 0.48 : 0.16}
          stroke={isSelected ? '#fff0b3' : isHighlighted ? highlightColor : 'none'}
          strokeWidth={isSelected || isHighlighted ? mmToPx(0.18, scale) : 0}
          rx={mmToPx(0.15, scale)}
        />
      );
    });
  }

  if (shouldShowHoles) {
    board.holes.forEach((hole) => {
      const pos = getHolePixelPosition(hole.xMm, hole.yMm, scale, offsetX, offsetY);
      const holeRadius = mmToPx(0.6, scale);
      const isSelected = selectedId?.type === 'hole' && selectedId.id === hole.id;
      const isWireStart = wireStartEndpoint?.type === 'hole' && hole.id === wireStartEndpoint.holeId;
      const isHighlighted = highlightedHoleIds.has(hole.id);
      const isComponentMappedHole = selectedComponentMappedHoleIds.has(hole.id);

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
                : isComponentMappedHole
                  ? componentSelectionColor
                : isHighlighted
                  ? highlightColor
                  : '#1a1a1a'
          }
          stroke={
            isSelected
              ? '#6ab0ff'
              : isWireStart
                ? '#70e8a0'
                : isComponentMappedHole
                  ? '#d3f9d8'
                : isHighlighted
                  ? '#fff3bf'
                  : '#333'
          }
          strokeWidth={
            isSelected || isHighlighted || isComponentMappedHole
              ? mmToPx(0.28, scale)
              : mmToPx(0.1, scale)
          }
          style={{ cursor: selectedTool !== 'select' ? 'pointer' : 'default' }}
        />
      );
    });
  }

  wires
    .filter((wire) => wire.side === 'top' || wire.side === 'external')
    .forEach((wire) => {
      const geometry = resolveWireGeometry(wire, board, components, componentDefinitions);
      if (!geometry) return;

      const isSelected = selectedId?.type === 'wire' && selectedId.id === wire.id;
      const isHighlighted = highlightedWireIds.has(wire.id);
      const lineMm = getRenderedWireLineMm(wire, geometry, topSolderHoleIds);
      const isBridgeWire = lineMm.x1Mm !== geometry.from.xMm || lineMm.y1Mm !== geometry.from.yMm;
      const fromPos = getHolePixelPosition(lineMm.x1Mm, lineMm.y1Mm, scale, offsetX, offsetY);
      const toPos = getHolePixelPosition(lineMm.x2Mm, lineMm.y2Mm, scale, offsetX, offsetY);
      const wireColor = isHighlighted ? highlightColor : wire.color || '#ff0000';
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
    .filter((joint) => joint.side === 'top')
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
          fill={isHighlighted ? highlightColor : joint.color || (isSelected ? '#e0e0e0' : '#c0c0c0')}
          stroke={isHighlighted ? '#fff3bf' : '#888'}
          strokeWidth={mmToPx(isHighlighted ? 0.3 : 0.2, scale)}
        />
      );
    });

  elements.push(...bridgeWireElements);

  components.forEach((component) => {
    const definition = componentDefinitions.find((entry) => entry.id === component.definitionId);
    if (!definition) return;

    const footprintSize = getComponentFootprintSizeMm(component, definition);
    const compColor = component.color || definition.defaultColor || '#888';
    const compX = offsetX + mmToPx(component.xMm, scale);
    const compY = offsetY + mmToPx(component.yMm, scale);
    const compWidth = mmToPx(footprintSize.widthMm, scale);
    const compHeight = mmToPx(footprintSize.heightMm, scale);
    const isComponentSelected = selectedId?.type === 'component' && selectedId.id === component.id;
    const isSelectedComponentFamily = selectedComponentId === component.id;
    const isExternal = component.placementType === 'external';
    const labelLayout = shouldShowLabels
      ? resolveComponentLabelLayout({
          label: component.name,
          compX,
          compY,
          compWidth,
          compHeight,
          boardLeft,
          boardTop,
          boardRight,
          boardBottom,
          scale,
          isExternal,
        })
      : null;

    elements.push(
      <g key={`component-${component.id}`}>
        <rect
          x={compX}
          y={compY}
          width={compWidth}
          height={compHeight}
          fill={`${compColor}60`}
          stroke={isComponentSelected ? '#4a90d9' : isSelectedComponentFamily ? componentSelectionColor : compColor}
          strokeWidth={mmToPx(isComponentSelected ? 0.5 : isSelectedComponentFamily ? 0.38 : 0.3, scale)}
          strokeDasharray={
            isComponentSelected
              ? isExternal
                ? undefined
                : `${mmToPx(3, scale)} ${mmToPx(2, scale)}`
              : isExternal
                ? `${mmToPx(2.4, scale)} ${mmToPx(1.6, scale)}`
                : undefined
          }
          style={{ cursor: selectedTool === 'select' ? 'move' : 'default' }}
        />
        {getComponentPinPositionsMm(component, definition).map((pin) => {
          const pinHoleId = component.pinHoleMap[pin.pinId];
          const pinHole = pinHoleId
            ? board.holes.find((hole) => hole.id === pinHoleId)
            : null;
          const pinPos = getHolePixelPosition(pin.xMm, pin.yMm, scale, offsetX, offsetY);
          const mappedHolePos = pinHole
            ? getHolePixelPosition(pinHole.xMm, pinHole.yMm, scale, offsetX, offsetY)
            : null;
          const componentPinId = getComponentPinObjectId(component.id, pin.pinId);
          const isPinSelected =
            selectedId?.type === 'componentPin' && selectedId.id === componentPinId;
          const isPinHighlighted = highlightedComponentPinIds.has(componentPinId);
          const isMapped = !!pinHole;
          const isWireConnected = wiredComponentPinIds.has(componentPinId);
          const isWireStartPin = wireStartComponentPinId === componentPinId;
          const markerColor = isMapped || isWireConnected ? '#7ee787' : '#ff922b';
          const needsLeadLine =
            !!mappedHolePos &&
            Math.hypot(mappedHolePos.x - pinPos.x, mappedHolePos.y - pinPos.y) > mmToPx(0.08, scale);

          return (
            <g key={`pin-${component.id}-${pin.pinId}`}>
              {needsLeadLine && (
                <line
                  x1={pinPos.x}
                  y1={pinPos.y}
                  x2={mappedHolePos!.x}
                  y2={mappedHolePos!.y}
                  stroke={isSelectedComponentFamily ? componentSelectionColor : '#adb5bd'}
                  strokeWidth={mmToPx(0.12, scale)}
                />
              )}
              <circle
                cx={pinPos.x}
                cy={pinPos.y}
                r={mmToPx(0.9, scale)}
                fill={markerColor}
                stroke={
                  isPinSelected || isPinHighlighted || isSelectedComponentFamily || isWireStartPin
                    ? '#f8f9fa'
                    : '#101820'
                }
                strokeWidth={mmToPx(
                  isPinSelected || isPinHighlighted || isSelectedComponentFamily || isWireStartPin
                    ? 0.3
                    : 0.16,
                  scale
                )}
              />
              {!isMapped && !isWireConnected && (
                <>
                  <line
                    x1={pinPos.x - mmToPx(0.42, scale)}
                    y1={pinPos.y - mmToPx(0.42, scale)}
                    x2={pinPos.x + mmToPx(0.42, scale)}
                    y2={pinPos.y + mmToPx(0.42, scale)}
                    stroke="#7f1d1d"
                    strokeWidth={mmToPx(0.14, scale)}
                  />
                  <line
                    x1={pinPos.x + mmToPx(0.42, scale)}
                    y1={pinPos.y - mmToPx(0.42, scale)}
                    x2={pinPos.x - mmToPx(0.42, scale)}
                    y2={pinPos.y + mmToPx(0.42, scale)}
                    stroke="#7f1d1d"
                    strokeWidth={mmToPx(0.14, scale)}
                  />
                </>
              )}
            </g>
          );
        })}
        {labelLayout && (
          <g pointerEvents="none">
            {labelLayout.leaderLine && (
              <line
                x1={labelLayout.leaderLine.x1}
                y1={labelLayout.leaderLine.y1}
                x2={labelLayout.leaderLine.x2}
                y2={labelLayout.leaderLine.y2}
                stroke={isSelectedComponentFamily ? '#dbeafe' : '#94a3b8'}
                strokeWidth={1.2}
                opacity={0.78}
              />
            )}
            <rect
              x={labelLayout.boxX}
              y={labelLayout.boxY}
              width={labelLayout.boxWidth}
              height={labelLayout.boxHeight}
              rx={4}
              fill={COMPONENT_LABEL_FILL}
              stroke={
                isComponentSelected
                  ? '#93c5fd'
                  : isSelectedComponentFamily
                    ? '#bfdbfe'
                    : COMPONENT_LABEL_STROKE
              }
              strokeWidth={isComponentSelected || isSelectedComponentFamily ? 1.2 : 0.8}
            />
            <text
              x={labelLayout.boxX + labelLayout.boxWidth / 2}
              y={
                labelLayout.boxY +
                COMPONENT_LABEL_PADDING_Y_PX +
                labelLayout.fontSizePx * 0.84
              }
              textAnchor="middle"
              fill="#f8fafc"
              fontSize={labelLayout.fontSizePx}
              fontWeight={isSelectedComponentFamily ? 600 : 500}
              stroke="rgba(15, 23, 42, 0.9)"
              strokeWidth={Math.max(1.2, labelLayout.fontSizePx * 0.2)}
              paintOrder="stroke"
            >
              {labelLayout.lines.map((line, index) => (
                <tspan
                  key={`${component.id}-label-line-${index}`}
                  x={labelLayout.boxX + labelLayout.boxWidth / 2}
                  dy={index === 0 ? 0 : labelLayout.fontSizePx * COMPONENT_LABEL_LINE_HEIGHT}
                >
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        )}
      </g>
    );
  });

  return (
    <g opacity={opacity} pointerEvents={pointerEvents}>
      {elements}
    </g>
  );
};
