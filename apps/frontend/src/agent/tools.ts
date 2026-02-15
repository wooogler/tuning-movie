/**
 * Agent Tool Definitions
 *
 * LLM Agent가 호출할 수 있는 Tool 정의
 * Python Agent에서 이 정의를 참조하여 Tool Call을 수행
 */

export interface ToolParameter {
  type: string;
  description: string;
  enum?: string[];
  optional?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
}

/**
 * Modification Tools
 *
 * UI 데이터를 변환하는 Tool들
 * 호출 시 Frontend의 modifier 함수를 실행
 */
export const modificationTools: ToolDefinition[] = [
  {
    name: 'filter',
    description: 'Filter items by a specific field condition',
    parameters: {
      field: {
        type: 'string',
        description: 'Field to filter by (e.g., "genre", "rating", "duration")',
      },
      operator: {
        type: 'string',
        description: 'Comparison operator',
        enum: ['eq', 'neq', 'contains', 'gt', 'lt', 'gte', 'lte', 'in'],
      },
      value: {
        type: 'any',
        description: 'Value to compare against',
      },
    },
  },
  {
    name: 'sort',
    description: 'Sort items by a specific field',
    parameters: {
      field: {
        type: 'string',
        description: 'Field to sort by (e.g., "title", "duration", "price")',
      },
      order: {
        type: 'string',
        description: 'Sort order',
        enum: ['asc', 'desc'],
      },
    },
  },
  {
    name: 'highlight',
    description: 'Highlight specific items visually',
    parameters: {
      itemIds: {
        type: 'array',
        description: 'Array of item IDs to highlight',
      },
    },
  },
  {
    name: 'augment',
    description: 'Change the display value of specific items',
    parameters: {
      items: {
        type: 'array',
        description: 'Array of { itemId: string, value: string } to change display values',
      },
    },
  },
  {
    name: 'clearModification',
    description: 'Clear applied modifications',
    parameters: {
      type: {
        type: 'string',
        description: 'Type of modification to clear',
        enum: ['filter', 'sort', 'highlight', 'augment', 'all'],
        optional: true,
      },
    },
  },
];

/**
 * Interaction Tools
 *
 * UI 상호작용을 수행하는 Tool들
 * Python Agent에서 직접 처리
 */
export const interactionTools: ToolDefinition[] = [
  {
    name: 'select',
    description: 'Select an item in the current stage',
    parameters: {
      itemId: {
        type: 'string',
        description: 'Item ID to select',
      },
    },
  },
  {
    name: 'setQuantity',
    description: 'Set quantity for a ticket type in ticket stage',
    parameters: {
      typeId: {
        type: 'string',
        description: 'Ticket type ID',
      },
      quantity: {
        type: 'number',
        description: 'Ticket quantity (0 or higher)',
      },
    },
  },
  {
    name: 'next',
    description: 'Proceed to next stage with current state (selected item is passed to next stage)',
    parameters: {},
  },
  {
    name: 'prev',
    description: 'Go back to previous stage (current state is discarded)',
    parameters: {},
  },
  {
    name: 'postMessage',
    description: 'Post an agent message to the chat timeline',
    parameters: {
      text: {
        type: 'string',
        description: 'Message content to display',
      },
    },
  },
];

/**
 * All available tools
 */
export const agentTools: ToolDefinition[] = [
  ...modificationTools,
  ...interactionTools,
];

/**
 * Tool name to category mapping
 */
export const toolCategories: Record<string, 'modification' | 'interaction'> = {
  filter: 'modification',
  sort: 'modification',
  highlight: 'modification',
  augment: 'modification',
  clearModification: 'modification',
  select: 'interaction',
  setQuantity: 'interaction',
  next: 'interaction',
  prev: 'interaction',
  postMessage: 'interaction',
};

/**
 * Check if a tool is a modification tool
 */
export function isModificationTool(toolName: string): boolean {
  return toolCategories[toolName] === 'modification';
}

/**
 * Check if a tool is an interaction tool
 */
export function isInteractionTool(toolName: string): boolean {
  return toolCategories[toolName] === 'interaction';
}
