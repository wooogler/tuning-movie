import { useState } from 'react';
import { useBookingStore } from '../store/bookingStore';
import { useDevTools } from './DevToolsContext';

type Tab = 'booking' | 'backend' | 'spec';

export function DevTools() {
  const bookingStore = useBookingStore();
  const { backendData, uiSpec } = useDevTools();
  const [isOpen, setIsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('booking');
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
      <div className="flex bg-dark-border">
        <TabButton
          active={activeTab === 'booking'}
          onClick={() => setActiveTab('booking')}
        >
          Booking State
        </TabButton>
        <TabButton
          active={activeTab === 'backend'}
          onClick={() => setActiveTab('backend')}
        >
          Backend Data
        </TabButton>
        <TabButton active={activeTab === 'spec'} onClick={() => setActiveTab('spec')}>
          UI Spec
        </TabButton>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
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
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium transition-colors ${
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
