import React, { useRef, useEffect, useState } from "react";
import {
  useAnnotationStore,
  initialDocumentState,
} from "../store/useAnnotationStore";
import {
  drawAnnotation,
  drawResizeHandles,
  isPointInStamp,
  isPointInHighlight,
  getShapeBounds,
  drawSelectionOutline,
} from "../utils/drawingUtils";
import { Point, Annotation } from "../types/annotation";
import { TextInput } from "./TextInput";
import { ContextMenu } from "./ContextMenu";
import {
  ResizeHandle,
  getResizeHandle,
  getResizeCursor,
  getResizedPoints,
  isValidResize,
} from "../utils/resizeUtils";

interface AnnotationCanvasProps {
  documentId: string;
  pageNumber: number;
  scale: number;
  width: number;
  height: number;
  onPaste?: (pageNumber: number) => void;
}

export const AnnotationCanvas: React.FC<AnnotationCanvasProps> = ({
  documentId,
  pageNumber,
  scale,
  width,
  height,
  onPaste,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [selectedAnnotations, setSelectedAnnotations] = useState<Annotation[]>(
    []
  );
  const [activeHandle, setActiveHandle] = useState<ResizeHandle>(null);
  const lastPointRef = useRef<Point | null>(null);
  const [textInputPosition, setTextInputPosition] = useState<Point | null>(
    null
  );
  const [isEditingText, setIsEditingText] = useState(false);
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(
    null
  );
  const [moveOffset, setMoveOffset] = useState<Point | null>(null);
  const [selectionBox, setSelectionBox] = useState<{
    start: Point;
    end: Point;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    position: Point;
  } | null>(null);

  const store = useAnnotationStore();
  const { currentTool, currentStyle, currentDrawMode } = store;
  const documentState = store.documents[documentId] || initialDocumentState();

  const getCanvasPoint = (e: React.MouseEvent): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scrollContainer = canvas.parentElement?.parentElement;

    if (!scrollContainer) return { x: 0, y: 0 };

    // Get scroll offsets
    const scrollLeft = scrollContainer.scrollLeft;
    const scrollTop = scrollContainer.scrollTop;

    // Calculate the actual position considering scroll and zoom
    const x = (e.clientX - rect.left + scrollLeft) / scale;
    const y = (e.clientY - rect.top + scrollTop) / scale;

    return { x, y };
  };

  const getResizeHandle = (
    point: Point,
    annotation: Annotation
  ): ResizeHandle => {
    if (!annotation.points || annotation.points.length < 2) return null;

    const [start, end] = annotation.points;
    const handleSize = 8 / scale; // Resize handle hit area

    const bounds = {
      left: Math.min(start.x, end.x),
      right: Math.max(start.x, end.x),
      top: Math.min(start.y, end.y),
      bottom: Math.max(start.y, end.y),
    };

    // Check corners first
    if (
      Math.abs(point.x - bounds.left) <= handleSize &&
      Math.abs(point.y - bounds.top) <= handleSize
    )
      return "topLeft";
    if (
      Math.abs(point.x - bounds.right) <= handleSize &&
      Math.abs(point.y - bounds.top) <= handleSize
    )
      return "topRight";
    if (
      Math.abs(point.x - bounds.left) <= handleSize &&
      Math.abs(point.y - bounds.bottom) <= handleSize
    )
      return "bottomLeft";
    if (
      Math.abs(point.x - bounds.right) <= handleSize &&
      Math.abs(point.y - bounds.bottom) <= handleSize
    )
      return "bottomRight";

    // Then check edges
    if (Math.abs(point.x - bounds.left) <= handleSize) return "left";
    if (Math.abs(point.x - bounds.right) <= handleSize) return "right";
    if (Math.abs(point.y - bounds.top) <= handleSize) return "top";
    if (Math.abs(point.y - bounds.bottom) <= handleSize) return "bottom";

    return null;
  };

  const isPointInAnnotation = (
    point: Point,
    annotation: Annotation
  ): boolean => {
    if (annotation.type === "stamp") {
      return isPointInStamp(point, annotation);
    } else if (annotation.type === "highlight") {
      return isPointInHighlight(point, annotation, scale);
    }

    // Get bounds based on shape type
    const bounds = getShapeBounds(annotation.points, annotation.type);

    // Add a small padding for easier selection
    const padding = 5 / scale;
    return (
      point.x >= bounds.left - padding &&
      point.x <= bounds.right + padding &&
      point.y >= bounds.top - padding &&
      point.y <= bounds.bottom + padding
    );
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const point = getCanvasPoint(e);

    if (currentTool === "select") {
      // Check if clicking on any selected annotation first
      const clickedSelectedAnnotation = selectedAnnotations.find((annotation) =>
        isPointInAnnotation(point, annotation)
      );

      if (clickedSelectedAnnotation) {
        // Check for resize handle first
        const handle = getResizeHandle(point, clickedSelectedAnnotation);
        if (handle) {
          setIsResizing(true);
          setActiveHandle(handle);
          return;
        }

        // Start moving if not resizing
        setMoveOffset(point);
        return;
      }

      // Check if clicking on any annotation
      const clickedAnnotation = documentState.annotations.find(
        (annotation) =>
          annotation.pageNumber === pageNumber &&
          isPointInAnnotation(point, annotation)
      );

      if (clickedAnnotation) {
        if (e.shiftKey) {
          // Add to selection if shift is held
          const isAlreadySelected = selectedAnnotations.some(
            (a) => a.id === clickedAnnotation.id
          );
          if (isAlreadySelected) {
            setSelectedAnnotations(
              selectedAnnotations.filter((a) => a.id !== clickedAnnotation.id)
            );
          } else {
            setSelectedAnnotations([...selectedAnnotations, clickedAnnotation]);
          }
        } else {
          // Replace selection if shift is not held
          setSelectedAnnotations([clickedAnnotation]);
        }
      } else {
        // Clear selection if clicking empty space
        setSelectedAnnotations([]);
      }
    } else if (currentTool === "text" || currentTool === "stickyNote") {
      // Convert point to scaled coordinates for text input
      const scaledPoint = {
        x: point.x,
        y: point.y,
      };
      setTextInputPosition(scaledPoint);
      setIsEditingText(true);
      setIsDrawing(false); // Ensure drawing mode is off
    } else {
      setIsDrawing(true);
      lastPointRef.current = point;

      // Initialize points at exact cursor position
      setCurrentPoints([
        { x: point.x, y: point.y },
        { x: point.x, y: point.y },
      ]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const point = getCanvasPoint(e);

    if (selectionBox) {
      // Update selection box end point
      setSelectionBox((prev) => (prev ? { ...prev, end: point } : null));

      // Find annotations within selection box
      const annotations = documentState.annotations.filter((annotation) => {
        if (annotation.pageNumber !== pageNumber) return false;
        return isAnnotationInSelectionBox(
          annotation,
          selectionBox.start,
          point
        );
      });

      // Update selected annotations
      store.selectAnnotations(annotations);
      return;
    }

    if (currentTool === "select") {
      // Handle resizing
      if (isResizing && selectedAnnotations.length === 1) {
        const annotation = selectedAnnotations[0];

        if (!isValidResize(annotation, activeHandle!)) {
          return;
        }

        const newPoints = getResizedPoints(
          annotation.points,
          activeHandle!,
          point,
          e.shiftKey
        );

        const updatedAnnotation = {
          ...annotation,
          points: newPoints,
        };

        store.updateAnnotation(documentId, updatedAnnotation);
        setSelectedAnnotations([updatedAnnotation]);
        return;
      }

      // Handle moving
      if (moveOffset && selectedAnnotations.length > 0) {
        const dx = point.x - moveOffset.x;
        const dy = point.y - moveOffset.y;

        const updatedAnnotations = selectedAnnotations.map((annotation) => {
          const newPoints = annotation.points.map((p) => ({
            x: p.x + dx,
            y: p.y + dy,
          }));

          return {
            ...annotation,
            points: newPoints,
          };
        });

        updatedAnnotations.forEach((annotation) => {
          store.updateAnnotation(documentId, annotation);
        });

        setSelectedAnnotations(updatedAnnotations);
        setMoveOffset(point);
        return;
      }

      // Update cursor based on hover
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (selectedAnnotations.length === 1) {
        const handle = getResizeHandle(point, selectedAnnotations[0]);
        if (handle) {
          canvas.style.cursor = getResizeCursor(handle);
          return;
        }
      }

      const isOverSelected = selectedAnnotations.some((annotation) =>
        isPointInAnnotation(point, annotation)
      );
      canvas.style.cursor = isOverSelected ? "move" : "default";
    } else if (isDrawing) {
      // Update end point while keeping start point fixed
      setCurrentPoints((prev) => [prev[0], { x: point.x, y: point.y }]);
      render();
    } else if (currentTool === "select") {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Check for resize handles first when a single annotation is selected
      if (selectedAnnotations.length === 1) {
        const handle = getResizeHandle(point, selectedAnnotations[0]);
        if (handle) {
          canvas.style.cursor = getResizeCursor(handle);
          return;
        }
      }

      // Check if hovering over any selected annotation
      const hoverSelected = selectedAnnotations.some((annotation) =>
        isPointInAnnotation(point, annotation)
      );

      if (hoverSelected) {
        canvas.style.cursor = "move";
        return;
      }

      // Check if hovering over any annotation
      const hoverAnnotation = documentState.annotations.find(
        (annotation) =>
          annotation.pageNumber === pageNumber &&
          isPointInAnnotation(point, annotation)
      );

      canvas.style.cursor = hoverAnnotation ? "move" : "default";
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (e.button !== 0) return;

    if (isDrawing && currentPoints.length === 2) {
      const [start, end] = currentPoints;

      // Check if the shape has a minimum size
      const dx = Math.abs(end.x - start.x);
      const dy = Math.abs(end.y - start.y);

      // Only create annotation if the shape has a minimum size
      if (dx >= 5 || dy >= 5) {
        const newAnnotation: Annotation = {
          id: Date.now().toString(),
          type: currentTool,
          points: currentPoints,
          style: currentStyle,
          pageNumber,
          timestamp: Date.now(),
          userId: "current-user",
        };

        store.addAnnotation(documentId, newAnnotation);

        // Clear selection to prevent immediate resizing
        store.clearSelection();
        setSelectedAnnotations([]);
      }
    }

    // Always clean up states
    setIsDrawing(false);
    setCurrentPoints([]);
    lastPointRef.current = null;
    setMoveOffset(null);
    setActiveHandle(null);
    setSelectionBox(null);
    setIsResizing(false);

    // Force render to clear any preview
    render();
  };

  const handleMouseLeave = () => {
    if (isDrawing && currentTool === "freehand" && currentPoints.length >= 2) {
      // Save the drawing if we have points
      const smoothedPoints = smoothPoints(currentPoints);
      const newAnnotation: Annotation = {
        id: Date.now().toString(),
        type: "freehand",
        points: smoothedPoints,
        style: currentStyle,
        pageNumber,
        timestamp: Date.now(),
        userId: "current-user",
      };

      store.addAnnotation(documentId, newAnnotation);
    }

    // Clean up all states
    setIsDrawing(false);
    setCurrentPoints([]);
    lastPointRef.current = null;
    setMoveOffset(null);
    setActiveHandle(null);
    setSelectionBox(null);
    setIsResizing(false);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (currentTool !== "select") return;

    const point = getCanvasPoint(e);
    const clickedAnnotation = [...documentState.annotations]
      .reverse()
      .find(
        (annotation) =>
          annotation.pageNumber === pageNumber &&
          (annotation.type === "text" || annotation.type === "stickyNote") &&
          isPointInAnnotation(point, annotation)
      );

    if (clickedAnnotation) {
      setEditingAnnotation(clickedAnnotation);
      setTextInputPosition(clickedAnnotation.points[0]);
      setIsEditingText(true);
    }
  };

  const handleTextComplete = (text: string) => {
    if (!text.trim()) {
      handleTextCancel();
      return;
    }

    if (editingAnnotation) {
      // Update existing annotation
      const updatedAnnotation = {
        ...editingAnnotation,
        style: { ...editingAnnotation.style, text },
      };
      store.updateAnnotation(documentId, updatedAnnotation);
    } else if (textInputPosition) {
      // Create new annotation
      const newAnnotation: Annotation = {
        id: Date.now().toString(),
        type: currentTool as "text" | "stickyNote",
        points: [textInputPosition], // Use unscaled position
        style: {
          ...currentStyle,
          text,
          color: currentTool === "stickyNote" ? "#000000" : currentStyle.color,
        },
        pageNumber,
        timestamp: Date.now(),
        userId: "current-user",
      };
      store.addAnnotation(documentId, newAnnotation);
    }

    // Clean up
    setTextInputPosition(null);
    setIsEditingText(false);
    setEditingAnnotation(null);
  };

  const handleTextCancel = () => {
    setTextInputPosition(null);
    setIsEditingText(false);
    setEditingAnnotation(null);
  };

  const isAnnotationInSelectionBox = (
    annotation: Annotation,
    start: Point,
    end: Point
  ): boolean => {
    const bounds = getShapeBounds(annotation.points, annotation.type);
    const selectionBounds = {
      left: Math.min(start.x, end.x),
      right: Math.max(start.x, end.x),
      top: Math.min(start.y, end.y),
      bottom: Math.max(start.y, end.y),
    };

    // For text and sticky notes, use center point
    if (annotation.type === "text" || annotation.type === "stickyNote") {
      const center = {
        x: bounds.left + (bounds.right - bounds.left) / 2,
        y: bounds.top + (bounds.bottom - bounds.top) / 2,
      };
      return (
        center.x >= selectionBounds.left &&
        center.x <= selectionBounds.right &&
        center.y >= selectionBounds.top &&
        center.y <= selectionBounds.bottom
      );
    }

    // For stamps, require full containment
    if (annotation.type === "stamp") {
      return (
        bounds.left >= selectionBounds.left &&
        bounds.right <= selectionBounds.right &&
        bounds.top >= selectionBounds.top &&
        bounds.bottom <= selectionBounds.bottom
      );
    }

    // For other shapes, check if any corner is inside the selection box
    // or if the selection box intersects with any edge
    const corners = [
      { x: bounds.left, y: bounds.top },
      { x: bounds.right, y: bounds.top },
      { x: bounds.left, y: bounds.bottom },
      { x: bounds.right, y: bounds.bottom },
    ];

    // Check if any corner is inside selection box
    const anyCornerInside = corners.some(
      (corner) =>
        corner.x >= selectionBounds.left &&
        corner.x <= selectionBounds.right &&
        corner.y >= selectionBounds.top &&
        corner.y <= selectionBounds.bottom
    );

    if (anyCornerInside) return true;

    // Check for intersection with selection box edges
    const edges = [
      [corners[0], corners[1]], // Top
      [corners[1], corners[3]], // Right
      [corners[2], corners[3]], // Bottom
      [corners[0], corners[2]], // Left
    ];

    const selectionEdges = [
      [
        { x: selectionBounds.left, y: selectionBounds.top },
        { x: selectionBounds.right, y: selectionBounds.top },
      ],
      [
        { x: selectionBounds.right, y: selectionBounds.top },
        { x: selectionBounds.right, y: selectionBounds.bottom },
      ],
      [
        { x: selectionBounds.left, y: selectionBounds.bottom },
        { x: selectionBounds.right, y: selectionBounds.bottom },
      ],
      [
        { x: selectionBounds.left, y: selectionBounds.top },
        { x: selectionBounds.left, y: selectionBounds.bottom },
      ],
    ];

    return edges.some((edge) =>
      selectionEdges.some((selEdge) =>
        doLinesIntersect(edge[0], edge[1], selEdge[0], selEdge[1])
      )
    );
  };

  // Helper function to check if two line segments intersect
  const doLinesIntersect = (
    p1: Point,
    p2: Point,
    p3: Point,
    p4: Point
  ): boolean => {
    const denominator =
      (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
    if (denominator === 0) return false;

    const ua =
      ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) /
      denominator;
    const ub =
      ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) /
      denominator;

    return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();

    const point = getCanvasPoint(e);

    // Check if clicking on a selected annotation
    const clickedAnnotation = documentState.annotations.find(
      (annotation) =>
        annotation.pageNumber === pageNumber &&
        isPointInAnnotation(point, annotation)
    );

    if (clickedAnnotation) {
      // If clicking on an unselected annotation, select it
      if (!selectedAnnotations.some((a) => a.id === clickedAnnotation.id)) {
        store.selectAnnotation(clickedAnnotation, e.shiftKey);
      }

      // Show context menu
      setContextMenu({
        position: { x: e.clientX, y: e.clientY },
      });
    } else {
      // Clear selection if clicking outside annotations
      store.clearSelection();
      setContextMenu(null);
    }
  };

  const render = () => {
    const canvas = canvasRef.current;
    if (!canvas || !width || !height) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    // Draw existing annotations
    documentState.annotations
      .filter((a) => a.pageNumber === pageNumber)
      .forEach((annotation) => {
        const isSelected = selectedAnnotations.some(
          (a) => a.id === annotation.id
        );
        drawAnnotation(ctx, annotation, scale);
        if (isSelected) {
          drawSelectionOutline(
            ctx,
            annotation,
            scale,
            selectedAnnotations.length > 1
          );
        }
      });

    // Draw preview while drawing
    if (isDrawing && currentPoints.length > 0) {
      ctx.save();
      ctx.strokeStyle = currentStyle.color;
      ctx.lineWidth = currentStyle.lineWidth * scale;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = currentStyle.opacity;

      const previewAnnotation: Annotation = {
        id: "preview",
        type: currentTool,
        points: currentPoints,
        style: currentStyle,
        pageNumber,
        timestamp: Date.now(),
        userId: "current-user",
      };

      drawAnnotation(ctx, previewAnnotation, scale);
      ctx.restore();
    }

    // Draw selection box
    if (selectionBox) {
      ctx.save();
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(
        selectionBox.start.x * scale,
        selectionBox.start.y * scale,
        (selectionBox.end.x - selectionBox.start.x) * scale,
        (selectionBox.end.y - selectionBox.start.y) * scale
      );
      ctx.restore();
    }
  };

  // Re-render when scale changes
  useEffect(() => {
    render();
  }, [
    scale,
    width,
    height,
    documentState.annotations,
    currentPoints,
    selectedAnnotations,
  ]);

  // Update the useEffect for selection state sync
  useEffect(() => {
    setSelectedAnnotations(store.selectedAnnotations);
  }, [store.selectedAnnotations]);

  // Add useEffect to sync local selection with store
  useEffect(() => {
    if (selectedAnnotations.length > 0) {
      store.selectAnnotations(selectedAnnotations);
    }
  }, [selectedAnnotations, store.selectAnnotations]);

  // Reset selection when changing tools
  useEffect(() => {
    if (currentTool !== "select") {
      setSelectedAnnotations([]);
    }
  }, [currentTool]);

  // Add paste event handler
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (onPaste) {
        e.preventDefault();
        onPaste(pageNumber);
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [pageNumber, onPaste]);

  const handleKeyDown = (e: KeyboardEvent) => {
    // Skip if we're editing text
    if (isEditingText) return;

    // Handle delete key (Delete or Backspace)
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      if (selectedAnnotations.length > 0) {
        // Delete all selected annotations
        selectedAnnotations.forEach((annotation) => {
          store.deleteAnnotation(documentId, annotation.id);
        });
        // Clear selection after delete
        setSelectedAnnotations([]);
        store.clearSelection();
      }
    }
  };

  // Add useEffect to handle keyboard events
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedAnnotations, documentId, isEditingText]);

  return (
    <>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="absolute inset-0 z-10"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        style={{
          cursor: getCursor(
            currentTool,
            isResizing,
            activeHandle,
            !!moveOffset
          ),
          width: `${width}px`,
          height: `${height}px`,
        }}
      />
      {isEditingText && textInputPosition && (
        <TextInput
          position={textInputPosition}
          onComplete={handleTextComplete}
          onCancel={handleTextCancel}
          scale={scale}
          isSticky={
            editingAnnotation
              ? editingAnnotation.type === "stickyNote"
              : currentTool === "stickyNote"
          }
          initialText={editingAnnotation?.style.text}
        />
      )}
      {contextMenu && (
        <ContextMenu
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
};

// Helper function to determine cursor style
const getCursor = (
  tool: string,
  isResizing: boolean,
  activeHandle: ResizeHandle | null,
  isMoving: boolean
): string => {
  if (isMoving) return "move";
  if (isResizing && activeHandle) {
    return getResizeCursor(activeHandle);
  }

  switch (tool) {
    case "select":
      return "default";
    case "freehand":
      return "crosshair";
    default:
      return "crosshair";
  }
};
