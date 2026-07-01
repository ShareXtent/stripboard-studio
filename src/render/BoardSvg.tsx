import React, { useCallback, useRef, useState } from 'react';
import { toggleStripCut } from '../model/createBoard';
import { Board, ComponentDefinition, ComponentInstance, ConnectionEndpoint, Wire } from '../model/types';
import { isSameConnectionEndpoint } from '../model/connectionEndpoints';
import {
  getComponentFootprintSizeMm,
  getComponentPinPositionsMm,
  normalizeRotationDeg,
} from '../model/componentGeometry';
import { getComponentPinObjectId, parseComponentPinObjectId } from '../model/electricalIds';
import { renderBottomView } from './renderBottom';
import { renderTopView } from './renderTop';
import { useProjectStore } from '../store/projectStore';
import { findNearestHole, getHolePixelPosition, mmToPx, pxToMm } from '../utils/geometry';
import { isPointInsideSegment } from './segmentLayout';
import { getRenderedWireLineMm, resolveWireGeometry } from './wireVisuals';

interface BoardSvgProps {
  width: number;
  height: number;
  scale: number;
}

interface CanvasBoundsMm {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const HEADER_WIDTH = 50;
const HEADER_HEIGHT = 40;
const SPLIT_GAP = 24;
const EMPTY_HOLE_IDS = new Set<string>();
const ANNOTATION_FONT_SIZE_PX = 12;
const ANNOTATION_TEXT_OFFSET_X_PX = 8;
const ANNOTATION_TEXT_OFFSET_Y_PX = -10;
const ANNOTATION_HIT_PADDING_PX = 8;
const BOARD_HEADER_FONT_SIZE_PX = 11;
const BOARD_HEADER_MINOR_COLOR = '#cbd5e1';
const BOARD_HEADER_MAJOR_COLOR = '#f8fafc';
const BOARD_HEADER_STROKE = 'rgba(15, 23, 42, 0.95)';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function snapToHoleGrid(valueMm: number, pitchMm: number): number {
  return Math.round((valueMm - pitchMm / 2) / pitchMm) * pitchMm + pitchMm / 2;
}

function clampComponentPosition(
  xMm: number,
  yMm: number,
  canvasBoundsMm: CanvasBoundsMm,
  componentWidthMm: number,
  componentHeightMm: number
): { xMm: number; yMm: number } {
  const maxX = Math.max(canvasBoundsMm.minX, canvasBoundsMm.maxX - componentWidthMm);
  const maxY = Math.max(canvasBoundsMm.minY, canvasBoundsMm.maxY - componentHeightMm);

  return {
    xMm: clamp(xMm, canvasBoundsMm.minX, maxX),
    yMm: clamp(yMm, canvasBoundsMm.minY, maxY),
  };
}

function getBoardBoundsMm(board: Board): CanvasBoundsMm {
  return {
    minX: 0,
    maxX: board.widthMm,
    minY: 0,
    maxY: board.heightMm,
  };
}

function getComponentFootprintBoundsMm(
  component: {
    xMm: number;
    yMm: number;
    widthMm?: number;
    heightMm?: number;
    rotationDeg: 0 | 90 | 180 | 270;
  },
  definition: { body: { widthMm: number; heightMm: number } }
) {
  const footprintSize = getComponentFootprintSizeMm(component, definition);

  return {
    xMm: component.xMm,
    yMm: component.yMm,
    widthMm: footprintSize.widthMm,
    heightMm: footprintSize.heightMm,
  };
}

function getWorkspaceBoundsMm(
  board: Board,
  components: ComponentInstance[],
  componentDefinitions: ComponentDefinition[]
): CanvasBoundsMm {
  let minX = 0;
  let maxX = board.widthMm;
  let minY = 0;
  let maxY = board.heightMm;

  components.forEach((component) => {
    const definition = componentDefinitions.find((entry) => entry.id === component.definitionId);
    if (!definition) {
      return;
    }

    const bounds = getComponentFootprintBoundsMm(component, definition);
    minX = Math.min(minX, bounds.xMm);
    maxX = Math.max(maxX, bounds.xMm + bounds.widthMm);
    minY = Math.min(minY, bounds.yMm);
    maxY = Math.max(maxY, bounds.yMm + bounds.heightMm);
  });

  const baseMarginMm = Math.max(board.pitchMm * 2, 6);
  const extraX = Math.max(baseMarginMm, -minX, maxX - board.widthMm) + baseMarginMm;
  const extraY = Math.max(baseMarginMm, -minY, maxY - board.heightMm) + baseMarginMm;

  return {
    minX: -extraX,
    maxX: board.widthMm + extraX,
    minY: -extraY,
    maxY: board.heightMm + extraY,
  };
}

function getPlacementBoundsMm(
  board: Board,
  workspaceBoundsMm: CanvasBoundsMm,
  placementType: ComponentInstance['placementType'],
  componentFootprintMm?: { widthMm: number; heightMm: number }
): CanvasBoundsMm {
  if (placementType !== 'external') {
    return getBoardBoundsMm(board);
  }

  const externalMarginMm = Math.max(board.pitchMm * 4, 8);
  const extraX =
    Math.max(board.widthMm * 0.5, componentFootprintMm?.widthMm ?? 0) + externalMarginMm;
  const extraY =
    Math.max(board.heightMm * 0.5, componentFootprintMm?.heightMm ?? 0) + externalMarginMm;

  return {
    minX: Math.min(workspaceBoundsMm.minX, -extraX),
    maxX: Math.max(workspaceBoundsMm.maxX, board.widthMm + extraX),
    minY: Math.min(workspaceBoundsMm.minY, -extraY),
    maxY: Math.max(workspaceBoundsMm.maxY, board.heightMm + extraY),
  };
}

function createEmptyPinHoleMap(definition: ComponentDefinition): ComponentInstance['pinHoleMap'] {
  return Object.fromEntries(definition.pins.map((pin) => [pin.id, null]));
}

function isWireVisibleInView(wire: Wire, activeView: 'top' | 'bottom' | 'split'): boolean {
  if (activeView === 'split') {
    return wire.side === 'top' || wire.side === 'bottom' || wire.side === 'external';
  }

  if (activeView === 'top') {
    return wire.side === 'top' || wire.side === 'external';
  }

  return wire.side === 'bottom';
}

function getBoardLayout(
  board: Board,
  workspaceBoundsMm: CanvasBoundsMm,
  width: number,
  height: number,
  originX: number,
  originY: number,
  maxScale: number
) {
  const availableWidth = Math.max(1, width);
  const availableHeight = Math.max(1, height);
  const workspaceWidthMm = Math.max(1, workspaceBoundsMm.maxX - workspaceBoundsMm.minX);
  const workspaceHeightMm = Math.max(1, workspaceBoundsMm.maxY - workspaceBoundsMm.minY);
  const fitScale = Math.min(
    maxScale,
    availableWidth / workspaceWidthMm,
    availableHeight / workspaceHeightMm
  );
  const workspaceWidthPx = mmToPx(workspaceWidthMm, fitScale);
  const workspaceHeightPx = mmToPx(workspaceHeightMm, fitScale);
  const boardWidthPx = mmToPx(board.widthMm, fitScale);
  const boardHeightPx = mmToPx(board.heightMm, fitScale);

  return {
    scale: fitScale,
    offsetX:
      originX +
      (availableWidth - workspaceWidthPx) / 2 -
      mmToPx(workspaceBoundsMm.minX, fitScale),
    offsetY:
      originY +
      (availableHeight - workspaceHeightPx) / 2 -
      mmToPx(workspaceBoundsMm.minY, fitScale),
    boardWidthPx,
    boardHeightPx,
  };
}

function getAnnotationLayout(
  annotation: { text?: string; xMm: number; yMm: number },
  scale: number,
  offsetX: number,
  offsetY: number
) {
  const anchor = getHolePixelPosition(annotation.xMm, annotation.yMm, scale, offsetX, offsetY);
  const text = annotation.text?.trim() || 'Note';
  const textX = anchor.x + ANNOTATION_TEXT_OFFSET_X_PX;
  const textY = anchor.y + ANNOTATION_TEXT_OFFSET_Y_PX;
  const textWidth = Math.max(24, text.length * 7);
  const textHeight = ANNOTATION_FONT_SIZE_PX;

  return {
    anchorX: anchor.x,
    anchorY: anchor.y,
    text,
    textX,
    textY,
    minX: Math.min(anchor.x - 6, textX - 2),
    maxX: Math.max(anchor.x + 6, textX + textWidth),
    minY: Math.min(anchor.y - 6, textY - textHeight / 2 - 2),
    maxY: Math.max(anchor.y + 6, textY + textHeight / 2 + 2),
  };
}

export const BoardSvg: React.FC<BoardSvgProps> = ({ width, height, scale }) => {
  const {
    project,
    selectedTool,
    selectedId,
    wireStartEndpoint,
    setSelectedId,
    setWireStartEndpoint,
    addSolderJoint,
    addAnnotation,
    addComponent,
    selectedComponentDefinitionId,
    componentLabel,
    componentColor,
    annotationText,
    annotationColor,
    componentWidthMm,
    componentHeightMm,
    componentRotationDeg,
    componentPlacementType,
    solderColor,
    componentDefinitions,
    copperSegments,
  } = useProjectStore();

  const [draggingComponent, setDraggingComponent] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [componentDragStart, setComponentDragStart] = useState<{ xMm: number; yMm: number } | null>(
    null
  );
  const suppressClickRef = useRef(false);

  if (!project) {
    return (
      <svg width={width} height={height}>
        <rect width={width} height={height} fill="#1a1a2e" />
        <text x={width / 2} y={height / 2} textAnchor="middle" fill="#888">
          No project loaded
        </text>
      </svg>
    );
  }

  const { board, settings } = project;
  const showBoardPrepView = settings.boardPrepMode;
  const activeView = showBoardPrepView ? 'bottom' : settings.activeView;
  const showOppositeSideOverlay =
    !showBoardPrepView &&
    settings.showOppositeSideOverlay &&
    (activeView === 'top' || activeView === 'bottom');
  const overlayOpacity = clamp(settings.overlayOpacity ?? 0.3, 0, 1);
  const topSolderHoleIds = new Set(
    project.solderJoints.filter((joint) => joint.side === 'top').map((joint) => joint.holeId)
  );
  const bottomSolderHoleIds = new Set(
    project.solderJoints.filter((joint) => joint.side === 'bottom').map((joint) => joint.holeId)
  );
  const workspaceBoundsMm = getWorkspaceBoundsMm(board, project.components, componentDefinitions);
  const singleViewLayout = getBoardLayout(
    board,
    workspaceBoundsMm,
    width - HEADER_WIDTH,
    height - HEADER_HEIGHT,
    HEADER_WIDTH,
    HEADER_HEIGHT,
    scale
  );
  const renderScale = singleViewLayout.scale;
  const offsetX = singleViewLayout.offsetX;
  const offsetY = singleViewLayout.offsetY;
  const columnHeaderY = Math.max(HEADER_HEIGHT - 8, offsetY - 14);
  const columnHeaderHoles = board.holes
    .filter((hole) => hole.row === 0)
    .sort((left, right) => left.col - right.col);
  const rowHeaderHoles = board.holes
    .filter((hole) => hole.col === 0)
    .sort((left, right) => left.row - right.row);
  const rowHeaderAnchorX =
    rowHeaderHoles.length > 0
      ? offsetX + mmToPx(rowHeaderHoles[0].xMm - board.pitchMm / 2, renderScale)
      : offsetX;
  const rowHeaderX = Math.max(12, rowHeaderAnchorX - 12);
  const showBoardLabels = showBoardPrepView || settings.showLabels;
  const renderAnnotations = useCallback(
    (annotationScale: number, annotationOffsetX: number, annotationOffsetY: number, keyPrefix: string) =>
      project.annotations.map((annotation) => {
        const layout = getAnnotationLayout(
          annotation,
          annotationScale,
          annotationOffsetX,
          annotationOffsetY
        );
        const isSelected = selectedId?.type === 'annotation' && selectedId.id === annotation.id;
        const strokeColor = isSelected ? '#fff3bf' : annotation.color || '#ffd166';
        const fillColor = annotation.color || '#ffd166';

        return (
          <g key={`${keyPrefix}-${annotation.id}`}>
            <line
              x1={layout.anchorX}
              y1={layout.anchorY}
              x2={layout.textX - 4}
              y2={layout.textY}
              stroke={strokeColor}
              strokeWidth={1}
              opacity={0.85}
            />
            <circle
              cx={layout.anchorX}
              cy={layout.anchorY}
              r={mmToPx(0.45, annotationScale)}
              fill={fillColor}
              stroke={isSelected ? '#fff8db' : '#101820'}
              strokeWidth={isSelected ? 1.5 : 1}
            />
            <text
              x={layout.textX}
              y={layout.textY}
              textAnchor="start"
              dominantBaseline="middle"
              fill={isSelected ? '#fff8db' : fillColor}
              fontSize={ANNOTATION_FONT_SIZE_PX}
              fontWeight={isSelected ? 700 : 600}
            >
              {layout.text}
            </text>
          </g>
        );
      }),
    [project.annotations, selectedId]
  );

  const handleComponentPlace = useCallback(
    (boardXMm: number, boardYMm: number) => {
      if (!selectedComponentDefinitionId) return;

      const definition = componentDefinitions.find(
        (entry) => entry.id === selectedComponentDefinitionId
      );
      if (!definition) return;

      const rotationDeg = normalizeRotationDeg(componentRotationDeg);
      const footprintSize = getComponentFootprintSizeMm(
        {
          widthMm: componentWidthMm,
          heightMm: componentHeightMm,
          rotationDeg,
        },
        definition
      );
      const snappedXMm = snapToHoleGrid(boardXMm, board.pitchMm);
      const snappedYMm = snapToHoleGrid(boardYMm, board.pitchMm);
      const placementBoundsMm = getPlacementBoundsMm(
        board,
        workspaceBoundsMm,
        componentPlacementType,
        footprintSize
      );
      const position = clampComponentPosition(
        snappedXMm,
        snappedYMm,
        placementBoundsMm,
        footprintSize.widthMm,
        footprintSize.heightMm
      );

      addComponent({
        id: `comp_${Date.now()}`,
        definitionId: selectedComponentDefinitionId,
        name: componentLabel || definition.name,
        xMm: position.xMm,
        yMm: position.yMm,
        widthMm: componentWidthMm,
        heightMm: componentHeightMm,
        rotationDeg,
        placementType: componentPlacementType,
        pinLayoutOverrides: {},
        pinHoleMap: createEmptyPinHoleMap(definition),
        color: componentColor,
      });
    },
    [
      addComponent,
      board.pitchMm,
      board,
      componentColor,
      componentDefinitions,
      componentHeightMm,
      componentLabel,
      componentPlacementType,
      componentRotationDeg,
      componentWidthMm,
      selectedComponentDefinitionId,
      workspaceBoundsMm,
    ]
  );

  const pointToLineDistance = (
    x: number,
    y: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): number => {
    const a = x - x1;
    const b = y - y1;
    const c = x2 - x1;
    const d = y2 - y1;
    const dot = a * c + b * d;
    const lenSq = c * c + d * d;
    const param = lenSq !== 0 ? dot / lenSq : -1;
    let xx: number;
    let yy: number;

    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * c;
      yy = y1 + param * d;
    }

    const dx = x - xx;
    const dy = y - yy;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const findComponentPinAtPoint = useCallback(
    (clickX: number, clickY: number, thresholdPx: number) => {
      if (showBoardPrepView || activeView !== 'top') {
        return null;
      }

      for (const component of project.components) {
        const definition = componentDefinitions.find((entry) => entry.id === component.definitionId);
        if (!definition) continue;

        for (const pin of getComponentPinPositionsMm(component, definition)) {
          const pinPos = getHolePixelPosition(
            pin.xMm,
            pin.yMm,
            renderScale,
            offsetX,
            offsetY
          );
          const distance = Math.hypot(clickX - pinPos.x, clickY - pinPos.y);

          if (distance < thresholdPx) {
            return {
              type: 'componentPin' as const,
              id: getComponentPinObjectId(component.id, pin.pinId),
            };
          }
        }
      }

      return null;
    },
    [activeView, componentDefinitions, offsetX, offsetY, project.components, renderScale, showBoardPrepView]
  );

  const findNearestSelectable = useCallback(
    (
      clickX: number,
      clickY: number,
      thresholdPx: number
    ):
      | {
          type: 'component' | 'componentPin' | 'annotation' | 'wire' | 'solder' | 'cut' | 'hole' | 'segment';
          id: string;
        }
      | null => {
      const componentPin = findComponentPinAtPoint(clickX, clickY, thresholdPx * 1.2);
      if (componentPin) {
        return componentPin;
      }

      if (!showBoardPrepView && activeView === 'top') {
        for (const component of project.components) {
          const definition = componentDefinitions.find((entry) => entry.id === component.definitionId);
          if (!definition) continue;

          const bounds = getComponentFootprintBoundsMm(component, definition);
          const compX = offsetX + mmToPx(bounds.xMm, renderScale);
          const compY = offsetY + mmToPx(bounds.yMm, renderScale);
          const compWidth = mmToPx(bounds.widthMm, renderScale);
          const compHeight = mmToPx(bounds.heightMm, renderScale);

          if (
            clickX >= compX &&
            clickX <= compX + compWidth &&
            clickY >= compY &&
            clickY <= compY + compHeight
          ) {
            return { type: 'component', id: component.id };
          }
        }
      }

      if (!showBoardPrepView) {
        let nearestAnnotation: { id: string; distancePx: number } | null = null;

        for (const annotation of project.annotations) {
          const layout = getAnnotationLayout(annotation, renderScale, offsetX, offsetY);
          const dx =
            clickX < layout.minX
              ? layout.minX - clickX
              : clickX > layout.maxX
                ? clickX - layout.maxX
                : 0;
          const dy =
            clickY < layout.minY
              ? layout.minY - clickY
              : clickY > layout.maxY
                ? clickY - layout.maxY
                : 0;
          const distance = Math.hypot(dx, dy);

          if (distance <= ANNOTATION_HIT_PADDING_PX) {
            if (!nearestAnnotation || distance < nearestAnnotation.distancePx) {
              nearestAnnotation = { id: annotation.id, distancePx: distance };
            }
          }
        }

        if (nearestAnnotation) {
          return { type: 'annotation', id: nearestAnnotation.id };
        }
      }

      if (!showBoardPrepView) {
        let nearestWire: { id: string; distancePx: number } | null = null;

        for (const wire of project.wires) {
          if (!isWireVisibleInView(wire, activeView)) continue;

          const geometry = resolveWireGeometry(
            wire,
            board,
            project.components,
            componentDefinitions
          );
          if (!geometry) continue;

          const solderHoleIds =
            wire.side === 'bottom'
              ? bottomSolderHoleIds
              : wire.side === 'top'
                ? topSolderHoleIds
                : EMPTY_HOLE_IDS;
          const lineMm = getRenderedWireLineMm(wire, geometry, solderHoleIds);
          const fromPos = getHolePixelPosition(
            lineMm.x1Mm,
            lineMm.y1Mm,
            renderScale,
            offsetX,
            offsetY
          );
          const toPos = getHolePixelPosition(
            lineMm.x2Mm,
            lineMm.y2Mm,
            renderScale,
            offsetX,
            offsetY
          );
          const distance = pointToLineDistance(
            clickX,
            clickY,
            fromPos.x,
            fromPos.y,
            toPos.x,
            toPos.y
          );
          const lineLengthPx = Math.hypot(toPos.x - fromPos.x, toPos.y - fromPos.y);
          const wireThresholdPx =
            lineLengthPx <= mmToPx(3.5, renderScale)
              ? Math.max(thresholdPx, 14)
              : Math.max(thresholdPx, 10);

          if (distance < wireThresholdPx) {
            if (!nearestWire || distance < nearestWire.distancePx) {
              nearestWire = { id: wire.id, distancePx: distance };
            }
          }
        }

        if (nearestWire) {
          return { type: 'wire', id: nearestWire.id };
        }
      }

      if (!showBoardPrepView) {
        for (const joint of project.solderJoints) {
          if (joint.side !== activeView) continue;

          const hole = board.holes.find((entry) => entry.id === joint.holeId);
          if (!hole) continue;

          const pos = getHolePixelPosition(hole.xMm, hole.yMm, renderScale, offsetX, offsetY);
          const distance = Math.hypot(clickX - pos.x, clickY - pos.y);

          if (distance < thresholdPx * 1.5) {
            return { type: 'solder', id: joint.id };
          }
        }
      }

      if (activeView === 'bottom') {
        for (const strip of board.strips) {
          for (const cut of strip.cuts) {
            if (cut.side !== 'bottom') continue;

            const cutHole = board.holes.find((hole) => hole.id === cut.afterHoleId);
            if (!cutHole) continue;

            const pos = getHolePixelPosition(
              cutHole.xMm,
              cutHole.yMm,
              renderScale,
              offsetX,
              offsetY
            );
            const distance = Math.hypot(clickX - pos.x, clickY - pos.y);

            if (distance < thresholdPx * 1.5) {
              return { type: 'cut', id: cut.id };
            }
          }
        }
      }

      const nearestHole = findNearestHole(
        clickX,
        clickY,
        board.holes,
        renderScale,
        offsetX,
        offsetY,
        3
      );

      if (nearestHole) {
        return { type: 'hole', id: nearestHole.id };
      }

      for (const segment of copperSegments) {
        if (
          isPointInsideSegment(
            board,
            segment,
            clickX,
            clickY,
            renderScale,
            offsetX,
            offsetY,
            thresholdPx * 0.35
          )
        ) {
          return { type: 'segment', id: segment.id };
        }
      }

      return null;
    },
    [
      activeView,
      board,
      componentDefinitions,
      copperSegments,
      findComponentPinAtPoint,
      offsetX,
      offsetY,
      project,
      renderScale,
      showBoardPrepView,
      topSolderHoleIds,
      bottomSolderHoleIds,
    ]
  );

  const findComponentAtPoint = useCallback(
    (clickX: number, clickY: number) => {
      if (showBoardPrepView || activeView !== 'top') return null;

      for (const component of project.components) {
        const definition = componentDefinitions.find((entry) => entry.id === component.definitionId);
        if (!definition) continue;

        const bounds = getComponentFootprintBoundsMm(component, definition);
        const compLeft = offsetX + mmToPx(bounds.xMm, renderScale);
        const compRight = offsetX + mmToPx(bounds.xMm + bounds.widthMm, renderScale);
        const compTop = offsetY + mmToPx(bounds.yMm, renderScale);
        const compBottom = offsetY + mmToPx(bounds.yMm + bounds.heightMm, renderScale);

        if (
          clickX >= compLeft &&
          clickX <= compRight &&
          clickY >= compTop &&
          clickY <= compBottom
        ) {
          return component;
        }
      }

      return null;
    },
    [activeView, componentDefinitions, offsetX, offsetY, project.components, renderScale, showBoardPrepView]
  );

  const getWireSideForEndpoints = useCallback(
    (from: ConnectionEndpoint, to: ConnectionEndpoint): Wire['side'] => {
      const endpoints = [from, to];
      const usesExternalComponentPin = endpoints.some((endpoint) => {
        if (endpoint.type !== 'componentPin') {
          return false;
        }

        return (
          project.components.find((component) => component.id === endpoint.componentId)?.placementType ===
          'external'
        );
      });

      if (usesExternalComponentPin) {
        return 'external';
      }

      return activeView === 'bottom' ? 'bottom' : 'top';
    },
    [activeView, project.components]
  );

  const handleConnectionEndpointClick = useCallback(
    (endpoint: ConnectionEndpoint) => {
      const { selectedTool: currentTool } = useProjectStore.getState();

      if (currentTool === 'wire' && wireStartEndpoint) {
        const { addWire, setWireStartEndpoint, wireColor: currentWireColor } =
          useProjectStore.getState();

        if (isSameConnectionEndpoint(wireStartEndpoint, endpoint)) {
          setWireStartEndpoint(null);
          return;
        }

        addWire({
          id: `wire_${Date.now()}`,
          from: wireStartEndpoint,
          to: endpoint,
          side: getWireSideForEndpoints(wireStartEndpoint, endpoint),
          color: currentWireColor,
        });
        setWireStartEndpoint(null);
      } else if (currentTool === 'wire') {
        setWireStartEndpoint(endpoint);
      } else if (endpoint.type === 'componentPin') {
        setSelectedId({
          type: 'componentPin',
          id: getComponentPinObjectId(endpoint.componentId, endpoint.pinId),
        });
      } else {
        setSelectedId({ type: 'hole', id: endpoint.holeId });
      }
    },
    [getWireSideForEndpoints, setSelectedId, setWireStartEndpoint, wireStartEndpoint]
  );

  const handleHoleClick = useCallback(
    (holeId: string) => {
      const { selectedTool: currentTool } = useProjectStore.getState();

      if (currentTool === 'wire') {
        handleConnectionEndpointClick({ type: 'hole', holeId });
      } else if (currentTool === 'cut' && activeView === 'bottom') {
        const strip = board.strips.find((entry) => entry.holeIds.includes(holeId));
        if (strip) {
          const nextState = useProjectStore.getState();
          const nextBoard = toggleStripCut(nextState.project!.board, strip.id, holeId);
          nextState.updateBoard(nextBoard);
        }
      } else if (currentTool === 'solder') {
        const side = activeView === 'bottom' ? 'bottom' : 'top';
        const existing = project.solderJoints.find(
          (joint) => joint.holeId === holeId && joint.side === side
        );

        if (existing) {
          const nextState = useProjectStore.getState();
          if (nextState.project) {
            nextState.setProject({
              ...nextState.project,
              solderJoints: nextState.project.solderJoints.filter(
                (joint) => joint.id !== existing.id
              ),
            });
          }
        } else {
          addSolderJoint({
            id: `solder_${Date.now()}`,
            holeId,
            side,
            color: solderColor,
          });
        }
      } else if (currentTool === 'component' && selectedComponentDefinitionId) {
        const targetHole = board.holes.find((hole) => hole.id === holeId);
        if (targetHole) {
          const definition = useProjectStore.getState().componentDefinitions.find(
            (entry) => entry.id === selectedComponentDefinitionId
          );

          if (definition) {
            const rotationDeg = normalizeRotationDeg(componentRotationDeg);
            const footprintSize = getComponentFootprintSizeMm(
              {
                widthMm: componentWidthMm,
                heightMm: componentHeightMm,
                rotationDeg,
              },
              definition
            );
            const position = clampComponentPosition(
              targetHole.xMm,
              targetHole.yMm,
              getPlacementBoundsMm(
                board,
                workspaceBoundsMm,
                componentPlacementType,
                footprintSize
              ),
              footprintSize.widthMm,
              footprintSize.heightMm
            );

            addComponent({
              id: `comp_${Date.now()}`,
              definitionId: selectedComponentDefinitionId,
              name: componentLabel || definition.name,
              xMm: position.xMm,
              yMm: position.yMm,
              widthMm: componentWidthMm,
              heightMm: componentHeightMm,
              rotationDeg,
              placementType: componentPlacementType,
              pinLayoutOverrides: {},
              pinHoleMap: createEmptyPinHoleMap(definition),
              color: componentColor,
            });
          }
        }
      } else {
        setSelectedId({ type: 'hole', id: holeId });
      }
    },
    [
      activeView,
      addComponent,
      addSolderJoint,
      board,
      componentColor,
      componentHeightMm,
      componentLabel,
      componentPlacementType,
      componentRotationDeg,
      componentWidthMm,
      handleConnectionEndpointClick,
      project.solderJoints,
      selectedComponentDefinitionId,
      setSelectedId,
      solderColor,
      workspaceBoundsMm,
    ]
  );

  const handleBoardClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }

      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      if (clickX < HEADER_WIDTH || clickY < HEADER_HEIGHT) return;

