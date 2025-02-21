import { Annotation, Point } from "../types/annotation";

// Helper function to validate points
export const isValidPoint = (point: Point | undefined): point is Point => {
  return (
    point !== undefined &&
    typeof point.x === "number" &&
    typeof point.y === "number" &&
    !isNaN(point.x) &&
    !isNaN(point.y)
  );
};

// Drawing functions
export const drawCircle = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number
) => {
  if (!points || points.length < 2) return;
  const [start, end] = points;

  if (!isValidPoint(start) || !isValidPoint(end)) return;

  const radius =
    Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)) / 2;

  const centerX = (start.x + end.x) / 2;
  const centerY = (start.y + end.y) / 2;

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
  ctx.stroke();
};

export const drawLine = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number
) => {
  if (!points || points.length < 2) return;
  const [start, end] = points;

  if (!isValidPoint(start) || !isValidPoint(end)) return;

  ctx.beginPath();
  ctx.moveTo(start.x * scale, start.y * scale);
  ctx.lineTo(end.x * scale, end.y * scale);
  ctx.stroke();
};

export const drawRectangle = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number
) => {
  if (!points || points.length < 2) return;
  const [start, end] = points;

  if (!isValidPoint(start) || !isValidPoint(end)) return;

  const width = end.x - start.x;
  const height = end.y - start.y;

  // Draw the rectangle
  ctx.beginPath();
  ctx.rect(start.x, start.y, width, height);
  ctx.stroke();
};

export const drawTriangle = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number
) => {
  if (!points || points.length < 2) return;
  const [start, end] = points;

  if (!isValidPoint(start) || !isValidPoint(end)) return;

  // Calculate center-based triangle
  const centerX = (start.x + end.x) / 2;
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);

  ctx.beginPath();
  // Top point
  ctx.moveTo(centerX, start.y);
  // Bottom left
  ctx.lineTo(centerX - width / 2, start.y + height);
  // Bottom right
  ctx.lineTo(centerX + width / 2, start.y + height);
  ctx.closePath();
  ctx.stroke();
};

export const drawStar = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number
) => {
  if (!points || points.length < 2) return;
  const [start, end] = points;

  if (!isValidPoint(start) || !isValidPoint(end)) return;

  const centerX = (start.x + end.x) / 2;
  const centerY = (start.y + end.y) / 2;
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  const outerRadius = Math.min(width, height) / 2;
  const innerRadius = outerRadius * 0.4;
  const spikes = 5;
  const angleOffset = -Math.PI / 2; // Start from top

  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (i * Math.PI) / spikes + angleOffset;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.stroke();
};

export const drawNoSymbol = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number
) => {
  if (!points || points.length < 2) return;
  const [start, end] = points;

  if (!isValidPoint(start) || !isValidPoint(end)) return;

  // Calculate circle parameters
  const width = Math.abs((end.x - start.x) * scale);
  const height = Math.abs((end.y - start.y) * scale);
  const centerX = start.x * scale + width / 2;
  const centerY = start.y * scale + height / 2;
  const radius = Math.min(width, height) / 2;

  // Draw the circle
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
  ctx.stroke();

  // Draw the diagonal line
  ctx.beginPath();
  const lineOffset = radius * Math.cos(Math.PI / 4);
  ctx.moveTo(centerX - lineOffset, centerY - lineOffset);
  ctx.lineTo(centerX + lineOffset, centerY + lineOffset);
  ctx.stroke();
};

