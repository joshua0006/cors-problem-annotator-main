export type Point = {
  x: number;
  y: number;
};

export type AnnotationType =
  | "select"
  | "freehand"
  | "line"
  | "arrow"
  | "doubleArrow"
  | "rectangle"
  | "circle"
  | "triangle"
  | "star"
  | "text"
  | "stickyNote"
  | "highlight"
  | "stamp"
  | "door"
  | "window"
  | "fireExit"
  | "stairs"
  | "elevator"
  | "toilet";

export type StampType = "approved" | "rejected" | "draft" | "reviewed";

export type AnnotationStyle = {
  color: string;
  lineWidth: number;
  opacity: number;
  text?: string;
  stampType?: StampType;
};

export interface Annotation {
  id: string;
  type: AnnotationType;
  points: Point[];
  style: AnnotationStyle;
  pageNumber: number;
  text?: string;
  timestamp: number;
  userId: string;
  selected?: boolean;
  version?: number;
}

export interface ToolConfig {
  type: AnnotationType;
  icon: React.ReactNode;
  label: string;
  drawMode: "continuous" | "shape" | "single";
}

export const createAnnotation = (type: AnnotationType): Annotation => {
  const defaultStyles: Record<AnnotationType, AnnotationStyle> = {
    fireExit: { color: "#FF0000", lineWidth: 2, opacity: 1 },
    stairs: { color: "#000000", lineWidth: 2, opacity: 1 },
    elevator: { color: "#0000FF", lineWidth: 2, opacity: 1 },
    toilet: { color: "#00FF00", lineWidth: 2, opacity: 1 },
    // ... other default styles ...
  };

  return {
    id: Date.now().toString(),
    type,
    points: [],
    style: defaultStyles[type] || {
      color: "#000000",
      lineWidth: 2,
      opacity: 1,
    },
    pageNumber: 1,
    timestamp: Date.now(),
    userId: "current-user",
    version: 1,
  };
};
