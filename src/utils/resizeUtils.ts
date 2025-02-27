import { Point, Annotation } from "../types/annotation";

export type ResizeHandle =
  | "top"
  | "right"
  | "bottom"
  | "left"
  | "topLeft"
  | "topRight"
  | "bottomLeft"
  | "bottomRight"
  | null;

interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

// Get bounds from points
export const getBounds = (points: Point[]): Bounds => {
  return points.reduce(
    (bounds, point) => ({
      left: Math.min(bounds.left, point.x),
      right: Math.max(bounds.right, point.x),
      top: Math.min(bounds.top, point.y),
      bottom: Math.max(bounds.bottom, point.y),
    }),
    {
      left: points[0].x,
      right: points[0].x,
      top: points[0].y,
      bottom: points[0].y,
    }
  );
};

// Get cursor style for resize handle
export const getResizeCursor = (handle: ResizeHandle): string => {
  switch (handle) {
    case "topLeft":
    case "bottomRight":
      return "nwse-resize";
    case "topRight":
    case "bottomLeft":
      return "nesw-resize";
    case "top":
    case "bottom":
      return "ns-resize";
    case "left":
    case "right":
      return "ew-resize";
    default:
      return "default";
  }
};

// Check if point is near resize handle
export const getResizeHandle = (
  point: Point,
  annotation: Annotation,
  scale: number
): ResizeHandle => {
  const bounds = getBounds(annotation.points);
  const handleSize = 8 / scale;

  const handles = {
    topLeft: { x: bounds.left, y: bounds.top },
    topRight: { x: bounds.right, y: bounds.top },
    bottomLeft: { x: bounds.left, y: bounds.bottom },
    bottomRight: { x: bounds.right, y: bounds.bottom },
    top: { x: (bounds.left + bounds.right) / 2, y: bounds.top },
    bottom: { x: (bounds.left + bounds.right) / 2, y: bounds.bottom },
    left: { x: bounds.left, y: (bounds.top + bounds.bottom) / 2 },
    right: { x: bounds.right, y: (bounds.top + bounds.bottom) / 2 },
  };

  // Check each handle
  for (const [handleType, handlePoint] of Object.entries(handles)) {
    if (isWithinResizeHandle(point, handlePoint, scale)) {
      return handleType as ResizeHandle;
    }
  }

  return null;
};

// Check if resize operation is valid
export const isValidResize = (
  annotation: Annotation,
  handle: ResizeHandle
): boolean => {
  // Don't allow resizing for certain annotation types
  const nonResizableTypes = ["stamp", "freehand"];
  return !nonResizableTypes.includes(annotation.type);
};

// Specialized function for resizing circles
export const getResizedCirclePoints = (
  originalPoints: Point[],
  handle: ResizeHandle,
  currentPoint: Point,
  isDiameterMode: boolean = false,
  minSize: number = 10
): Point[] => {
  if (originalPoints.length < 2) return originalPoints;
  
  const [p1, p2] = originalPoints;
  
  // Make a deep copy to avoid modifying the original points
  const newPoints: Point[] = [
    { x: p1.x, y: p1.y },
    { x: p2.x, y: p2.y }
  ];
  
  if (isDiameterMode) {
    // In diameter mode, both points define the diameter
    // We need to calculate the center and then resize accordingly
    const centerX = (p1.x + p2.x) / 2;
    const centerY = (p1.y + p2.y) / 2;
    
    // Calculate new radius based on the handle being dragged
    let dx = 0;
    let dy = 0;
    
    switch (handle) {
      case "topLeft":
      case "top":
      case "left":
        // These handles should move the point opposite to the center
        dx = currentPoint.x - centerX;
        dy = currentPoint.y - centerY;
        newPoints[0] = { 
          x: centerX + dx, 
          y: centerY + dy 
        };
        newPoints[1] = { 
          x: centerX - dx, 
          y: centerY - dy 
        };
        break;
        
      case "topRight":
      case "right":
        dx = currentPoint.x - centerX;
        dy = currentPoint.y - centerY;
        newPoints[0] = { 
          x: centerX - dx, 
          y: centerY + dy 
        };
        newPoints[1] = { 
          x: centerX + dx, 
          y: centerY - dy 
        };
        break;
        
      case "bottomLeft":
      case "bottom":
        dx = currentPoint.x - centerX;
        dy = currentPoint.y - centerY;
        newPoints[0] = { 
          x: centerX + dx, 
          y: centerY - dy 
        };
        newPoints[1] = { 
          x: centerX - dx, 
          y: centerY + dy 
        };
        break;
        
      case "bottomRight":
        dx = currentPoint.x - centerX;
        dy = currentPoint.y - centerY;
        newPoints[0] = { 
          x: centerX - dx, 
          y: centerY - dy 
        };
        newPoints[1] = { 
          x: centerX + dx, 
          y: centerY + dy 
        };
        break;
        
      default:
        return originalPoints;
    }
  } else {
    // In center-radius mode, p1 is the center, p2 is a point on the circumference
    // We keep the center fixed and only move the point on the circumference
    
    // When dragging handles, calculate new position of point on circumference
    const centerX = p1.x;
    const centerY = p1.y;
    
    // Calculate distance from center to current point
    const dx = currentPoint.x - centerX;
    const dy = currentPoint.y - centerY;
    
    // Calculate the normalized distance (direction vector)
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Ensure minimum circle size
    if (distance < minSize / 2) {
      return originalPoints;
    }
    
    // Update the circumference point (p2) based on drag direction
    newPoints[1] = { 
      x: centerX + dx, 
      y: centerY + dy 
    };
  }
  
  // Calculate the new radius to ensure it meets minimum size
  const newRadius = Math.sqrt(
    Math.pow(newPoints[1].x - newPoints[0].x, 2) + 
    Math.pow(newPoints[1].y - newPoints[0].y, 2)
  );
  
  if (isDiameterMode && newRadius < minSize / 2) {
    return originalPoints;
  }
  
  return newPoints;
};