      const nearestHole = findNearestHole(
        clickX,
        clickY,
        board.holes,
        renderScale,
        offsetX,
        offsetY,
        1.6
      );

      if (selectedTool !== 'select') {
        if (showBoardPrepView && selectedTool !== 'cut') {
          setSelectedId(null);
          return;
        }

        if (selectedTool === 'annotation') {
          const boardXMm = pxToMm(clickX - offsetX, renderScale);
          const boardYMm = pxToMm(clickY - offsetY, renderScale);
          const snappedXMm = settings.gridSnap ? snapToHoleGrid(boardXMm, board.pitchMm) : boardXMm;
          const snappedYMm = settings.gridSnap ? snapToHoleGrid(boardYMm, board.pitchMm) : boardYMm;
          const annotationId = `annotation_${Date.now()}`;

          addAnnotation({
            id: annotationId,
            type: 'label',
            text: annotationText.trim() || 'Note',
            xMm: nearestHole?.xMm ?? snappedXMm,
            yMm: nearestHole?.yMm ?? snappedYMm,
            color: annotationColor,
          });
          setSelectedId({ type: 'annotation', id: annotationId });
          return;
        }

        if (nearestHole) {
          handleHoleClick(nearestHole.id);
          return;
        }

        if (selectedTool === 'wire') {
          const componentPin = findComponentPinAtPoint(clickX, clickY, mmToPx(1.8, renderScale));
          const componentPinRef = componentPin ? parseComponentPinObjectId(componentPin.id) : null;

          if (componentPinRef) {
            handleConnectionEndpointClick({
              type: 'componentPin',
              componentId: componentPinRef.componentId,
              pinId: componentPinRef.pinId,
            });
            return;
          }
        }

        const boardXMm = pxToMm(clickX - offsetX, renderScale);
        const boardYMm = pxToMm(clickY - offsetY, renderScale);

        if (selectedTool === 'component' && selectedComponentDefinitionId) {
          handleComponentPlace(boardXMm, boardYMm);
        } else {
          setSelectedId(null);
        }

        return;
      }

