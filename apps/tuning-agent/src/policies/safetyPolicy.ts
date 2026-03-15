import type { PerceivedContext, PlannedAction, ToolSchemaItem } from '../types';

function hasTool(toolSchema: ToolSchemaItem[], toolName: string): boolean {
  return toolSchema.some((tool) => tool.name === toolName);
}

export function isActionSafe(context: PerceivedContext, action: PlannedAction): boolean {
  if (action.type === 'tool.call') {
    const toolName = typeof action.payload.toolName === 'string' ? action.payload.toolName : '';
    if (!toolName) return false;
    return hasTool(context.toolSchema, toolName);
  }
  return true;
}
