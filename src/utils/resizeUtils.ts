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

// Calculate new points during resize
export const getResizedPoints = (
  originalPoints: Point[],
  handle: ResizeHandle,
  currentPoint: Point,
  keepAspectRatio: boolean = false,
  minSize: number = 10
): Point[] => {
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

// Check if resize operation is valid
export const isValidResize = (
  annotation: Annotation,
  handle: ResizeHandle
): boolean => {
  // Don't allow resizing for certain annotation types
  const nonResizableTypes = ["stamp", "highlight", "freehand"];
  return !nonResizableTypes.includes(annotation.type);
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