      const thresholdPx = mmToPx(2, renderScale);
      const selectable = findNearestSelectable(clickX, clickY, thresholdPx);

      if (selectable) {
        if (selectable.type === 'hole') {
          handleHoleClick(selectable.id);
        } else {
          setSelectedId({ type: selectable.type, id: selectable.id });
        }
      } else {
        setSelectedId(null);
      }
    },
    [
      board.holes,
      findComponentPinAtPoint,
      findNearestSelectable,
      handleConnectionEndpointClick,
      handleComponentPlace,
      handleHoleClick,
      addAnnotation,
      annotationColor,
      annotationText,
      offsetX,
      offsetY,
      renderScale,
      settings.gridSnap,
      board.pitchMm,
      selectedComponentDefinitionId,
      selectedTool,
      setSelectedId,
      showBoardPrepView,
    ]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (selectedTool !== 'select' || e.button !== 0) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const componentPin = findComponentPinAtPoint(clickX, clickY, mmToPx(2, renderScale));

      if (componentPin) {
        return;
      }

      const component = findComponentAtPoint(clickX, clickY);
      if (!component) return;

      setSelectedId({ type: 'component', id: component.id });
      setDraggingComponent(component.id);
      setDragStart({ x: clickX, y: clickY });
      setComponentDragStart({ xMm: component.xMm, yMm: component.yMm });
      suppressClickRef.current = false;
    },
    [findComponentAtPoint, findComponentPinAtPoint, renderScale, selectedTool, setSelectedId]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!draggingComponent || !dragStart || !componentDragStart) return;

      const component = project.components.find((entry) => entry.id === draggingComponent);
      if (!component) return;

      const definition = componentDefinitions.find((entry) => entry.id === component.definitionId);
      if (!definition) return;
      const footprintSize = getComponentFootprintSizeMm(component, definition);

      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const dxMm = pxToMm(clickX - dragStart.x, renderScale);
      const dyMm = pxToMm(clickY - dragStart.y, renderScale);
      const dragDistancePx = Math.hypot(clickX - dragStart.x, clickY - dragStart.y);

      if (dragDistancePx > 2) {
        suppressClickRef.current = true;
      }

      const topLeftXMm = componentDragStart.xMm + dxMm;
      const topLeftYMm = componentDragStart.yMm + dyMm;
      const snappedXMm = snapToHoleGrid(topLeftXMm, board.pitchMm);
      const snappedYMm = snapToHoleGrid(topLeftYMm, board.pitchMm);
      const position = clampComponentPosition(
        snappedXMm,
        snappedYMm,
        getPlacementBoundsMm(board, workspaceBoundsMm, component.placementType, footprintSize),
        footprintSize.widthMm,
        footprintSize.heightMm
      );

      useProjectStore
        .getState()
        .updateComponentPosition(draggingComponent, position.xMm, position.yMm);
    },
    [
      board.pitchMm,
      board,
      componentDefinitions,
      componentDragStart,
      dragStart,
      draggingComponent,
      project.components,
      renderScale,
      workspaceBoundsMm,
    ]
  );

  const handleMouseUp = useCallback(() => {
    setDraggingComponent(null);
    setDragStart(null);
    setComponentDragStart(null);
  }, []);

  if (activeView === 'split') {
    const splitAreaWidth = width - HEADER_WIDTH;
    const halfWidth = (splitAreaWidth - SPLIT_GAP) / 2;
    const topLayout = getBoardLayout(
      board,
      workspaceBoundsMm,
      halfWidth,
      height - HEADER_HEIGHT,
      HEADER_WIDTH,
      HEADER_HEIGHT,
      scale
    );
    const bottomLayout = getBoardLayout(
      board,
      workspaceBoundsMm,
      halfWidth,
      height - HEADER_HEIGHT,
      HEADER_WIDTH + halfWidth + SPLIT_GAP,
      HEADER_HEIGHT,
      scale
    );
    const topContent = renderTopView({
      board,
      scale: topLayout.scale,
      offsetX: topLayout.offsetX,
      offsetY: topLayout.offsetY,
      selectedId,
      wireStartEndpoint,
      selectedTool,
    });
    const bottomContent = renderBottomView({
      board,
      scale: bottomLayout.scale,
      offsetX: bottomLayout.offsetX,
      offsetY: bottomLayout.offsetY,
      selectedId,
      wireStartEndpoint,
      selectedTool,
    });

    return (
      <svg
        width={width}
        height={height}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <rect width={width} height={height} fill="#1a1a2e" />
        <text
          x={HEADER_WIDTH + halfWidth / 2}
          y={HEADER_HEIGHT / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#aaa"
          fontSize="12"
        >
          TOP VIEW
        </text>
        <text
          x={HEADER_WIDTH + halfWidth + SPLIT_GAP + halfWidth / 2}
          y={HEADER_HEIGHT / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#aaa"
          fontSize="12"
        >
          BOTTOM VIEW
        </text>
        {topContent}
        {bottomContent}
        {!showBoardPrepView &&
          renderAnnotations(topLayout.scale, topLayout.offsetX, topLayout.offsetY, 'top-annotation')}
        {!showBoardPrepView &&
          renderAnnotations(
            bottomLayout.scale,
            bottomLayout.offsetX,
            bottomLayout.offsetY,
            'bottom-annotation'
          )}
      </svg>
    );
  }

  const svgContent =
    activeView === 'top'
      ? renderTopView({
          board,
          scale: renderScale,
          offsetX,
          offsetY,
          selectedId,
          wireStartEndpoint,
          selectedTool,
        })
      : renderBottomView({
          board,
          scale: renderScale,
          offsetX,
          offsetY,
          selectedId,
          wireStartEndpoint,
          selectedTool,
        });

  const overlayContent =
    showOppositeSideOverlay && activeView === 'top'
      ? renderBottomView({
          board,
          scale: renderScale,
          offsetX,
          offsetY,
          selectedId,
          wireStartEndpoint,
          selectedTool,
          includeBoardBase: false,
          includeHoles: false,
          includeLabels: false,
          opacity: overlayOpacity,
          pointerEvents: 'none',
        })
      : showOppositeSideOverlay && activeView === 'bottom'
        ? renderTopView({
            board,
            scale: renderScale,
            offsetX,
            offsetY,
            selectedId,
            wireStartEndpoint,
            selectedTool,
            includeBoardBase: false,
            includeHoles: false,
            includeLabels: false,
            opacity: overlayOpacity,
            pointerEvents: 'none',
          })
        : null;

  return (
    <svg
      width={width}
      height={height}
      onClick={handleBoardClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <rect width={width} height={height} fill="#1a1a2e" />
      {svgContent}
      {overlayContent}
      {!showBoardPrepView && renderAnnotations(renderScale, offsetX, offsetY, 'annotation')}
      {showBoardLabels &&
        columnHeaderHoles.map((hole) => {
          const isMajor = (hole.col + 1) % 5 === 0;

          return (
            <text
              key={`col-header-${hole.col}`}
              x={offsetX + mmToPx(hole.xMm, renderScale)}
              y={columnHeaderY}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={isMajor ? BOARD_HEADER_MAJOR_COLOR : BOARD_HEADER_MINOR_COLOR}
              fontSize={BOARD_HEADER_FONT_SIZE_PX}
              fontWeight={isMajor ? 700 : 500}
              stroke={BOARD_HEADER_STROKE}
              strokeWidth={2.4}
              paintOrder="stroke"
            >
              {hole.col + 1}
            </text>
          );
        })}
      {showBoardLabels &&
        rowHeaderHoles.map((hole) => {
          const isMajor = (hole.row + 1) % 5 === 0;

          return (
            <text
              key={`row-header-${hole.row}`}
              x={rowHeaderX}
              y={offsetY + mmToPx(hole.yMm, renderScale)}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={isMajor ? BOARD_HEADER_MAJOR_COLOR : BOARD_HEADER_MINOR_COLOR}
              fontSize={BOARD_HEADER_FONT_SIZE_PX}
              fontWeight={isMajor ? 700 : 500}
              stroke={BOARD_HEADER_STROKE}
              strokeWidth={2.4}
              paintOrder="stroke"
            >
              {hole.row + 1}
            </text>
          );
        })}
    </svg>
  );
};
