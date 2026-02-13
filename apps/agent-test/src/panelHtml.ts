export const PANEL_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Agent Test Console</title>
    <style>
      :root {
        --bg: #060b14;
        --panel: #101826;
        --panel-2: #0f1522;
        --line: #2a3648;
        --text: #e6edf6;
        --muted: #9ca8ba;
        --primary: #2dd4bf;
        --primary-2: #0f766e;
        --danger: #ef4444;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: var(--text);
        background: radial-gradient(circle at 15% -20%, #0b2a4a 0%, var(--bg) 50%, #04060c 100%);
      }

      .shell {
        width: min(980px, calc(100vw - 24px));
        height: calc(100vh - 24px);
        margin: 12px auto;
        border: 1px solid var(--line);
        border-radius: 14px;
        overflow: hidden;
        background: var(--panel-2);
        display: flex;
        flex-direction: column;
      }

      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 14px;
        border-bottom: 1px solid var(--line);
        background: #0b1220;
      }

      .header-title {
        margin: 0;
        font-size: 16px;
        font-weight: 700;
      }

      .header-sub {
        margin: 4px 0 0;
        font-size: 12px;
        color: var(--muted);
      }

      .badge {
        border: 1px solid var(--primary-2);
        color: #8ef7ea;
        background: #08323a;
        border-radius: 999px;
        font-size: 11px;
        padding: 5px 10px;
        white-space: nowrap;
      }

      .tabs {
        display: flex;
        border-bottom: 1px solid var(--line);
        background: #0a101a;
      }

      .tab-btn {
        border: 0;
        border-right: 1px solid var(--line);
        background: transparent;
        color: var(--muted);
        padding: 9px 12px;
        cursor: pointer;
        font-size: 12px;
      }

      .tab-btn.active {
        color: var(--text);
        background: #121d2e;
        border-bottom: 2px solid var(--primary);
      }

      .content {
        flex: 1;
        overflow: auto;
        padding: 12px;
      }

      .panel {
        display: none;
      }

      .panel.active {
        display: block;
      }

      .panel-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 12px;
      }

      .card {
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--panel);
        padding: 10px;
      }

      .card h3 {
        margin: 0 0 8px;
        font-size: 13px;
      }

      .kv {
        display: grid;
        grid-template-columns: 150px 1fr;
        gap: 6px 10px;
        font-size: 12px;
      }

      .kv-key {
        color: var(--muted);
      }

      .mono {
        margin: 0;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: #060b14;
        color: #d4deed;
        padding: 10px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 12px;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 320px;
        overflow: auto;
      }

      .actions {
        border-top: 1px solid var(--line);
        background: #0b1220;
      }

      .actions-header {
        padding: 10px 12px;
        border-bottom: 1px solid var(--line);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .actions-header h3 {
        margin: 0;
        font-size: 13px;
      }

      .actions-body {
        padding: 12px;
      }

      .grid-2 {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }

      button,
      input,
      textarea,
      select {
        width: 100%;
        border: 1px solid #3a4a63;
        border-radius: 8px;
        background: #0a1220;
        color: var(--text);
        font-size: 12px;
        padding: 8px;
      }

      button {
        cursor: pointer;
        background: #123646;
        border-color: #1a5b70;
        font-weight: 600;
      }

      button:hover {
        filter: brightness(1.08);
      }

      .btn-ghost {
        background: #131b28;
        border-color: #2f3f56;
      }

      .btn-danger {
        background: #3a171c;
        border-color: #7f1d1d;
      }

      .label {
        display: block;
        margin-bottom: 4px;
        font-size: 11px;
        color: var(--muted);
      }

      textarea {
        min-height: 70px;
        resize: vertical;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }

      .action-tabs {
        display: flex;
        gap: 8px;
        margin: 10px 0;
      }

      .action-tab {
        width: auto;
        padding: 6px 10px;
      }

      .action-tab.active {
        background: #14556a;
        border-color: #2296aa;
      }

      .action-panel {
        display: none;
      }

      .action-panel.active {
        display: block;
      }

      .tool-param {
        margin-bottom: 8px;
      }

      .quick-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
      }

      .quick-btn {
        background: #122636;
        border-color: #1f455b;
        text-align: left;
      }

      .hint {
        font-size: 11px;
        color: var(--muted);
        margin-bottom: 8px;
      }

      .result {
        margin-top: 10px;
      }

      .result.error {
        border-color: #7f1d1d;
        color: #fecaca;
      }

      @media (max-width: 740px) {
        .shell {
          width: 100vw;
          height: 100vh;
          margin: 0;
          border-radius: 0;
        }

        .grid-2,
        .quick-grid {
          grid-template-columns: 1fr;
        }

        .kv {
          grid-template-columns: 120px 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="header">
        <div>
          <h1 class="header-title">Agent Test Console</h1>
          <p class="header-sub">DevTool-style remote panel for external-agent protocol</p>
        </div>
        <span id="connBadge" class="badge">control ws: connecting...</span>
      </div>

      <div class="tabs">
        <button class="tab-btn active" data-tab="overview">Overview</button>
        <button class="tab-btn" data-tab="uiSpec">UI Spec</button>
        <button class="tab-btn" data-tab="history">Message History</button>
        <button class="tab-btn" data-tab="schema">Tool Schema</button>
        <button class="tab-btn" data-tab="events">Events</button>
      </div>

      <div class="content">
        <section class="panel active" id="panel-overview">
          <div class="panel-grid">
            <div class="card">
              <h3>Recognized State</h3>
              <div id="recognizedState" class="kv"></div>
            </div>

            <div class="card">
              <h3>Quick Select (from UI Spec visibleItems)</h3>
              <p class="hint">Click to send <code>tool.call(select)</code> immediately.</p>
              <div id="quickSelect" class="quick-grid"></div>
            </div>

            <div class="card">
              <h3>Raw Status</h3>
              <pre id="statusRaw" class="mono"></pre>
            </div>
          </div>
        </section>

        <section class="panel" id="panel-uiSpec">
          <pre id="uiSpecRaw" class="mono"></pre>
        </section>

        <section class="panel" id="panel-history">
          <pre id="historyRaw" class="mono"></pre>
        </section>

        <section class="panel" id="panel-schema">
          <pre id="schemaRaw" class="mono"></pre>
        </section>

        <section class="panel" id="panel-events">
          <pre id="eventsRaw" class="mono"></pre>
        </section>
      </div>

      <div class="actions">
        <div class="actions-header">
          <h3>Agent Actions</h3>
          <span class="hint">Session + tool + message</span>
        </div>

        <div class="actions-body">
          <div class="grid-2" style="margin-bottom: 8px;">
            <button id="btnReconnect" class="btn-ghost">Relay Reconnect</button>
            <button id="btnSnapshot" class="btn-ghost">Snapshot Get</button>
          </div>

          <div class="grid-2" style="margin-bottom: 8px;">
            <button id="btnSessionStart" class="btn-ghost">Session Start</button>
            <button id="btnSessionEnd" class="btn-danger">Session End</button>
          </div>

          <div class="grid-2" style="margin-bottom: 10px;">
            <button id="btnToolNext" class="btn-ghost">Tool: next</button>
            <button id="btnToolPrev" class="btn-ghost">Tool: prev</button>
          </div>

          <div class="action-tabs">
            <button class="action-tab active" data-action-mode="tool">Tool Call</button>
            <button class="action-tab" data-action-mode="message">Agent Message</button>
          </div>

          <section class="action-panel active" id="action-panel-tool">
            <label class="label" for="toolName">Tool</label>
            <select id="toolName"></select>

            <label class="label" for="toolReason">Reason</label>
            <input id="toolReason" value="Manual tool call from agent-test console" />

            <div id="toolParamsWrap"></div>

            <button id="btnToolApply">Apply Tool</button>
          </section>

          <section class="action-panel" id="action-panel-message">
            <label class="label" for="agentMessageText">Text</label>
            <textarea id="agentMessageText" placeholder="I will select a date to narrow showtimes."></textarea>
            <button id="btnSendMessage">Send agent.message</button>
          </section>

          <pre id="actionResult" class="mono result"></pre>
        </div>
      </div>
    </div>

    <script>
      (function () {
        const $ = function (id) {
          return document.getElementById(id);
        };

        const connBadgeEl = $('connBadge');
        const statusRawEl = $('statusRaw');
        const recognizedStateEl = $('recognizedState');
        const quickSelectEl = $('quickSelect');
        const uiSpecRawEl = $('uiSpecRaw');
        const historyRawEl = $('historyRaw');
        const schemaRawEl = $('schemaRaw');
        const eventsRawEl = $('eventsRaw');
        const actionResultEl = $('actionResult');

        const toolNameEl = $('toolName');
        const toolReasonEl = $('toolReason');
        const toolParamsWrapEl = $('toolParamsWrap');
        const agentMessageTextEl = $('agentMessageText');

        let ws = null;
        let seq = 0;
        let status = {};
        let snapshot = null;
        let events = [];
        let toolParamValues = {};

        const pendingReplies = new Map();

        function nextId(prefix) {
          seq += 1;
          return (prefix || 'c') + '-' + String(seq).padStart(4, '0');
        }

        function asObj(value) {
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            return value;
          }
          return null;
        }

        function asArray(value) {
          return Array.isArray(value) ? value : [];
        }

        function escapeHtml(value) {
          return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\"/g, '&quot;')
            .replace(/'/g, '&#039;');
        }

        function toJson(value) {
          return JSON.stringify(value, null, 2);
        }

        function setConnectionBadge(text, ok) {
          connBadgeEl.textContent = text;
          if (ok) {
            connBadgeEl.style.background = '#08323a';
            connBadgeEl.style.borderColor = '#0f766e';
            connBadgeEl.style.color = '#8ef7ea';
          } else {
            connBadgeEl.style.background = '#3a171c';
            connBadgeEl.style.borderColor = '#7f1d1d';
            connBadgeEl.style.color = '#fecaca';
          }
        }

        function getUiSpec() {
          const snap = asObj(snapshot);
          if (!snap) return null;
          return snap.uiSpec || null;
        }

        function getMessageHistory() {
          const snap = asObj(snapshot);
          if (!snap) return [];
          return asArray(snap.messageHistory);
        }

        function getToolSchema() {
          const snap = asObj(snapshot);
          if (!snap) return [];
          return asArray(snap.toolSchema);
        }

        function setActiveTab(tabName) {
          const buttons = document.querySelectorAll('[data-tab]');
          const panels = document.querySelectorAll('.panel');

          buttons.forEach(function (btn) {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
          });

          panels.forEach(function (panel) {
            panel.classList.toggle('active', panel.id === 'panel-' + tabName);
          });
        }

        function setActiveActionMode(mode) {
          const buttons = document.querySelectorAll('[data-action-mode]');
          const panels = document.querySelectorAll('.action-panel');

          buttons.forEach(function (btn) {
            btn.classList.toggle('active', btn.getAttribute('data-action-mode') === mode);
          });

          panels.forEach(function (panel) {
            panel.classList.toggle('active', panel.id === 'action-panel-' + mode);
          });
        }

        function renderRawViews() {
          statusRawEl.textContent = toJson(status || {});
          uiSpecRawEl.textContent = toJson(getUiSpec());
          historyRawEl.textContent = toJson(getMessageHistory());
          schemaRawEl.textContent = toJson(getToolSchema());
          eventsRawEl.textContent = toJson(events.slice(-120));
        }

        function renderRecognizedState() {
          const uiSpec = asObj(getUiSpec());
          const state = asObj(uiSpec ? uiSpec.state : null);
          const selected = asObj(state ? state.selected : null);
          const selectedList = state ? asArray(state.selectedList) : [];
          const visibleItems = uiSpec ? asArray(uiSpec.visibleItems) : [];
          const quantities = state ? asArray(state.quantities) : [];
          const messageHistory = getMessageHistory();
          const toolSchema = getToolSchema();

          let ticketTotal = 0;
          quantities.forEach(function (entry) {
            const row = asObj(entry);
            if (!row) return;
            const count = row.count;
            if (typeof count === 'number' && Number.isFinite(count)) {
              ticketTotal += count;
            }
          });

          const rows = [
            ['Relay Connected', status && status.connected ? 'yes' : 'no'],
            ['Relay Joined', status && status.joined ? 'yes' : 'no'],
            ['UISpec', uiSpec ? 'detected' : 'none'],
            ['Stage', uiSpec && typeof uiSpec.stage === 'string' ? uiSpec.stage : '-'],
            ['Visible Items', String(visibleItems.length)],
            ['Selected Item', selected && typeof selected.id === 'string' ? selected.id : '-'],
            ['Selected List Count', String(selectedList.length)],
            ['Ticket Quantity Total', String(ticketTotal)],
            ['Message History', String(messageHistory.length)],
            ['Tool Schema', String(toolSchema.length)],
            [
              'Last User Message',
              status && status.lastUserMessage && typeof status.lastUserMessage.text === 'string'
                ? status.lastUserMessage.text
                : '-',
            ],
          ];

          recognizedStateEl.innerHTML = rows
            .map(function (row) {
              return (
                '<div class="kv-key">' +
                escapeHtml(row[0]) +
                '</div><div>' +
                escapeHtml(row[1]) +
                '</div>'
              );
            })
            .join('');

          if (visibleItems.length === 0) {
            quickSelectEl.innerHTML = '<div class="hint">No visibleItems in current UISpec.</div>';
            return;
          }

          const buttons = visibleItems.slice(0, 10).map(function (item) {
            const row = asObj(item);
            if (!row || typeof row.id !== 'string') return null;
            const label =
              typeof row.value === 'string' && row.value.trim() ? row.value.trim() : row.id;
            return (
              '<button class="quick-btn" data-select-id="' +
              escapeHtml(row.id) +
              '">' +
              escapeHtml(label) +
              '</button>'
            );
          });

          quickSelectEl.innerHTML = buttons.filter(Boolean).join('');
        }

        function findToolDefinition(toolName) {
          const schema = getToolSchema();
          for (let i = 0; i < schema.length; i += 1) {
            const def = asObj(schema[i]);
            if (!def) continue;
            if (def.name === toolName) return def;
          }
          return null;
        }

        function refreshToolSelector() {
          const schema = getToolSchema();
          const current = toolNameEl.value;

          toolNameEl.innerHTML = '';

          schema.forEach(function (tool) {
            const def = asObj(tool);
            if (!def || typeof def.name !== 'string') return;
            const option = document.createElement('option');
            option.value = def.name;
            option.textContent = def.name;
            toolNameEl.appendChild(option);
          });

          if (current && findToolDefinition(current)) {
            toolNameEl.value = current;
          } else if (toolNameEl.options.length > 0) {
            toolNameEl.value = toolNameEl.options[0].value;
            toolParamValues = {};
          }

          renderToolParams();
        }

        function parseArrayInput(raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
          } catch (_) {
            // ignore
          }

          return String(raw)
            .split(',')
            .map(function (v) {
              return v.trim();
            })
            .filter(Boolean);
        }

        function renderToolParams() {
          toolParamsWrapEl.innerHTML = '';

          const selectedTool = toolNameEl.value;
          const toolDef = findToolDefinition(selectedTool);
          const parameters = asObj(toolDef ? toolDef.parameters : null);

          if (!parameters || Object.keys(parameters).length === 0) {
            const hint = document.createElement('p');
            hint.className = 'hint';
            hint.textContent = 'This tool has no parameters.';
            toolParamsWrapEl.appendChild(hint);
            return;
          }

          Object.keys(parameters).forEach(function (paramName) {
            const paramDef = asObj(parameters[paramName]) || {};
            const type = typeof paramDef.type === 'string' ? paramDef.type : 'string';
            const optional = Boolean(paramDef.optional);
            const description =
              typeof paramDef.description === 'string' ? paramDef.description : paramName;
            const enumValues = asArray(paramDef.enum);

            const wrapper = document.createElement('div');
            wrapper.className = 'tool-param';

            const label = document.createElement('label');
            label.className = 'label';
            label.textContent = paramName + (optional ? ' (optional)' : '');
            wrapper.appendChild(label);

            let input;

            if (enumValues.length > 0) {
              const select = document.createElement('select');
              const empty = document.createElement('option');
              empty.value = '';
              empty.textContent = 'Select...';
              select.appendChild(empty);

              enumValues.forEach(function (v) {
                const option = document.createElement('option');
                option.value = String(v);
                option.textContent = String(v);
                select.appendChild(option);
              });

              select.value = toolParamValues[paramName] || '';
              input = select;
            } else if (type === 'array' || type === 'object') {
              const textarea = document.createElement('textarea');
              textarea.placeholder = description;
              textarea.value = toolParamValues[paramName] || '';
              input = textarea;
            } else {
              const text = document.createElement('input');
              text.type = type === 'number' ? 'number' : 'text';
              text.placeholder = description;
              text.value = toolParamValues[paramName] || '';
              input = text;
            }

            input.setAttribute('data-param-name', paramName);
            input.setAttribute('data-param-type', type);
            input.setAttribute('data-param-optional', optional ? 'true' : 'false');
            input.addEventListener('input', function (event) {
              const target = event.target;
              if (!target) return;
              toolParamValues[paramName] = target.value;
            });

            wrapper.appendChild(input);
            toolParamsWrapEl.appendChild(wrapper);
          });
        }

        function collectToolParams() {
          const selectedTool = toolNameEl.value;
          const toolDef = findToolDefinition(selectedTool);
          const parameters = asObj(toolDef ? toolDef.parameters : null);
          const result = {};

          if (!parameters) return result;

          const names = Object.keys(parameters);
          for (let i = 0; i < names.length; i += 1) {
            const paramName = names[i];
            const paramDef = asObj(parameters[paramName]) || {};
            const type = typeof paramDef.type === 'string' ? paramDef.type : 'string';
            const optional = Boolean(paramDef.optional);
            const raw = toolParamValues[paramName];

            if ((raw === undefined || raw === '') && !optional) {
              throw new Error('Missing required parameter: ' + paramName);
            }

            if (raw === undefined || raw === '') continue;

            if (type === 'number') {
              const parsedNumber = Number(raw);
              if (Number.isNaN(parsedNumber)) {
                throw new Error('Invalid number for parameter: ' + paramName);
              }
              result[paramName] = parsedNumber;
              continue;
            }

            if (type === 'array') {
              result[paramName] = parseArrayInput(raw);
              continue;
            }

            if (type === 'object') {
              try {
                result[paramName] = JSON.parse(raw);
              } catch (_) {
                throw new Error('Invalid JSON object for parameter: ' + paramName);
              }
              continue;
            }

            if (type === 'boolean') {
              result[paramName] = raw === 'true';
              continue;
            }

            result[paramName] = raw;
          }

          return result;
        }

        function setActionResult(payload, isError) {
          actionResultEl.classList.toggle('error', Boolean(isError));
          actionResultEl.textContent = toJson(payload);
        }

        function sendControl(type, payload, channel) {
          if (!ws || ws.readyState !== WebSocket.OPEN) {
            throw new Error('control ws is not connected');
          }

          const id = nextId('c');
          if (channel) pendingReplies.set(id, channel);
          ws.send(JSON.stringify({ type: type, id: id, payload: payload || {} }));
          return id;
        }

        function handleControlResponse(message, isError) {
          const replyTo = message.replyTo;
          if (replyTo) pendingReplies.delete(replyTo);

          setActionResult(
            {
              type: message.type,
              replyTo: replyTo || null,
              payload: message.payload || {},
            },
            isError
          );
        }

        function refreshAllViews() {
          renderRawViews();
          renderRecognizedState();
          refreshToolSelector();
        }

        function connect() {
          const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
          ws = new WebSocket(protocol + '://' + window.location.host + '/control/ws');

          ws.onopen = function () {
            setConnectionBadge('control ws: connected', true);
          };

          ws.onclose = function () {
            setConnectionBadge('control ws: disconnected (retrying...)', false);
            setTimeout(connect, 1000);
          };

          ws.onerror = function () {
            setConnectionBadge('control ws: error', false);
          };

          ws.onmessage = function (event) {
            let message;
            try {
              message = JSON.parse(event.data);
            } catch (_) {
              return;
            }

            if (message.type === 'control.ready') {
              status = message.payload && message.payload.status ? message.payload.status : {};
              snapshot = message.payload ? message.payload.snapshot : null;
              events = message.payload && Array.isArray(message.payload.events) ? message.payload.events : [];
              refreshAllViews();
              return;
            }

            if (message.type === 'control.state') {
              status = message.payload && message.payload.status ? message.payload.status : status;
              if (
                message.payload &&
                Object.prototype.hasOwnProperty.call(message.payload, 'snapshot')
              ) {
                snapshot = message.payload.snapshot;
              }
              refreshAllViews();
              return;
            }

            if (message.type === 'control.snapshot') {
              snapshot = message.payload ? message.payload.snapshot : null;
              refreshAllViews();
              return;
            }

            if (message.type === 'control.event') {
              const eventItem = message.payload ? message.payload.event : null;
              if (eventItem) {
                events.push(eventItem);
                if (events.length > 300) events = events.slice(-300);
              }
              renderRawViews();
              renderRecognizedState();
              return;
            }

            if (message.type === 'control.result') {
              handleControlResponse(message, false);
              return;
            }

            if (message.type === 'control.error') {
              handleControlResponse(message, true);
            }
          };
        }

        document.querySelectorAll('[data-tab]').forEach(function (button) {
          button.addEventListener('click', function () {
            const tab = button.getAttribute('data-tab');
            if (!tab) return;
            setActiveTab(tab);
          });
        });

        document.querySelectorAll('[data-action-mode]').forEach(function (button) {
          button.addEventListener('click', function () {
            const mode = button.getAttribute('data-action-mode');
            if (!mode) return;
            setActiveActionMode(mode);
          });
        });

        toolNameEl.addEventListener('change', function () {
          toolParamValues = {};
          renderToolParams();
        });

        quickSelectEl.addEventListener('click', function (event) {
          const target = event.target;
          if (!target || !target.getAttribute) return;

          const itemId = target.getAttribute('data-select-id');
          if (!itemId) return;

          try {
            sendControl(
              'tool.call',
              {
                toolName: 'select',
                reason: 'Quick select from recognized visibleItems',
                params: { itemId: itemId },
              },
              'quick-select'
            );
          } catch (error) {
            setActionResult({ error: String(error) }, true);
          }
        });

        $('btnReconnect').addEventListener('click', function () {
          try {
            sendControl('relay.reconnect', {}, 'relay');
          } catch (error) {
            setActionResult({ error: String(error) }, true);
          }
        });

        $('btnSnapshot').addEventListener('click', function () {
          try {
            sendControl('snapshot.get', {}, 'snapshot');
          } catch (error) {
            setActionResult({ error: String(error) }, true);
          }
        });

        $('btnSessionStart').addEventListener('click', function () {
          try {
            sendControl('session.start', { studyId: 'manual', participantId: 'manual' }, 'session-start');
          } catch (error) {
            setActionResult({ error: String(error) }, true);
          }
        });

        $('btnSessionEnd').addEventListener('click', function () {
          try {
            sendControl('session.end', { reason: 'manual-stop' }, 'session-end');
          } catch (error) {
            setActionResult({ error: String(error) }, true);
          }
        });

        $('btnToolNext').addEventListener('click', function () {
          try {
            sendControl(
              'tool.call',
              {
                toolName: 'next',
                reason: 'Quick action next from agent-test console',
                params: {},
              },
              'quick-next'
            );
          } catch (error) {
            setActionResult({ error: String(error) }, true);
          }
        });

        $('btnToolPrev').addEventListener('click', function () {
          try {
            sendControl(
              'tool.call',
              {
                toolName: 'prev',
                reason: 'Quick action prev from agent-test console',
                params: {},
              },
              'quick-prev'
            );
          } catch (error) {
            setActionResult({ error: String(error) }, true);
          }
        });

        $('btnToolApply').addEventListener('click', function () {
          try {
            const toolName = toolNameEl.value;
            if (!toolName) {
              throw new Error('No tool selected');
            }

            const params = collectToolParams();
            const reason =
              toolReasonEl.value && toolReasonEl.value.trim()
                ? toolReasonEl.value.trim()
                : 'Manual tool call from agent-test console';

            sendControl(
              'tool.call',
              {
                toolName: toolName,
                reason: reason,
                params: params,
              },
              'tool-apply'
            );
          } catch (error) {
            setActionResult({ error: String(error) }, true);
          }
        });

        $('btnSendMessage').addEventListener('click', function () {
          try {
            const text = agentMessageTextEl.value && agentMessageTextEl.value.trim();
            if (!text) {
              throw new Error('Message text is empty');
            }

            sendControl('agent.message', { text: text }, 'agent-message');
          } catch (error) {
            setActionResult({ error: String(error) }, true);
          }
        });

        refreshAllViews();
        connect();
      })();
    </script>
  </body>
</html>`;