// Add helper function for drawing arrow heads
export const drawArrowHead = (
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  scale: number,
  isReversed: boolean = false
) => {
  const headLength = 15 * scale;
  const angle = Math.atan2((to.y - from.y) * scale, (to.x - from.x) * scale);

  const x = isReversed ? from.x * scale : to.x * scale;
  const y = isReversed ? from.y * scale : to.y * scale;

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(
    x - headLength * Math.cos(angle - Math.PI / 6),
    y - headLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.moveTo(x, y);
  ctx.lineTo(
    x - headLength * Math.cos(angle + Math.PI / 6),
    y - headLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.stroke();
};

// Add arrow drawing function
export const drawArrow = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number,
  isDoubleArrow: boolean = false
) => {
  if (!points || points.length < 2) return;
  const [start, end] = points;

  ctx.save();
  ctx.lineWidth = 2 * scale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Draw the main line
  ctx.beginPath();
  ctx.moveTo(start.x * scale, start.y * scale);
  ctx.lineTo(end.x * scale, end.y * scale);
  ctx.stroke();

  // Calculate arrowhead parameters
  const angle = Math.atan2(
    end.y * scale - start.y * scale,
    end.x * scale - start.x * scale
  );
  const arrowLength = 10 * scale;
  const arrowWidth = 6 * scale;

  // Draw arrowhead at the end
  ctx.beginPath();
  ctx.moveTo(end.x * scale, end.y * scale);
  ctx.lineTo(
    end.x * scale - arrowLength * Math.cos(angle - Math.PI / 6),
    end.y * scale - arrowLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    end.x * scale - arrowLength * Math.cos(angle + Math.PI / 6),
    end.y * scale - arrowLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();

  // Draw arrowhead at the start if it's a double arrow
  if (isDoubleArrow) {
    ctx.beginPath();
    ctx.moveTo(start.x * scale, start.y * scale);
    ctx.lineTo(
      start.x * scale + arrowLength * Math.cos(angle - Math.PI / 6),
      start.y * scale + arrowLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      start.x * scale + arrowLength * Math.cos(angle + Math.PI / 6),
      start.y * scale + arrowLength * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
};

// Add tick (checkmark) drawing function
export const drawTick = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number
) => {
  if (!points || points.length < 2) return;
  const [start, end] = points;

  if (!isValidPoint(start) || !isValidPoint(end)) return;

  const width = Math.abs((end.x - start.x) * scale);
  const height = Math.abs((end.y - start.y) * scale);
  const size = Math.min(width, height);

  // Calculate points for the tick
  const x = start.x * scale;
  const y = start.y * scale + size / 2;

  ctx.beginPath();
  ctx.moveTo(x, y);
  // First line (short)
  ctx.lineTo(x + size * 0.3, y + size * 0.3);
  // Second line (long)
  ctx.lineTo(x + size, y - size * 0.5);
  ctx.stroke();
};

// Add cross (X) drawing function
export const drawCross = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number
) => {
  if (!points || points.length < 2) return;
  const [start, end] = points;

  if (!isValidPoint(start) || !isValidPoint(end)) return;

  const width = Math.abs((end.x - start.x) * scale);
  const height = Math.abs((end.y - start.y) * scale);
  const size = Math.min(width, height);

  const x = start.x * scale;
  const y = start.y * scale;

  // Draw first diagonal line (\)
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + size, y + size);
  ctx.stroke();

  // Draw second diagonal line (/)
  ctx.beginPath();
  ctx.moveTo(x + size, y);
  ctx.lineTo(x, y + size);
  ctx.stroke();
};

// Update text drawing function
export const drawText = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  style: AnnotationStyle,
  scale: number
) => {
  if (!points.length || !style.text) return;
  const [start] = points;

  // Save context state
  ctx.save();

  // Set text styles with proper scaling
  const fontSize = 14 * scale;
  ctx.font = `${fontSize}px Arial`;
  ctx.fillStyle = style.color;
  ctx.globalAlpha = style.opacity;
  ctx.textBaseline = "top";

  // Draw text at scaled position
  ctx.fillText(style.text, start.x * scale, start.y * scale);

  // Restore context state
  ctx.restore();
};

