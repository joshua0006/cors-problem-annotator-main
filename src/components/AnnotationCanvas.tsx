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

// Add this interface for handling freehand drawing
interface FreehandDrawingState {
  isActive: boolean;
  points: Point[];
  lastPoint: Point | null;
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
  const [freehandState, setFreehandState] = useState<FreehandDrawingState>({
    isActive: false,
    points: [],
    lastPoint: null,
  });

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

  const isPointInAnnotation = (point: Point, annotation: Annotation): boolean => {
    if (!annotation.points.length) return false;

    if (annotation.type === "stamp") {
      return isPointInStamp(point, annotation);
    } else if (annotation.type === "highlight") {
      return isPointInHighlight(point, annotation);
    } else if (annotation.type === "circle") {
      // Special handling for circles
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
      
      // Calculate distance from point to center
      const distance = Math.sqrt(
        Math.pow(point.x - centerX, 2) + Math.pow(point.y - centerY, 2)
      );
      
      // Add a small padding for easier selection
      const padding = 5 / scale;
      return distance <= radius + padding;
    }

    // Get bounds based on shape type
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

  // Add handleFreehandDrawing function
  const handleFreehandDrawing = (event: React.MouseEvent, eventType: 'down' | 'move' | 'up' | 'leave') => {
    if (currentTool !== "freehand") return;
    
    const point = getCanvasPoint(event);
    
    switch (eventType) {
      case 'down':
        // Start drawing
        setFreehandState({
          isActive: true,
          points: [point],
          lastPoint: point
        });
        break;
        
      case 'move':
        // Continue drawing if active
        if (freehandState.isActive && freehandState.lastPoint) {
          // Add new point to the path
          setFreehandState(prev => ({
            ...prev,
            points: [...prev.points, point],
            lastPoint: point
          }));
          
          // Render the updated path
          renderFreehandPath();
        }
        break;
        
      case 'up':
      case 'leave':
        // Complete drawing
        if (freehandState.isActive && freehandState.points.length >= 2) {
          // Create and save the freehand annotation
          const newAnnotation: Annotation = {
            id: Date.now().toString(),
            type: "freehand",
            points: freehandState.points,
            style: currentStyle,
            pageNumber,
            timestamp: Date.now(),
            userId: "current-user",
          };
          
          store.addAnnotation(documentId, newAnnotation);
          
          // Reset freehand state
          setFreehandState({
            isActive: false,
            points: [],
            lastPoint: null
          });
        }
        break;
    }
  };
  
  // Add function to render freehand path while drawing
  const renderFreehandPath = () => {
    const canvas = canvasRef.current;
    if (!canvas || !freehandState.isActive || freehandState.points.length < 2) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    render(); // First render existing content
    
    // Draw the current freehand path
    ctx.save();
    ctx.strokeStyle = currentStyle.color;
    ctx.lineWidth = currentStyle.lineWidth * scale;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = currentStyle.opacity;
    
    ctx.beginPath();
    ctx.moveTo(freehandState.points[0].x * scale, freehandState.points[0].y * scale);
    
    for (let i = 1; i < freehandState.points.length; i++) {
      ctx.lineTo(freehandState.points[i].x * scale, freehandState.points[i].y * scale);
    }
    
    ctx.stroke();
    ctx.restore();
  };

  // Add dedicated function for handling text annotations
  const createTextTool = (point: Point) => {
    // Convert point to scaled coordinates for text input
    const scaledPoint = {
      x: point.x,
      y: point.y,
    };
    
    // Set text input position and enable editing
    setTextInputPosition(scaledPoint);
    setIsEditingText(true);
    setEditingAnnotation(null); // Ensure we're creating, not editing
    setIsDrawing(false); // Ensure drawing mode is off
  };

  // Add dedicated function for handling sticky note annotations
  const createStickyNoteTool = (point: Point) => {
    // Convert point to scaled coordinates for sticky note input
    const scaledPoint = {
      x: point.x,
      y: point.y,
    };
    
    // Set text input position and enable editing with sticky note flag
    setTextInputPosition(scaledPoint);
    setIsEditingText(true);
    setEditingAnnotation(null); // Ensure we're creating, not editing
    setIsDrawing(false); // Ensure drawing mode is off
  };

  // Add dedicated function for text and sticky note editing
  const handleTextEdit = (annotation: Annotation) => {
    if (annotation.type !== "text" && annotation.type !== "stickyNote") return;
    
    setEditingAnnotation(annotation);
    setTextInputPosition(annotation.points[0]);
    setIsEditingText(true);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    
    // Handle freehand tool separately
    if (currentTool === "freehand") {
      handleFreehandDrawing(e, 'down');
      return;
    }
    
    const point = getCanvasPoint(e);

    if (currentTool === "select") {
      // Start potential selection box
      if (!(e.shiftKey || e.ctrlKey || e.metaKey) && 
          !documentState.annotations.some(a => 
            a.pageNumber === pageNumber && isPointInAnnotation(point, a))) {
        setSelectionBox({ start: point, end: point });
        return;
      }
      
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
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          // Add to selection if modifier key is held
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
          // Replace selection if modifier key is not held
          setSelectedAnnotations([clickedAnnotation]);
        }
      } else if (!(e.shiftKey || e.ctrlKey || e.metaKey)) {
        // Clear selection if clicking empty space without modifier key
        setSelectedAnnotations([]);
      }
    } else if (currentTool === "text") {
      // Use dedicated text tool function
      createTextTool(point);
    } else if (currentTool === "stickyNote") {
      // Use dedicated sticky note tool function
      createStickyNoteTool(point);
    } else if (currentTool === "stampApproved" || currentTool === "stampRejected" || currentTool === "stampRevision") {
      // Create stamp annotation
      const stampType = getStampTypeFromTool(currentTool);
      
      // Create a stamp annotation
      const annotation = {
        id: Date.now().toString(),
        type: "stamp" as AnnotationType,
        points: [point],
        style: {
          ...currentStyle,
          stampType,
        },
        pageNumber,
        timestamp: Date.now(),
        userId: "current-user",
        version: 1,
      };
      
      // Add the annotation to the store
      store.addAnnotation(documentId, annotation);
      
      // Force a render to show the stamp immediately
      render();
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

    // Handle freehand tool separately
    if (currentTool === "freehand" && freehandState.isActive) {
      handleFreehandDrawing(e, 'move');
      return;
    }
    
    if (selectionBox) {
      // Update selection box end point
      setSelectionBox((prev) => (prev ? { ...prev, end: point } : null));

      // Find annotations within selection box
      const selectedAnnotationsInBox = documentState.annotations.filter((annotation) => {
        if (annotation.pageNumber !== pageNumber) return false;
        return isAnnotationInSelectionBox(
          annotation,
          selectionBox.start,
          point
        );
      });

      // If modifier key is held, add to existing selection
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        const existingIds = new Set(selectedAnnotations.map(a => a.id));
        const newAnnotations = selectedAnnotationsInBox.filter(a => !existingIds.has(a.id));
        
        if (newAnnotations.length > 0) {
          setSelectedAnnotations([...selectedAnnotations, ...newAnnotations]);
        }
      } else {
        // Replace selection if not holding modifier key
        setSelectedAnnotations(selectedAnnotationsInBox);
      }
      
      // Force render to display selection box
      render();
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
          e.shiftKey,
          10, // minSize
          annotation // Pass the annotation for type-specific handling
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

    // Handle freehand tool separately
    if (currentTool === "freehand" && freehandState.isActive) {
      handleFreehandDrawing(e, 'up');
      return;
    }
    
    const point = getCanvasPoint(e);
    
    // Handle selection box completion
    if (selectionBox) {
      // Only clear the selection box if it's very small (likely a click vs. drag)
      const dx = Math.abs(selectionBox.end.x - selectionBox.start.x);
      const dy = Math.abs(selectionBox.end.y - selectionBox.start.y);
      
      // Keep the selection result but clear the visual selection box
      setSelectionBox(null);
      
      // If the selection box was very small, treat as a click (which is handled in mouseDown)
      if (dx < 3 / scale && dy < 3 / scale) {
        // Don't clear selection if modifier key is held
        if (!(e.shiftKey || e.ctrlKey || e.metaKey)) {
          setSelectedAnnotations([]);
        }
      }
      
      render();
      return;
    }

    if (isDrawing && currentPoints.length === 2) {
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

  const handleMouseLeave = (e: React.MouseEvent) => {
    // Handle freehand tool separately
    if (currentTool === "freehand" && freehandState.isActive) {
      handleFreehandDrawing(e, 'leave');
      return;
    }
    
    if (isDrawing && currentTool === "freehand" && currentPoints.length >= 2) {
      // This old freehand logic can be removed since we now have a dedicated handler
      // But I'll keep it for backward compatibility
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
    
    // Also clean up freehand state if active
    if (freehandState.isActive) {
      setFreehandState({
        isActive: false,
        points: [],
        lastPoint: null
      });
    }
  };

  const handleTextComplete = (text: string) => {
    if (!text.trim()) {
      handleTextCancel();
      return;
    }

    let updatedOrNewAnnotation: Annotation | null = null;

    if (editingAnnotation) {
      // Update existing annotation
      updatedOrNewAnnotation = {
        ...editingAnnotation,
        style: { ...editingAnnotation.style, text },
      };
      store.updateAnnotation(documentId, updatedOrNewAnnotation);
    } else if (textInputPosition) {
      // Determine the annotation type based on the current tool
      const annotationType = currentTool === "stickyNote" ? "stickyNote" : "text";
      
      // Create new annotation
      updatedOrNewAnnotation = {
        id: Date.now().toString(),
        type: annotationType,
        points: [textInputPosition], // Use unscaled position
        style: {
          ...currentStyle,
          text,
          // For sticky notes, set a yellow background color
          color: annotationType === "stickyNote" ? "#FFEB3B" : currentStyle.color,
        },
        pageNumber,
        timestamp: Date.now(),
        userId: "current-user",
      };
      
      // Add the annotation to the store
      store.addAnnotation(documentId, updatedOrNewAnnotation);
      
      // Switch to select tool after creating text/sticky note
      store.setCurrentTool("select");
    }

    // Select the newly created or updated annotation
    if (updatedOrNewAnnotation) {
      setSelectedAnnotations([updatedOrNewAnnotation]);
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

  // Improved isAnnotationInSelectionBox function with better handling for different annotation types
  const isAnnotationInSelectionBox = (
    annotation: Annotation,
    start: Point,
    end: Point
  ): boolean => {
    // Get the selection box bounds
    const selectionBounds = {
      left: Math.min(start.x, end.x),
      right: Math.max(start.x, end.x),
      top: Math.min(start.y, end.y),
      bottom: Math.max(start.y, end.y),
    };

    // If selection box has no area, no selection
    if (selectionBounds.left === selectionBounds.right || 
        selectionBounds.top === selectionBounds.bottom) {
      return false;
    }

    // Get annotation bounds
    const bounds = getShapeBounds(annotation.points);
    
    // For small objects like points or text, use center-based selection
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
    
    // For circle annotations, check center and radius
    if (annotation.type === "circle") {
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
      
      // Create a bounding box for the circle
      const circleBounds = {
        left: centerX - radius,
        right: centerX + radius,
        top: centerY - radius,
        bottom: centerY + radius,
      };
      
      // Check if the circle intersects with the selection box
      return !(
        circleBounds.right < selectionBounds.left ||
        circleBounds.left > selectionBounds.right ||
        circleBounds.bottom < selectionBounds.top ||
        circleBounds.top > selectionBounds.bottom
      );
    }

    // For freehand, check if any point is inside selection box
    if (annotation.type === "freehand") {
      return annotation.points.some(
        (point) =>
          point.x >= selectionBounds.left &&
          point.x <= selectionBounds.right &&
          point.y >= selectionBounds.top &&
          point.y <= selectionBounds.bottom
      );
    }

    // For regular shapes like rectangles, check for intersection with selection box
    return !(
      bounds.right < selectionBounds.left ||
      bounds.left > selectionBounds.right ||
      bounds.bottom < selectionBounds.top ||
      bounds.top > selectionBounds.bottom
    );
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

    // Draw preview while drawing (for non-freehand tools)
    if (isDrawing && currentPoints.length > 0 && currentTool !== "freehand") {
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
    
    // For freehand, we handle the preview in renderFreehandPath function

    // Draw selection box with improved styling
    if (selectionBox) {
      ctx.save();
      
      // Calculate box dimensions
      const width = (selectionBox.end.x - selectionBox.start.x) * scale;
      const height = (selectionBox.end.y - selectionBox.start.y) * scale;
      
      // Draw semi-transparent blue fill
      ctx.fillStyle = "rgba(37, 99, 235, 0.1)";
      ctx.fillRect(
        selectionBox.start.x * scale,
        selectionBox.start.y * scale,
        width,
        height
      );
      
      // Draw dashed border
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(
        selectionBox.start.x * scale,
        selectionBox.start.y * scale,
        width,
        height
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
    
    // Handle Escape to clear selection
    if (e.key === "Escape") {
      setSelectedAnnotations([]);
      store.clearSelection();
    }
    
    // Handle Ctrl+A / Cmd+A to select all annotations on the current page
    if ((e.ctrlKey || e.metaKey) && e.key === "a") {
      e.preventDefault();
      const pageAnnotations = documentState.annotations.filter(
        a => a.pageNumber === pageNumber
      );
      setSelectedAnnotations(pageAnnotations);
    }
  };

  // Add useEffect to handle keyboard events
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedAnnotations, documentId, isEditingText]);

  // Add useEffect to clean up freehand state when changing tools
  useEffect(() => {
    if (currentTool !== "freehand" && freehandState.isActive) {
      setFreehandState({
        isActive: false,
        points: [],
        lastPoint: null
      });
    }
  }, [currentTool]);

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
      handleTextEdit(clickedAnnotation);
    }
  };

  // Add a mapping function from tool names to stamp types
  const getStampTypeFromTool = (tool: string): "approved" | "rejected" | "revision" | undefined => {
    switch (tool) {
      case "stampApproved":
        return "approved";
      case "stampRejected":
        return "rejected";
      case "stampRevision":
        return "revision";
      default:
        return undefined;
    }
  };

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