// Calculate new points during resize
export const getResizedPoints = (
  originalPoints: Point[],
  handle: ResizeHandle,
  currentPoint: Point,
  keepAspectRatio: boolean = false,
  minSize: number = 10,
  annotation?: Annotation
): Point[] => {
  // Handle circle resizing separately if this is a circle annotation
  if (annotation && annotation.type === "circle") {
    const isDiameterMode = annotation.style.circleDiameterMode as boolean || false;
    return getResizedCirclePoints(originalPoints, handle, currentPoint, isDiameterMode, minSize);
  }

  const bounds = getBounds(originalPoints);
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  const aspectRatio = width / height;

  const newBounds = { ...bounds };

  switch (handle) {
    case "topLeft":
      if (keepAspectRatio) {
        const dx = bounds.right - currentPoint.x;
        const dy = bounds.bottom - currentPoint.y;
        const distance = Math.max(dx, dy);
        newBounds.left = bounds.right - distance;
        newBounds.top = bounds.bottom - distance / aspectRatio;
      } else {
        newBounds.left = currentPoint.x;
        newBounds.top = currentPoint.y;
      }
      break;

    case "topRight":
      if (keepAspectRatio) {
        const dx = currentPoint.x - bounds.left;
        const dy = bounds.bottom - currentPoint.y;
        const distance = Math.max(dx, dy);
        newBounds.right = bounds.left + distance;
        newBounds.top = bounds.bottom - distance / aspectRatio;
      } else {
        newBounds.right = currentPoint.x;
        newBounds.top = currentPoint.y;
      }
      break;

    case "bottomLeft":
      if (keepAspectRatio) {
        const dx = bounds.right - currentPoint.x;
        const dy = currentPoint.y - bounds.top;
        const distance = Math.max(dx, dy);
        newBounds.left = bounds.right - distance;
        newBounds.bottom = bounds.top + distance / aspectRatio;
      } else {
        newBounds.left = currentPoint.x;
        newBounds.bottom = currentPoint.y;
      }
      break;

    case "bottomRight":
      if (keepAspectRatio) {
        const dx = currentPoint.x - bounds.left;
        const dy = currentPoint.y - bounds.top;
        const distance = Math.max(dx, dy);
        newBounds.right = bounds.left + distance;
        newBounds.bottom = bounds.top + distance / aspectRatio;
      } else {
        newBounds.right = currentPoint.x;
        newBounds.bottom = currentPoint.y;
      }
      break;

    case "top":
      newBounds.top = currentPoint.y;
      break;

    case "right":
      newBounds.right = currentPoint.x;
      break;

    case "bottom":
      newBounds.bottom = currentPoint.y;
      break;

    case "left":
      newBounds.left = currentPoint.x;
      break;

    default:
      return originalPoints;
  }

  // Validate minimum size
  const newWidth = newBounds.right - newBounds.left;
  const newHeight = newBounds.bottom - newBounds.top;

  if (newWidth < minSize || newHeight < minSize) {
    return originalPoints;
  }

  // Return new points maintaining the original order
  const isFlippedX = originalPoints[0].x > originalPoints[1].x;
  const isFlippedY = originalPoints[0].y > originalPoints[1].y;

  return [
    {
      x: isFlippedX ? newBounds.right : newBounds.left,
      y: isFlippedY ? newBounds.bottom : newBounds.top,
    },
    {
      x: isFlippedX ? newBounds.left : newBounds.right,
      y: isFlippedY ? newBounds.top : newBounds.bottom,
    },
  ];
};

// Add helper function to check if point is within resize handle
export const isWithinResizeHandle = (
  point: Point,
  handle: Point,
  scale: number,
  threshold: number = 8
): boolean => {
  const scaledThreshold = threshold / scale;
  return (
    Math.abs(point.x - handle.x) <= scaledThreshold &&
    Math.abs(point.y - handle.y) <= scaledThreshold
  );
};