// Update sticky note drawing function
export const drawStickyNote = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  style: AnnotationStyle,
  scale: number
) => {
  if (!points.length || !style.text) return;
  const [start] = points;

  // Scale dimensions
  const padding = 8 * scale;
  const noteWidth = 200 * scale;
  const fontSize = 14 * scale;
  const lineHeight = 20 * scale;
  const lines = style.text.split("\n");
  const noteHeight = lines.length * lineHeight + padding * 2;

  // Calculate scaled position
  const x = start.x * scale;
  const y = start.y * scale;

  // Save context state
  ctx.save();

  // Draw note background
  ctx.fillStyle = "#FFEB3B";
  ctx.globalAlpha = 0.8;
  ctx.fillRect(x, y, noteWidth, noteHeight);

  // Draw note border
  ctx.strokeStyle = "#FBC02D";
  ctx.lineWidth = 1 * scale;
  ctx.strokeRect(x, y, noteWidth, noteHeight);

  // Draw text
  ctx.font = `${fontSize}px Arial`;
  ctx.fillStyle = "#000000";
  ctx.globalAlpha = style.opacity;
  ctx.textBaseline = "top";

  lines.forEach((line, index) => {
    ctx.fillText(line, x + padding, y + padding + index * lineHeight);
  });

  // Restore context state
  ctx.restore();
};

// Add helper function for text positioning
export const getTextPosition = (point: Point, scale: number) => {
  return {
    x: point.x * scale,
    y: point.y * scale,
  };
};

// Update the AnnotationStyle type in src/types/annotation.ts
export type AnnotationStyle = {
  color: string;
  lineWidth: number;
  opacity: number;
  circleDiameterMode?: boolean;
  stampType?: StampType;
  text?: string;
};

// Add highlight drawing function
export const drawHighlight = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  style: AnnotationStyle,
  scale: number
) => {
  if (!points || points.length < 2) return;

  // Save context state
  ctx.save();

  // Set highlight specific styles
  ctx.globalAlpha = 0.3; // More transparent for highlights
  ctx.fillStyle = style.color;
  ctx.strokeStyle = "transparent";

  // Draw highlight as a filled path
  ctx.beginPath();
  points.forEach((point, index) => {
    if (!isValidPoint(point)) return;

    if (index === 0) {
      ctx.moveTo(point.x * scale, point.y * scale);
    } else {
      ctx.lineTo(point.x * scale, point.y * scale);
    }
  });

  // Close the path if it's not closed
  if (points.length > 2) {
    ctx.closePath();
  }
  ctx.fill();

  // Restore context state
  ctx.restore();
};

// Add new function for smooth freehand drawing
export const drawSmoothFreehand = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number,
  style: AnnotationStyle
) => {
  if (!points || points.length < 2) return;

  ctx.save();
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.lineWidth * scale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = style.opacity;

  // Apply scaling to all points first
  const scaledPoints = points.map((p) => ({
    x: p.x * scale,
    y: p.y * scale,
  }));

  ctx.beginPath();
  ctx.moveTo(scaledPoints[0].x, scaledPoints[0].y);

  // Use cubic Bezier curves with tension for smooth drawing
  const tension = 0.5; // Adjust this value (0-1) for different smoothness
  let previousControlPoint: Point | null = null;

  for (let i = 0; i < scaledPoints.length - 1; i++) {
    const current = scaledPoints[i];
    const next = scaledPoints[i + 1];
    const nextNext = scaledPoints[i + 2] || next;

    // Calculate control points using cardinal spline logic
    const cp1 = {
      x: current.x + (next.x - (scaledPoints[i - 1]?.x || current.x)) * tension,
      y: current.y + (next.y - (scaledPoints[i - 1]?.y || current.y)) * tension,
    };

    const cp2 = {
      x: next.x - (nextNext.x - current.x) * tension,
      y: next.y - (nextNext.y - current.y) * tension,
    };

    // Smooth connection between segments
    if (previousControlPoint) {
      ctx.bezierCurveTo(
        previousControlPoint.x,
        previousControlPoint.y,
        cp1.x,
        cp1.y,
        current.x,
        current.y
      );
    }

    ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, next.x, next.y);

    previousControlPoint = cp2;
  }

  ctx.stroke();
  ctx.restore();
};

