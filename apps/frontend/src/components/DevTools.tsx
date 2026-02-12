import { useState } from 'react';
import type { ReactNode } from 'react';
import { useBookingStore } from '../store/bookingStore';
import { useDevTools } from './DevToolsContext';
import { agentTools } from '../agent/tools';
import type { ToolDefinition } from '../agent/tools';

type Tab = 'booking' | 'backend' | 'spec';

export function DevTools() {
  const bookingStore = useBookingStore();
  const { backendData, uiSpec, onToolApply } = useDevTools();
  const [isOpen, setIsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('spec');
  const [isExpanded, setIsExpanded] = useState(false);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed right-4 top-1/2 -translate-y-1/2 bg-dark-lighter text-white px-2 py-4 rounded-lg shadow-lg hover:bg-dark-border transition-colors z-50"
        title="Open DevTools"
      >
        &lt;
      </button>
    );
  }

  const width = isExpanded ? 'w-[60vw]' : 'w-96';

  return (
    <div
      className={`h-screen ${width} bg-dark-lighter border-l border-dark-border shadow-2xl flex flex-col transition-all duration-300`}
    >
      {/* Header */}
      <div className="bg-dark border-b border-dark-border p-3 flex items-center justify-between">
        <h2 className="text-white font-semibold">DevTools</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-gray-400 hover:text-white transition-colors px-2"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? '←' : '→'}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-white transition-colors px-2"
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-dark-border overflow-x-auto">
        <TabButton
          active={activeTab === 'booking'}
          onClick={() => setActiveTab('booking')}
        >
          Booking
        </TabButton>
        <TabButton
          active={activeTab === 'backend'}
          onClick={() => setActiveTab('backend')}
        >
          Backend
        </TabButton>
        <TabButton active={activeTab === 'spec'} onClick={() => setActiveTab('spec')}>
          UI Spec
        </TabButton>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto p-4 min-h-0">
        {activeTab === 'booking' && (
          <JsonViewer
            data={{
              movie: bookingStore.movie,
              theater: bookingStore.theater,
              date: bookingStore.date,
              showing: bookingStore.showing,
              selectedSeats: bookingStore.selectedSeats,
              tickets: bookingStore.tickets,
              customerName: bookingStore.customerName,
              customerEmail: bookingStore.customerEmail,
            }}
          />
        )}
        {activeTab === 'backend' && (
          <JsonViewer data={backendData || { message: 'No backend data' }} />
        )}
        {activeTab === 'spec' && (
          <JsonViewer data={uiSpec || { message: 'No UI spec' }} />
        )}
      </div>

      {/* Agent Tools - Always visible at bottom */}
      <div className="border-t border-dark-border bg-dark">
        <div className="p-3 border-b border-dark-border">
          <h3 className="text-white font-semibold text-sm">Agent Tools</h3>
        </div>
        <div className="p-4 max-h-80 overflow-auto">
          <AgentToolsPanel
            tools={agentTools}
            onApply={onToolApply}
            hasSpec={!!uiSpec}
          />
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
        active
          ? 'bg-dark-lighter text-white border-b-2 border-primary'
          : 'text-gray-400 hover:text-white hover:bg-dark-lighter/50'
      }`}
    >
      {children}
    </button>
  );
}

function JsonViewer({ data }: { data: unknown }) {
  const [editMode, setEditMode] = useState(false);
  const [jsonText, setJsonText] = useState('');

  const formattedJson = JSON.stringify(data, null, 2);

  if (!editMode) {
    return (
      <div className="space-y-2">
        <button
          onClick={() => {
            setJsonText(formattedJson);
            setEditMode(true);
          }}
          className="px-3 py-1 bg-primary text-white text-xs rounded hover:bg-primary-hover transition-colors"
        >
          Edit Mode
        </button>
        <pre className="bg-dark p-4 rounded-lg text-xs text-gray-300 overflow-auto font-mono whitespace-pre-wrap break-words">
          {formattedJson}
        </pre>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          onClick={() => setEditMode(false)}
          className="px-3 py-1 bg-dark-border text-white text-xs rounded hover:bg-dark transition-colors"
        >
          View Mode
        </button>
        <button
          onClick={() => {
            try {
              JSON.parse(jsonText);
              alert('Valid JSON ✓');
            } catch (e) {
              alert(`Invalid JSON: ${(e as Error).message}`);
            }
          }}
          className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors"
        >
          Validate
        </button>
        <button
          onClick={() => {
            navigator.clipboard.writeText(jsonText);
            alert('Copied to clipboard!');
          }}
          className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
        >
          Copy
        </button>
      </div>
      <textarea
        value={jsonText}
        onChange={(e) => setJsonText(e.target.value)}
        className="w-full h-[calc(100vh-200px)] bg-dark p-4 rounded-lg text-xs text-gray-300 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary"
        spellCheck={false}
      />
    </div>
  );
}

// Agent Tools Panel
interface AgentToolsPanelProps {
  tools: ToolDefinition[];
  onApply: (toolName: string, params: Record<string, unknown>) => void;
  hasSpec: boolean;
}

function AgentToolsPanel({ tools, onApply, hasSpec }: AgentToolsPanelProps) {
  const [selectedTool, setSelectedTool] = useState<string>(tools[0]?.name || '');
  const [params, setParams] = useState<Record<string, string>>({});
  const [lastResult, setLastResult] = useState<string | null>(null);

  const currentTool = tools.find((t) => t.name === selectedTool);

  const handleToolChange = (toolName: string) => {
    setSelectedTool(toolName);
    setParams({});
    setLastResult(null);
  };

  const handleParamChange = (paramName: string, value: string) => {
    setParams((prev) => ({ ...prev, [paramName]: value }));
  };

  const handleApply = () => {
    if (!currentTool) return;

    // Convert params to proper types
    const typedParams: Record<string, unknown> = {};
    for (const [key, paramDef] of Object.entries(currentTool.parameters)) {
      const value = params[key];
      if (value === undefined || value === '') {
        if (!paramDef.optional) {
          setLastResult(`Error: Missing required parameter "${key}"`);
          return;
        }
        continue;
      }

      // Type conversion
      if (paramDef.type === 'array') {
        try {
          typedParams[key] = JSON.parse(value);
        } catch {
          setLastResult(`Error: Invalid JSON for "${key}"`);
          return;
        }
      } else if (paramDef.type === 'object') {
        try {
          typedParams[key] = JSON.parse(value);
        } catch {
          setLastResult(`Error: Invalid JSON for "${key}"`);
          return;
        }
      } else if (paramDef.type === 'number') {
        typedParams[key] = Number(value);
      } else {
        typedParams[key] = value;
      }
    }

    try {
      onApply(selectedTool, typedParams);
      setLastResult(`✓ Applied ${selectedTool}`);
    } catch (e) {
      setLastResult(`Error: ${(e as Error).message}`);
    }
  };

  if (!hasSpec) {
    return (
      <div className="text-gray-500 text-center py-4 text-sm">
        No UI Spec available
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Tool Selector */}
      <div>
        <select
          value={selectedTool}
          onChange={(e) => handleToolChange(e.target.value)}
          className="w-full bg-dark border border-dark-border rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <optgroup label="Modification Tools">
            {tools
              .filter((t) => ['filter', 'sort', 'highlight', 'augment', 'clearModification'].includes(t.name))
              .map((tool) => (
                <option key={tool.name} value={tool.name}>
                  {tool.name}
                </option>
              ))}
          </optgroup>
          <optgroup label="Interaction Tools">
            {tools
              .filter((t) => ['select', 'next', 'prev'].includes(t.name))
              .map((tool) => (
                <option key={tool.name} value={tool.name}>
                  {tool.name}
                </option>
              ))}
          </optgroup>
        </select>
      </div>

      {/* Parameters */}
      {currentTool && Object.keys(currentTool.parameters).length > 0 && (
        <div className="space-y-2">
          {Object.entries(currentTool.parameters).map(([paramName, paramDef]) => (
            <div key={paramName}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-white text-xs">{paramName}</span>
                {paramDef.optional && (
                  <span className="text-gray-500 text-xs">(opt)</span>
                )}
              </div>
              {paramDef.enum ? (
                <select
                  value={params[paramName] || ''}
                  onChange={(e) => handleParamChange(paramName, e.target.value)}
                  className="w-full bg-dark-lighter border border-dark-border rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Select...</option>
                  {paramDef.enum.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : paramDef.type === 'array' || paramDef.type === 'object' ? (
                <textarea
                  value={params[paramName] || ''}
                  onChange={(e) => handleParamChange(paramName, e.target.value)}
                  placeholder={
                    currentTool.name === 'augment' && paramName === 'items'
                      ? '[{"itemId": "m1", "value": "New Text"}]'
                      : currentTool.name === 'highlight' && paramName === 'itemIds'
                      ? '["id1", "id2"]'
                      : paramDef.type === 'array'
                      ? '["id1", "id2"]'
                      : '{ "key": "value" }'
                  }
                  className="w-full bg-dark-lighter border border-dark-border rounded px-2 py-1.5 text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary h-14 resize-none"
                />
              ) : (
                <input
                  type="text"
                  value={params[paramName] || ''}
                  onChange={(e) => handleParamChange(paramName, e.target.value)}
                  placeholder={paramDef.description}
                  className="w-full bg-dark-lighter border border-dark-border rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Apply Button & Result */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleApply}
          disabled={!hasSpec}
          className="px-4 py-1.5 bg-primary text-white text-sm rounded hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Apply
        </button>
        {lastResult && (
          <span
            className={`text-xs ${
              lastResult.startsWith('Error') ? 'text-red-400' : 'text-green-400'
            }`}
          >
            {lastResult}
          </span>
        )}
        {!hasSpec && (
          <span className="text-yellow-500 text-xs">No spec loaded</span>
        )}
      </div>
    </div>
  );
}
