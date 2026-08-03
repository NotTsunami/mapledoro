import { ItemIcon, SkillIcon } from "../../components/ResourceImage";
import type { QuickLink } from "./quickTools";

export function ToolIcon({ tool, size }: { tool: QuickLink; size: number }) {
  if (tool.iconType === "item") return <ItemIcon id={tool.itemId} size={size} />;
  if (tool.iconType === "skill") return <SkillIcon id={tool.skillId} size={size} />;
  return <span style={{ fontSize: size * 0.78, lineHeight: 1 }}>{tool.icon}</span>;
}
