import React from "react";
import {
  TOOLS,
  COLORS,
  LINE_WIDTHS,
  OPACITY_LEVELS,
} from "../constants/toolbar";
import { ToolbarSection } from "./Toolbar/ToolbarSection";
import { ToolButton } from "./Toolbar/ToolButton";
import { useKeyboardShortcutGuide } from "../hooks/useKeyboardShortcutGuide";
import { HelpCircle } from "lucide-react";
import { useAnnotationStore } from "../store/useAnnotationStore";

export const Toolbar = () => {
  const { setIsShortcutGuideOpen } = useKeyboardShortcutGuide();
  const { currentStyle, setCurrentStyle } = useAnnotationStore();

  const renderStyleSection = () => (
    <div className="space-y-4 p-2">
      {/* Color Picker */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Color
        </label>
        <div className="grid grid-cols-8 gap-1.5">
          {COLORS.map((color) => (
            <button
              key={color}
              onClick={() => setCurrentStyle({ color })}
              className={`w-6 h-6 rounded-full border-2 transition-all hover:scale-110 ${
                currentStyle.color === color
                  ? "border-blue-500 ring-2 ring-blue-200"
                  : "border-transparent"
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      {/* Line Width */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Line Width
        </label>
        <div className="flex gap-1.5">
          {LINE_WIDTHS.map((width) => (
            <button
              key={width}
              onClick={() => setCurrentStyle({ lineWidth: width })}
              className={`h-8 flex-1 flex items-center justify-center border rounded-md transition-colors ${
                currentStyle.lineWidth === width
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <div
                className="rounded-full"
                style={{
                  backgroundColor: currentStyle.color,
                  width: `${width * 4}px`,
                  height: `${width * 4}px`,
                }}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Opacity */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Opacity
        </label>
        <div className="flex gap-1.5">
          {OPACITY_LEVELS.map((opacity) => (
            <button
              key={opacity}
              onClick={() => setCurrentStyle({ opacity })}
              className={`h-8 flex-1 border rounded-md transition-colors ${
                currentStyle.opacity === opacity
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <div
                className="w-full h-full rounded-md"
                style={{
                  backgroundColor: currentStyle.color,
                  opacity: opacity,
                }}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-64 bg-white border-r border-gray-200 overflow-y-auto">
      <ToolbarSection title="Basic Tools" defaultExpanded>
        {TOOLS.basic.map((tool) => (
          <ToolButton
            key={tool.tool}
            tool={tool.tool}
            icon={tool.icon}
            label={tool.label}
            shortcut={tool.shortcut}
          />
        ))}
      </ToolbarSection>
      <ToolbarSection title="Shapes">
        {TOOLS.shapes.map((tool) => (
          <ToolButton
            key={tool.tool}
            tool={tool.tool}
            icon={tool.icon}
            label={tool.label}
            shortcut={tool.shortcut}
          />
        ))}
      </ToolbarSection>
      <ToolbarSection title="Lines & Arrows">
        {TOOLS.lines.map((tool) => (
          <ToolButton
            key={tool.tool}
            tool={tool.tool}
            icon={tool.icon}
            label={tool.label}
            shortcut={tool.shortcut}
          />
        ))}
      </ToolbarSection>
      <ToolbarSection title="Text & Notes">
        {TOOLS.text.map((tool) => (
          <ToolButton
            key={tool.tool}
            tool={tool.tool}
            icon={tool.icon}
            label={tool.label}
            shortcut={tool.shortcut}
          />
        ))}
      </ToolbarSection>
      <ToolbarSection title="Architectural Symbols">
        {TOOLS.architectural.map((tool) => (
          <ToolButton
            key={tool.tool}
            tool={tool.tool}
            icon={tool.icon}
            label={tool.label}
            shortcut={tool.shortcut}
          />
        ))}
      </ToolbarSection>
      <ToolbarSection title="Style">{renderStyleSection()}</ToolbarSection>
      <div className="mt-auto border-t border-gray-200 p-2 space-y-2">
        <button
          onClick={() => setIsShortcutGuideOpen(true)}
          className="w-full flex items-center justify-between gap-1 p-2 rounded hover:bg-gray-50 text-gray-600 hover:text-gray-700"
          title="Show keyboard shortcuts (?)"
        >
          <div className="flex items-center gap-1">
            <HelpCircle size={16} />
            <span className="text-sm">Keyboard Shortcuts</span>
          </div>
          <span className="text-xs text-gray-400">?</span>
        </button>
      </div>
    </div>
  );
};