// Update drawAnnotation function
export const drawAnnotation = (
  ctx: CanvasRenderingContext2D,
  annotation: Annotation,
  scale: number
) => {
  ctx.save();
  ctx.strokeStyle = annotation.style.color;
  ctx.fillStyle = annotation.style.color;
  ctx.lineWidth = annotation.style.lineWidth * scale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = annotation.style.opacity;

  switch (annotation.type) {
    case "freehand":
      drawSmoothFreehand(ctx, annotation.points, scale, annotation.style);
      break;
    case "line":
      drawLine(ctx, annotation.points, scale);
      break;
    case "rectangle":
      drawRectangle(ctx, annotation.points, scale);
      break;
    case "circle":
      drawCircle(ctx, annotation.points, scale);
      break;
    case "arrow":
    case "doubleArrow":
      drawArrow(
        ctx,
        annotation.points,
        scale,
        annotation.type === "doubleArrow"
      );
      break;
    case "stamp":
      drawStamp(ctx, annotation.points, annotation.style, scale);
      break;
    case "triangle":
      drawTriangle(ctx, annotation.points, scale);
      break;
    case "star":
      drawStar(ctx, annotation.points, scale);
      break;
    case "noSymbol":
      drawNoSymbol(ctx, annotation.points, scale);
      break;
    case "tick":
      drawTick(ctx, annotation.points, scale);
      break;
    case "cross":
      drawCross(ctx, annotation.points, scale);
      break;
    case "text":
      drawText(ctx, annotation.points, annotation.style, scale);
      break;
    case "stickyNote":
      drawStickyNote(ctx, annotation.points, annotation.style, scale);
      break;
    case "highlight":
      drawHighlight(ctx, annotation.points, annotation.style, scale);
      break;
    case "door":
      drawDoor(ctx, annotation.points, scale);
      break;
    case "window":
      drawWindow(ctx, annotation.points, scale);
      break;
    case "fireExit":
      drawFireExit(ctx, annotation.points, scale);
      break;
    case "stairs":
      drawStairs(ctx, annotation.points, scale);
      break;
    case "elevator":
      drawElevator(ctx, annotation.points, scale);
      break;
    case "toilet":
      drawToilet(ctx, annotation.points, scale);
      break;
    default:
      console.warn("Unsupported annotation type:", annotation.type);
  }

  ctx.restore();
};

