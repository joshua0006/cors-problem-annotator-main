import React, { useEffect, useRef, useState } from "react";
import { Point } from "../types/annotation";

interface TextInputProps {
  position: Point;
  onComplete: (text: string) => void;
  onCancel: () => void;
  scale: number;
  isSticky?: boolean;
  initialText?: string;
}

export const TextInput: React.FC<TextInputProps> = ({
  position,
  onComplete,
  onCancel,
  scale,
  isSticky = false,
  initialText = "",
}) => {
  const [text, setText] = useState(initialText);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      if (initialText) {
        inputRef.current.select();
      }
    }
  }, [initialText]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (text.trim()) {
        onComplete(text);
      } else {
        onCancel();
      }
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  const handleBlur = () => {
    if (text.trim()) {
      onComplete(text);
    } else {
      onCancel();
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: `scale(${scale})`,
        transformOrigin: "top left",
      }}
    >
      <textarea
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className={`
          min-w-[100px] min-h-[20px] p-2
          outline-none resize-none
          ${
            isSticky
              ? "w-[200px] min-h-[100px] bg-yellow-100 border border-yellow-400 rounded"
              : "bg-transparent border-none"
          }
        `}
        style={{
          fontSize: "14px",
          lineHeight: "20px",
          fontFamily: "Arial",
        }}
        placeholder={isSticky ? "Add note..." : "Add text..."}
      />
    </div>
  );
};
