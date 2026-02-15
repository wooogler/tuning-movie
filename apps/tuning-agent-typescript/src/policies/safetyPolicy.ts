import type { PerceivedContext, PlannedAction, ToolSchemaItem } from '../types';

function hasTool(toolSchema: ToolSchemaItem[], toolName: string): boolean {
  return toolSchema.some((tool) => tool.name === toolName);
}

export function isActionSafe(context: PerceivedContext, action: PlannedAction): boolean {
  if (action.type === 'tool.call') {
    const toolName = typeof action.payload.toolName === 'string' ? action.payload.toolName : '';
    const reason = typeof action.payload.reason === 'string' ? action.payload.reason.trim() : '';
    if (!toolName || !reason) return false;
    return hasTool(context.toolSchema, toolName);
  }
  return true;
}
