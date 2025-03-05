import React, { useRef, useEffect, useState, useCallback } from "react";
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
  isPointInsideCircle,
} from "../utils/drawingUtils";
import { Point, Annotation, AnnotationType } from "../types/annotation";
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
  const [isEditingText, setIsEditingText] = useState<boolean>(false);
  const [textInputPosition, setTextInputPosition] = useState<Point | null>(null);
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null);
  const [stickyNoteScale, setStickyNoteScale] = useState<number>(1);
  const [selectionBox, setSelectionBox] = useState<{ start: Point; end: Point } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    position: { x: number; y: number };
  } | null>(null);
  const [isCircleCenterMode, setIsCircleCenterMode] = useState<boolean>(false);
  const [moveOffset, setMoveOffset] = useState<Point | null>(null);
  const [isShiftPressed, setIsShiftPressed] = useState(false);

  const store = useAnnotationStore();
  const { currentTool, currentStyle, currentDrawMode } = store;
  const documentState = store.documents[documentId] || initialDocumentState();

  const dispatchAnnotationChangeEvent = useCallback(
    (source: string, forceRender: boolean = false) => {
      // Create a custom event with the annotation change details
      const event = new CustomEvent("annotationChanged", {
        detail: {
          pageNumber,
          source,
          forceRender,
          timestamp: Date.now(),
        },
      });

      // Dispatch the event to both the canvas element and the PDF container
      // This ensures that all components that need to know about the annotation change will be notified
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.dispatchEvent(event);
        console.log(`[AnnotationCanvas] Dispatched annotation event to canvas: page ${pageNumber}`);
      }

      // Also try to dispatch to the PDF container for broader notification
      try {
        const pdfContainer = document.querySelector(".pdf-container, .pdf-container-fixed");
        if (pdfContainer) {
          pdfContainer.dispatchEvent(event);
          console.log(`[AnnotationCanvas] Dispatched annotation event to container: page ${pageNumber}`);
        } else {
          console.warn("[AnnotationCanvas] Could not find PDF container to dispatch event");
        }
      } catch (err) {
        console.error("[AnnotationCanvas] Error dispatching event:", err);
      }
    },
    [pageNumber]
  );

  const drawFreehand = (ctx: CanvasRenderingContext2D, points: Point[], scale: number) => {
    if (!points || points.length < 2) return;
    
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    
    // Start the path at the first point
    ctx.beginPath();
    ctx.moveTo(points[0].x * scale, points[0].y * scale);
    
    // Draw lines to all subsequent points
    points.slice(1).forEach(point => {
      ctx.lineTo(point.x * scale, point.y * scale);
    });
    
    // Stroke the path
    ctx.stroke();
    ctx.restore();
  };

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

  const isPointInAnnotation = (point: Point, annotation: Annotation): boolean => {
    if (!annotation.points.length) return false;

    if (annotation.type === "stamp" || annotation.type === "stampApproved" || 
        annotation.type === "stampRejected" || annotation.type === "stampRevision") {
      return isPointInStamp(point, annotation);
    } else if (annotation.type === "highlight") {
      return isPointInHighlight(point, annotation);
    } else if (annotation.type === "circle") {
      return isPointInsideCircle(point, annotation, scale);
    }

    const bounds = getShapeBounds(annotation.points);

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
      // Check if we're clicking on a selected annotation
      const clickedAnnotation = selectedAnnotations.find(
        (annotation) => isPointInAnnotation(point, annotation)
      );
      
      if (clickedAnnotation) {
        // For circles, we need to check for resize handles first before allowing move
        if (clickedAnnotation.type === "circle") {
          // Check if clicking on a resize handle
          const handle = getResizeHandleForCircle(point, clickedAnnotation);
          
          if (handle) {
            // Start resizing operation
            setIsResizing(true);
            setActiveHandle(handle);
            return;
          }
          
          // If not on a handle, then allow moving
          setMoveOffset(point);
          return;
        }
        
        // For other shapes, check for resize handles first
        const handle = getResizeHandle(point, clickedAnnotation);
        
        if (handle) {
          // Start resizing operation
          setIsResizing(true);
          setActiveHandle(handle);
        } else {
          // Start moving operation
          setMoveOffset(point);
        }
        return;
      }
      
      // If not clicking on a selected annotation, check if clicking on any annotation
      const clickedOnAny = documentState.annotations.find(
        (annotation) =>
          annotation.pageNumber === pageNumber &&
          isPointInAnnotation(point, annotation)
      );
      
      if (clickedOnAny) {
        // Select this annotation and prepare to move it
        store.selectAnnotations([clickedOnAny]);
        setMoveOffset(point);
        return;
      }
      
      // If not clicking on any annotation, start a selection box
      setSelectionBox({ start: point, end: point });
      return;
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

      if (currentTool === "freehand") {
        // For freehand, we start with just the initial point
        // More points will be added during mouse move
        setCurrentPoints([point]);
      } else {
        // For other shapes, initialize with start and end at the same point
        // End point will be updated during mouse move
        setCurrentPoints([
          { x: point.x, y: point.y },
          { x: point.x, y: point.y },
        ]);
      }
    }
  };

  const handleFreehandDraw = (point: Point) => {
    if (!isDrawing || currentTool !== "freehand") return;
    
    // For freehand drawing, we need to collect all points as the user moves the cursor
    // This provides a continuous path rather than just start and end points
    setCurrentPoints((prev) => [...prev, point]);
    
    // Force a render to show the drawing in real-time
    render();
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
      // Handle circle center mode
      if (isCircleCenterMode && moveOffset && selectedAnnotations.length === 1) {
        const annotation = selectedAnnotations[0];
        if (annotation.type === "circle") {
          const dx = point.x - moveOffset.x;
          const dy = point.y - moveOffset.y;
          
          // Create new points by moving both points by the same offset
          const newPoints = annotation.points.map(p => ({
            x: p.x + dx,
            y: p.y + dy
          }));
          
          // Update the annotation
          const updatedAnnotation = {
            ...annotation,
            points: newPoints
          };
          
          store.updateAnnotation(documentId, updatedAnnotation);
          setSelectedAnnotations([updatedAnnotation]);
          setMoveOffset(point);
          return;
        }
      }
      
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
          e.shiftKey,
          10,
          annotation
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

      // Update cursor for selected circles
      if (selectedAnnotations.length === 1 && selectedAnnotations[0].type === "circle") {
        const circleAnnotation = selectedAnnotations[0];
        const handle = getResizeHandleForCircle(point, circleAnnotation);
        
        if (handle) {
          // Show resize cursor based on the handle position
          canvas.style.cursor = getResizeCursor(handle);
          return;
        } else if (isPointInsideCircle(point, circleAnnotation)) {
          // Show move cursor when inside the circle but not on a handle
          canvas.style.cursor = "move";
          return;
        }
      }

      // For other annotations, use the existing code
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
      if (currentTool === "freehand") {
        // Use the dedicated freehand drawing handler
        handleFreehandDraw(point);
      } else {
        // For other tools, just update end point while keeping start point fixed
        setCurrentPoints((prev) => [prev[0], { x: point.x, y: point.y }]);
        render();
      }
    } else if (currentTool === "select" as AnnotationType) {
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

    // Reset circle center mode
    setIsCircleCenterMode(false);

    if (isDrawing) {
      if (currentTool === "freehand") {
        // Only create freehand annotation if we have enough points
        if (currentPoints.length >= 2) {
          const newAnnotation: Annotation = {
            id: Date.now().toString(),
            type: "freehand",
            points: currentPoints,
            style: currentStyle,
            pageNumber,
            timestamp: Date.now(),
            userId: "current-user",
          };

          store.addAnnotation(documentId, newAnnotation);
          
          // Dispatch the annotation change event to ensure it's rendered immediately
          dispatchAnnotationChangeEvent('userDrawing', true);
        }
      } else if (currentPoints.length === 2) {
        // For non-freehand tools with 2 points (like line, rectangle, etc.)
        const [start, end] = currentPoints;

        // Check if the shape has a minimum size
        const dx = Math.abs(end.x - start.x);
        const dy = Math.abs(end.y - start.y);

        // Only create annotation if the shape has a minimum size
        if (dx >= 5 || dy >= 5) {
          // For rectangle-like shapes, ensure we have four corner points
          let annotationPoints = currentPoints;
          
          // Special handling for highlight: create a polygon with 4 points
          if (currentTool === "highlight") {
            // Create a rectangle/polygon for highlights
            annotationPoints = [
              { x: start.x, y: start.y },
              { x: end.x, y: start.y },
              { x: end.x, y: end.y },
              { x: start.x, y: end.y }
            ];
          }
          
          const newAnnotation: Annotation = {
            id: Date.now().toString(),
            type: currentTool,
            points: annotationPoints,
            style: {
              ...currentStyle,
              // Ensure opacity is appropriate for highlights
              opacity: currentTool === "highlight" ? 0.3 : currentStyle.opacity,
              // Ensure line width is appropriate for highlights
              lineWidth: currentTool === "highlight" ? 12 : currentStyle.lineWidth
            },
            pageNumber,
            timestamp: Date.now(),
            userId: "current-user",
          };

          store.addAnnotation(documentId, newAnnotation);

          // Clear selection to prevent immediate resizing
          store.clearSelection();
          setSelectedAnnotations([]);
          
          // Dispatch the annotation change event
          dispatchAnnotationChangeEvent('userDrawing', true);
        }
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
      // For freehand drawings, we just use the raw points since there's no smoothPoints function
      const newAnnotation: Annotation = {
        id: Date.now().toString(),
        type: "freehand",
        points: currentPoints,
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
    const bounds = getShapeBounds(annotation.points);
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
    if (annotation.type === "stamp" || annotation.type === "stampApproved" || 
        annotation.type === "stampRejected" || annotation.type === "stampRevision") {
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

    // Draw all annotations for this page
    documentState.annotations
      .filter((a) => a.pageNumber === pageNumber)
      .forEach((annotation) => {
        drawAnnotation(ctx, annotation, scale);
      });

    // Draw selection outlines for selected annotations
    selectedAnnotations.forEach((annotation) => {
      drawSelectionOutline(
        ctx,
        annotation,
        scale,
        selectedAnnotations.length > 1
      );
    });

    // Draw current drawing in progress
    if (isDrawing && currentPoints.length > 0) {
      // Create a temporary annotation for drawing preview
      const drawingAnnotation: Annotation = {
        id: "temp",
        type: currentTool as AnnotationType,
        pageNumber,
        points: currentPoints,
        style: currentStyle,
        timestamp: Date.now(),
        userId: "current-user"
      };

      drawAnnotation(ctx, drawingAnnotation, scale);
    }

    // Draw selection box if active
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
    
    // Draw uniform scaling indicator when shift is pressed during resize
    if (isResizing && isShiftPressed && selectedAnnotations.length === 1) {
      const annotation = selectedAnnotations[0];
      if (annotation.type === "circle") {
        ctx.save();
        
        // Find the center of the circle
        const [p1, p2] = annotation.points;
        const diameterMode = annotation.style.circleDiameterMode as boolean || false;
        
        let centerX, centerY;
        
        if (diameterMode) {
          centerX = (p1.x + p2.x) / 2 * scale;
          centerY = (p1.y + p2.y) / 2 * scale;
        } else {
          centerX = p1.x * scale;
          centerY = p1.y * scale;
        }
        
        // Draw uniform scaling indicator
        ctx.fillStyle = 'rgba(37, 99, 235, 0.3)';
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 1;
        
        // Draw small "uniform scaling" badge
        const badgeText = "Uniform";
        const textMetrics = ctx.measureText(badgeText);
        const badgeWidth = textMetrics.width + 16;
        const badgeHeight = 24;
        
        ctx.beginPath();
        ctx.roundRect(
          centerX - badgeWidth / 2,
          centerY - badgeHeight / 2,
          badgeWidth,
          badgeHeight,
          4
        );
        ctx.fill();
        ctx.stroke();
        
        // Draw text
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, centerX, centerY);
        
        ctx.restore();
      }
    }
  };

  // Re-render when scale changes or page changes
  useEffect(() => {
    render();
  }, [
    scale,
    width,
    height,
    pageNumber,
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

  // Update the keyboard event handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Track shift key state for uniform scaling
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
      }
      
      // Existing key handler code...
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedAnnotations.length > 0) {
          // Delete all selected annotations one by one
          selectedAnnotations.forEach((annotation) => {
            store.deleteAnnotation(documentId, annotation.id);
          });
          setSelectedAnnotations([]);
        }
      }
      
      // ... rest of key handlers ...
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Reset shift key state
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.addEventListener("keyup", handleKeyUp);
    };
  }, [documentId, selectedAnnotations, store, currentTool]);

  // Add function to detect circle resize handles specifically
  const getResizeHandleForCircle = (point: Point, annotation: Annotation): ResizeHandle => {
    if (annotation.type !== "circle" || annotation.points.length < 2) return null;
    
    const [p1, p2] = annotation.points;
    const diameterMode = annotation.style.circleDiameterMode as boolean || false;
    
    let centerX, centerY, radius;
    
    if (diameterMode) {
      // In diameter mode, center is midpoint between two points
      centerX = (p1.x + p2.x) / 2;
      centerY = (p1.y + p2.y) / 2;
      radius = Math.sqrt(
        Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)
      ) / 2;
    } else {
      // In center-radius mode, first point is center
      centerX = p1.x;
      centerY = p1.y;
      radius = Math.sqrt(
        Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)
      );
    }
    
    // Check if point is near any of the 8 resize handles on the circle perimeter
    const handleSize = 8 / scale;
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const handleX = centerX + Math.cos(angle) * radius;
      const handleY = centerY + Math.sin(angle) * radius;
      
      if (
        Math.abs(point.x - handleX) <= handleSize &&
        Math.abs(point.y - handleY) <= handleSize
      ) {
        // Map the angle to the appropriate resize handle type
        if (i === 0) return "right";
        if (i === 1) return "bottomRight";
        if (i === 2) return "bottom";
        if (i === 3) return "bottomLeft";
        if (i === 4) return "left";
        if (i === 5) return "topLeft";
        if (i === 6) return "top";
        if (i === 7) return "topRight";
      }
    }
    
    return null;
  };

  // Clear selected annotations when page changes
  useEffect(() => {
    // Clear any selected annotations when changing pages
    setSelectedAnnotations([]);
    setActiveHandle(null);
    setIsResizing(false);
    setMoveOffset(null);
    // Force a new render
    render();
  }, [pageNumber]);

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