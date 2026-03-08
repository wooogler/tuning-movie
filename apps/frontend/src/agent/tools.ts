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
    description:
      'Add a filter condition for visible items; repeated filter calls accumulate with AND semantics. Use only criteria the user explicitly asked for and can already see in the UI, or information already surfaced through the UI.',
    parameters: {
      field: {
        type: 'string',
        description:
          'Field to filter by. Prefer user-visible fields such as "value" or other information already surfaced in the UI; do not rely on hidden-only metadata without surfacing it first, and do not add a new filtering objective the user did not ask for.',
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
    description:
      'Sort items by a specific field only when that ordering basis is already visible or has already been surfaced to the user through the UI, and the user explicitly asked for that comparison objective.',
    parameters: {
      field: {
        type: 'string',
        description:
          'Field to sort by. Prefer user-visible or already-surfaced comparison fields; avoid hidden-only metadata until it has been exposed to the user. Do not use this to impose an inferred tie-breaker such as rating unless the user asked for it.',
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
    description:
      'Highlight one or more candidate items visually without committing to a selection. Only highlight options based on distinctions the user can already see in the UI.',
    parameters: {
      itemIds: {
        type: 'array',
        description: 'Array of item IDs to highlight when their relevance is legible from currently visible information',
      },
    },
  },
  {
    name: 'augment',
    description:
      'Change the display value of specific items to surface short information tied to the user\'s stated criterion without committing to a selection. Do not use this to add a new comparison dimension.',
    parameters: {
      items: {
        type: 'array',
        description:
          'Array of { itemId: string, value: string } to change display values by adding short criterion-relevant facts while keeping the original option recognizable',
      },
    },
  },
  {
    name: 'clearModification',
    description: 'Clear applied modifications, including all accumulated filter conditions',
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
    description:
      'Select an item in the current stage only when the user has clearly chosen that specific option, or when exactly one visible enabled option remains under the user\'s explicit criteria',
    parameters: {
      itemId: {
        type: 'string',
        description:
          'Item ID to select. Do not use this to break a tie among multiple viable options based on an inferred default or ranking.',
      },
    },
  },
  {
    name: 'selectMultiple',
    description: 'Seat-stage only: replace the current selected seat set with the provided item IDs',
    parameters: {
      itemIds: {
        type: 'array',
        description: 'Array of seat item IDs that should become the full selected seat set',
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
    name: 'startOver',
    description: 'Reset the workflow and return to the first stage',
    parameters: {},
  },
  {
    name: 'repeatStep',
    description: 'Repeat the current step card without changing the current UI state',
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
  selectMultiple: 'interaction',
  next: 'interaction',
  prev: 'interaction',
  startOver: 'interaction',
  repeatStep: 'interaction',
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