// Add function to check if point is inside highlight polygon
export const isPointInHighlight = (
  point: Point,
  annotation: Annotation,
  scale: number = 1
): boolean => {
  if (!annotation.points || annotation.points.length < 3) return false;

  let inside = false;
  const scaledPoint = { x: point.x * scale, y: point.y * scale };

  for (
    let i = 0, j = annotation.points.length - 1;
    i < annotation.points.length;
    j = i++
  ) {
    const pi = annotation.points[i];
    const pj = annotation.points[j];

    const xi = pi.x * scale;
    const yi = pi.y * scale;
    const xj = pj.x * scale;
    const yj = pj.y * scale;

    const intersect =
      yi > scaledPoint.y !== yj > scaledPoint.y &&
      scaledPoint.x < ((xj - xi) * (scaledPoint.y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
};

// Add new function to draw resize handles
export const drawResizeHandles = (
  ctx: CanvasRenderingContext2D,
  annotation: Annotation,
  scale: number
): void => {
  if (!annotation.points || !annotation.points.length) return;

  const handleSize = 8;
  ctx.save();

  // Set handle styles
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#0000ff";
  ctx.lineWidth = 1;

  // Calculate bounds
  const [start, end] = annotation.points;
  const bounds = {
    left: Math.min(start.x, end.x) * scale,
    right: Math.max(start.x, end.x) * scale,
    top: Math.min(start.y, end.y) * scale,
    bottom: Math.max(start.y, end.y) * scale,
  };

  // Draw selection rectangle
  ctx.strokeStyle = "#0000ff";
  ctx.strokeRect(
    bounds.left - handleSize / 2,
    bounds.top - handleSize / 2,
    bounds.right - bounds.left + handleSize,
    bounds.bottom - bounds.top + handleSize
  );

  // Draw handles
  const handles = [
    { x: bounds.left, y: bounds.top }, // Top-left
    { x: bounds.right, y: bounds.top }, // Top-right
    { x: bounds.left, y: bounds.bottom }, // Bottom-left
    { x: bounds.right, y: bounds.bottom }, // Bottom-right
    { x: (bounds.left + bounds.right) / 2, y: bounds.top }, // Top-middle
    { x: (bounds.left + bounds.right) / 2, y: bounds.bottom }, // Bottom-middle
    { x: bounds.left, y: (bounds.top + bounds.bottom) / 2 }, // Left-middle
    { x: bounds.right, y: (bounds.top + bounds.bottom) / 2 }, // Right-middle
  ];

  // Draw handles
  handles.forEach((handle) => {
    ctx.beginPath();
    ctx.rect(
      handle.x - handleSize / 2,
      handle.y - handleSize / 2,
      handleSize,
      handleSize
    );
    ctx.fill();
    ctx.stroke();
  });

  ctx.restore();
};

// Helper function to check if a point is near a handle
export const isNearHandle = (
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

// Add helper function for shape bounds
export const getShapeBounds = (
  points: Point[]
): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} => {
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

export const drawStamp = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  style: AnnotationStyle,
  scale: number
) => {
  if (!points.length || !style.stampType) return;
  const [start] = points;

  const stampWidth = 120;
  const stampHeight = 40;

  // Save context state
  ctx.save();

  // Set stamp styles
  ctx.strokeStyle = "#FF0000";
  ctx.fillStyle = "#FF0000";
  ctx.lineWidth = 2;
  ctx.globalAlpha = style.opacity ?? 1;

  // Draw stamp rectangle
  ctx.beginPath();
  ctx.rect(
    start.x - stampWidth / 2,
    start.y - stampHeight / 2,
    stampWidth,
    stampHeight
  );
  ctx.stroke();

  // Set text styles
  ctx.font = `bold 20px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Draw stamp text
  ctx.fillText(style.stampType.toUpperCase(), start.x, start.y);

  // Restore context state
  ctx.restore();
};

// Update isPointInStamp to use scale
export const isPointInStamp = (
  point: Point,
  annotation: Annotation,
  scale: number = 1
): boolean => {
  if (!annotation.points.length) return false;

  const [start] = annotation.points;
  const stampWidth = 120;
  const stampHeight = 40;

  const scaledPoint = {
    x: point.x * scale,
    y: point.y * scale,
  };

  const scaledStart = {
    x: start.x * scale,
    y: start.y * scale,
  };

  return (
    scaledPoint.x >= scaledStart.x - stampWidth / 2 &&
    scaledPoint.x <= scaledStart.x + stampWidth / 2 &&
    scaledPoint.y >= scaledStart.y - stampHeight / 2 &&
    scaledPoint.y <= scaledStart.y + stampHeight / 2
  );
};

// Add new function to draw selection outline
export const drawSelectionOutline = (
  ctx: CanvasRenderingContext2D,
  annotation: Annotation,
  scale: number,
  isMultiSelect: boolean = false
) => {
  const bounds = getShapeBounds(annotation.points);
  const padding = 4 * scale; // Scale padding

  ctx.save();
  ctx.strokeStyle = isMultiSelect ? "#2563eb" : "#3b82f6";
  ctx.lineWidth = 1 * scale; // Scale outline width
  ctx.setLineDash(isMultiSelect ? [4 * scale, 4 * scale] : []); // Scale dash pattern

  // Draw scaled selection rectangle
  ctx.strokeRect(
    bounds.left * scale - padding,
    bounds.top * scale - padding,
    (bounds.right - bounds.left) * scale + padding * 2,
    (bounds.bottom - bounds.top) * scale + padding * 2
  );

  if (!isMultiSelect) {
    drawResizeHandles(ctx, annotation, scale);
  }

  ctx.restore();
};

// Add helper function to get rectangle dimensions
export const getRectangleDimensions = (start: Point, end: Point) => {
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);

  return { width, height, left, top };
};

// Add drawing functions for architectural symbols
export const drawDoor = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number
) => {
  if (!points || points.length < 2) return;
  const [start, end] = points;

  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  const size = Math.min(width, height);

  ctx.save();
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2 * scale;

  // Draw door frame
  ctx.strokeRect(start.x * scale, start.y * scale, size, size);

  // Draw door arc
  ctx.beginPath();
  ctx.arc(
    start.x * scale + size,
    start.y * scale + size / 2,
    size / 2,
    Math.PI * 1.5,
    Math.PI * 0.5
  );
  ctx.stroke();

  ctx.restore();
};

export const drawWindow = (
  ctx: CanvasRenderingContext22D,
  points: Point[],
  scale: number
) => {
  if (!points || points.length < 2) return;
  const [start, end] = points;

  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);

  ctx.save();
  ctx.strokeStyle = "#0000FF";
  ctx.lineWidth = 2 * scale;

  // Draw window frame
  ctx.strokeRect(start.x * scale, start.y * scale, width, height);

  // Draw window panes
  ctx.beginPath();
  ctx.moveTo(start.x * scale + width / 2, start.y * scale);
  ctx.lineTo(start.x * scale + width / 2, start.y * scale + height);
  ctx.moveTo(start.x * scale, start.y * scale + height / 2);
  ctx.lineTo(start.x * scale + width, start.y * scale + height / 2);
  ctx.stroke();

  ctx.restore();
};

export const drawFireExit = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number
) => {
  if (!points || points.length < 2) return;
  const [start, end] = points;

  // Calculate bounding box dimensions
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);

  const width = maxX - minX;
  const height = maxY - minY;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  ctx.save();
  ctx.strokeStyle = "#FF0000";
  ctx.lineWidth = 2 * scale;
  ctx.fillStyle = "rgba(255, 0, 0, 0.3)"; // Add subtle fill for better visibility

  // Main flame body
  ctx.beginPath();
  ctx.moveTo(centerX * scale, maxY * scale); // Bottom center

  // Left curve with two peaks
  ctx.bezierCurveTo(
    (centerX - width * 0.3) * scale,
    (maxY - height * 0.2) * scale,
    (centerX - width * 0.4) * scale,
    (minY + height * 0.3) * scale,
    (centerX - width * 0.1) * scale,
    minY * scale
  );

  // Right curve with two peaks
  ctx.bezierCurveTo(
    (centerX + width * 0.1) * scale,
    (minY + height * 0.5) * scale,
    (centerX + width * 0.4) * scale,
    (maxY - height * 0.3) * scale,
    centerX * scale,
    maxY * scale
  );

  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Inner flame details
  ctx.beginPath();
  ctx.moveTo((centerX - width * 0.15) * scale, (maxY - height * 0.2) * scale);
  ctx.quadraticCurveTo(
    centerX * scale,
    (minY + height * 0.4) * scale,
    (centerX + width * 0.15) * scale,
    (maxY - height * 0.2) * scale
  );
  ctx.stroke();

  ctx.restore();
};

export const drawStairs = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number
) => {
  if (!points || points.length < 2) return;
  const [start, end] = points;

  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);

  ctx.save();
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2 * scale;

  // Draw stairs
  for (let i = 0; i < 5; i++) {
    const y = start.y * scale + (i * height) / 5;
    ctx.beginPath();
    ctx.moveTo(start.x * scale, y);
    ctx.lineTo(start.x * scale + width, y);
    ctx.stroke();
  }

  ctx.restore();
};

export const drawElevator = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number
) => {
  if (!points || points.length < 2) return;
  const [start, end] = points;

  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);

  ctx.save();
  ctx.strokeStyle = "#0000FF"; // Blue for elevator
  ctx.lineWidth = 2 * scale;

  // Draw elevator symbol
  ctx.strokeRect(start.x * scale, start.y * scale, width, height);
  ctx.beginPath();
  ctx.moveTo(start.x * scale + width / 2, start.y * scale);
  ctx.lineTo(start.x * scale + width / 2, start.y * scale + height);
  ctx.stroke();

  ctx.restore();
};

export const drawToilet = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number
) => {
  if (!points || points.length < 2) return;
  const [start, end] = points;

  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);

  ctx.save();
  ctx.strokeStyle = "#00FF00"; // Green for toilet
  ctx.lineWidth = 2 * scale;

  // Draw toilet symbol
  ctx.beginPath();
  ctx.arc(
    start.x * scale + width / 2,
    start.y * scale + height / 2,
    Math.min(width, height) / 2,
    0,
    2 * Math.PI
  );
  ctx.stroke();

  ctx.restore();
};
