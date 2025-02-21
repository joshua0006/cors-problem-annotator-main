import { Annotation, Point } from '../../types/annotation';

export const drawSelectionBox = (
  ctx: CanvasRenderingContext2D,
  annotation: Annotation,
  scale: number
) => {
  const bounds = getAnnotationBounds(annotation, scale);
  ctx.strokeStyle = '#0088ff';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.strokeRect(
    bounds.x * scale - 5,
    bounds.y * scale - 5,
    bounds.width * scale + 10,
    bounds.height * scale + 10
  );
  ctx.setLineDash([]);
};

export const getAnnotationBounds = (annotation: Annotation, scale: number) => {
  const points = annotation.points;
  
  if (annotation.type === 'circle') {
    const [center, edge] = points;
    const radius = Math.sqrt(
      Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2)
    );
    return {
      x: center.x - radius,
      y: center.y - radius,
      width: radius * 2,
      height: radius * 2,
    };
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
};

export const isPointInAnnotation = (point: Point, annotation: Annotation, scale: number) => {
  const bounds = getAnnotationBounds(annotation, scale);
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
};