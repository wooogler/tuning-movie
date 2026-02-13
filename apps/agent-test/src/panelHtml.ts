export const PANEL_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Agent Test Console</title>
    <style>
      :root {
        --bg: #f3f7fc;
        --surface: #ffffff;
        --surface-2: #f8fbff;
        --line: #d7e2ef;
        --line-strong: #b9cadf;
        --text: #10233a;
        --muted: #5b718b;
        --primary: #0b6dca;
        --primary-soft: #e9f3ff;
        --danger: #bd2130;
        --danger-soft: #ffeef0;
        --ok: #0f8a61;
        --ok-soft: #e8fff6;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: linear-gradient(180deg, #eaf1fb 0%, #f7f9fd 45%, #eef4fb 100%);
        color: var(--text);
        font-family: 'SF Pro Text', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
      }

      .shell {
        width: min(1160px, calc(100vw - 20px));
        height: calc(100vh - 20px);
        margin: 10px auto;
        border: 1px solid var(--line-strong);
        border-radius: 14px;
        background: var(--surface);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px;
        border-bottom: 1px solid var(--line);
        background: #f0f6ff;
      }

      .header h1 {
        margin: 0;
        font-size: 24px;
        line-height: 1.1;
      }

      .header p {
        margin: 6px 0 0;
        color: var(--muted);
        font-size: 14px;
      }

      .badge {
        border: 1px solid var(--line-strong);
        border-radius: 999px;
        padding: 8px 12px;
        background: #f8fbff;
        color: var(--muted);
        font-size: 13px;
        font-weight: 600;
      }

      .main {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 10px;
      }

      .surface {
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--surface-2);
        display: flex;
        flex-direction: column;
        min-height: 0;
      }

      .perception {
        flex: 6;
      }

      .action {
        flex: 4;
      }

      .surface-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        border-bottom: 1px solid var(--line);
      }

      .surface-header h2 {
        margin: 0;
        font-size: 18px;
      }

      .surface-header .hint {
        margin: 0;
        font-size: 13px;
        color: var(--muted);
      }

      .tabs {
        display: grid;
        border-bottom: 1px solid var(--line);
        background: #eef5fd;
      }

      .tabs.perception-tabs {
        grid-template-columns: repeat(5, minmax(0, 1fr));
      }

      .tabs.action-tabs {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .tab-btn {
        border: 0;
        border-right: 1px solid var(--line);
        background: transparent;
        color: var(--muted);
        font-size: 14px;
        font-weight: 700;
        padding: 11px 10px;
        cursor: pointer;
      }

      .tab-btn:last-child {
        border-right: 0;
      }

      .tab-btn.active {
        color: var(--primary);
        background: #ffffff;
      }

      .panel-wrap {
        flex: 1;
        min-height: 0;
        overflow: auto;
        padding: 10px;
      }

      .panel {
        display: none;
      }

      .panel.active {
        display: block;
      }

      .grid {
        display: grid;
        gap: 10px;
      }

      .grid.two {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .card {
        border: 1px solid var(--line);
        border-radius: 10px;
        background: #ffffff;
        padding: 10px;
      }

      .card h3 {
        margin: 0 0 8px;
        font-size: 15px;
      }

      .kv {
        display: grid;
        grid-template-columns: 180px 1fr;
        gap: 6px 8px;
        font-size: 14px;
      }

      .kv-key {
        color: var(--muted);
      }

      .mono {
        margin: 0;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #f8fbff;
        color: #162d46;
        padding: 10px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 13px;
        line-height: 1.55;
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 420px;
        overflow: auto;
      }

      .hint {
        color: var(--muted);
        font-size: 13px;
        margin: 0 0 8px;
      }

      .quick-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }

      button,
      input,
      textarea,
      select {
        width: 100%;
        border: 1px solid var(--line-strong);
        border-radius: 8px;
        font-size: 14px;
        padding: 9px 10px;
        background: #ffffff;
        color: var(--text);
      }

      button {
        cursor: pointer;
        font-weight: 700;
      }

      button:hover {
        filter: brightness(0.98);
      }

      button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      .btn-primary {
        background: var(--primary);
        border-color: #0757a0;
        color: #ffffff;
      }

      .btn-soft {
        background: var(--primary-soft);
        border-color: #b7d8f7;
        color: #0b4e8f;
      }

      .btn-danger {
        background: var(--danger-soft);
        border-color: #f4b2bb;
        color: var(--danger);
      }

      .btn-ghost {
        background: #f6faff;
        border-color: var(--line);
        color: #335173;
      }

      .row {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 10px;
      }

      .tool-param {
        margin-bottom: 8px;
      }

      .label {
        display: block;
        margin-bottom: 4px;
        font-size: 13px;
        color: var(--muted);
        font-weight: 600;
      }

      .action-result {
        margin-top: 10px;
      }

      .action-result.error {
        border-color: #ee9aa5;
        background: #fff3f5;
        color: #8b1622;
      }

      .hidden {
        display: none !important;
      }

      @media (max-width: 960px) {
        .shell {
          width: 100vw;
          height: 100vh;
          margin: 0;
          border-radius: 0;
        }

        .grid.two,
        .row,
        .quick-grid,
        .tabs.perception-tabs,
        .tabs.action-tabs {
          grid-template-columns: 1fr;
        }

        .kv {
          grid-template-columns: 140px 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="header">
        <div>
          <h1>Agent Test Console</h1>
          <p>Perception and action surface for external-agent protocol</p>
        </div>
        <span id="connBadge" class="badge">control ws: connecting...</span>
      </div>

      <div class="main">
        <section class="surface perception">
          <div class="surface-header">
            <h2>Perception</h2>
            <p class="hint">What the agent can see right now</p>
          </div>

          <div class="tabs perception-tabs">
            <button class="tab-btn active" data-p-tab="uiSpec">UI Spec</button>
            <button class="tab-btn" data-p-tab="schema">Tool Schema</button>
            <button class="tab-btn" data-p-tab="history">Message History</button>
            <button class="tab-btn" data-p-tab="status">Status</button>
            <button class="tab-btn" data-p-tab="events">Events</button>
          </div>

          <div class="panel-wrap">
            <section class="panel active" id="p-panel-uiSpec">
              <pre id="uiSpecRaw" class="mono"></pre>
            </section>

            <section class="panel" id="p-panel-schema">
              <pre id="schemaRaw" class="mono"></pre>
            </section>

            <section class="panel" id="p-panel-history">
              <pre id="historyRaw" class="mono"></pre>
            </section>

            <section class="panel" id="p-panel-status">
              <div class="grid two">
                <div class="card">
                  <h3>Recognized State</h3>
                  <div id="recognizedState" class="kv"></div>
                </div>
                <div class="card">
                  <h3>Raw Status</h3>
                  <pre id="statusRaw" class="mono"></pre>
                </div>
              </div>
            </section>

            <section class="panel" id="p-panel-events">
              <pre id="eventsRaw" class="mono"></pre>
            </section>
          </div>
        </section>

        <section class="surface action">
          <div class="surface-header">
            <h2>Action</h2>
            <button id="btnSessionEnd" class="btn-danger" style="width: auto; padding: 8px 12px;">Session End</button>
          </div>

          <div class="tabs action-tabs">
            <button class="tab-btn active" data-a-tab="interaction">GUI Interaction</button>
            <button class="tab-btn" data-a-tab="modification">GUI Modification</button>
            <button id="actionTabMessage" class="tab-btn" data-a-tab="message">Post Message</button>
          </div>

          <div class="panel-wrap">
            <section class="panel active" id="a-panel-interaction">
              <p class="hint">Only tools currently allowed in tool schema are shown.</p>

              <div id="interactionEmpty" class="card hidden">
                <p class="hint" style="margin: 0;">No GUI interaction tools are currently available.</p>
              </div>

              <div id="interactionRowNextPrev" class="row hidden">
                <button id="btnToolNext" class="btn-soft">next</button>
                <button id="btnToolPrev" class="btn-soft">prev</button>
              </div>

              <div id="interactionSelectSection" class="card hidden" style="margin-bottom: 10px;">
                <h3 style="margin-bottom: 6px;">select</h3>
                <p class="hint">Click an item to send <code>tool.call(select)</code>.</p>
                <div id="quickSelect" class="quick-grid"></div>
              </div>

              <div id="interactionSetQtySection" class="card hidden">
                <h3 style="margin-bottom: 6px;">setQuantity</h3>
                <div class="tool-param">
                  <label class="label" for="setQuantityTypeId">typeId</label>
                  <input id="setQuantityTypeId" placeholder="ticket type id" />
                </div>
                <div class="tool-param">
                  <label class="label" for="setQuantityQty">quantity</label>
                  <input id="setQuantityQty" type="number" min="0" step="1" value="1" />
                </div>
                <button id="btnSetQuantity" class="btn-primary">Apply setQuantity</button>
              </div>
            </section>

            <section class="panel" id="a-panel-modification">
              <p class="hint">Only modification tools currently allowed in tool schema are shown.</p>

              <div id="modEmpty" class="card hidden">
                <p class="hint" style="margin: 0;">No GUI modification tools are currently available.</p>
              </div>

              <div id="modMain" class="hidden">
                <div class="tool-param">
                  <label class="label" for="modToolName">Tool</label>
                  <select id="modToolName"></select>
                </div>

                <div class="tool-param">
                  <label class="label" for="modReason">Reason</label>
                  <input id="modReason" value="Manual GUI modification from agent-test console" />
                </div>

                <div id="modParamsWrap"></div>

                <button id="btnApplyModification" class="btn-primary">Apply Modification</button>
              </div>

              <div id="clearModSection" class="card hidden" style="margin-top: 10px;">
                <h3 style="margin-bottom: 6px;">clearModification</h3>
                <div class="row" style="margin-bottom: 8px;">
                  <select id="clearModType">
                    <option value="all">all</option>
                    <option value="filter">filter</option>
                    <option value="sort">sort</option>
                    <option value="highlight">highlight</option>
                    <option value="augment">augment</option>
                  </select>
                  <button id="btnClearModification" class="btn-soft">Clear</button>
                </div>
              </div>
            </section>

            <section class="panel" id="a-panel-message">
              <p class="hint">Post explanation or intent to the chat timeline.</p>
              <p id="messageUnavailableHint" class="hint hidden">Tool <code>postMessage</code> is not currently available.</p>
              <div class="tool-param">
                <label class="label" for="agentMessageText">Message</label>
                <textarea id="agentMessageText" placeholder="I selected a movie and will proceed to theater selection."></textarea>
              </div>
              <button id="btnSendMessage" class="btn-primary">Send agent.message</button>
            </section>

            <pre id="actionResult" class="mono action-result"></pre>
          </div>
        </section>
      </div>
    </div>

    <script>
      (function () {
        var $ = function (id) {
          return document.getElementById(id);
        };

        var connBadgeEl = $('connBadge');
        var statusRawEl = $('statusRaw');
        var recognizedStateEl = $('recognizedState');
        var uiSpecRawEl = $('uiSpecRaw');
        var historyRawEl = $('historyRaw');
        var schemaRawEl = $('schemaRaw');
        var eventsRawEl = $('eventsRaw');
        var quickSelectEl = $('quickSelect');

        var actionResultEl = $('actionResult');
        var btnSessionEndEl = $('btnSessionEnd');

        var btnToolNextEl = $('btnToolNext');
        var btnToolPrevEl = $('btnToolPrev');
        var btnSetQuantityEl = $('btnSetQuantity');
        var setQuantityTypeIdEl = $('setQuantityTypeId');
        var setQuantityQtyEl = $('setQuantityQty');

        var modToolNameEl = $('modToolName');
        var modReasonEl = $('modReason');
        var modParamsWrapEl = $('modParamsWrap');
        var btnApplyModificationEl = $('btnApplyModification');
        var clearModTypeEl = $('clearModType');
        var btnClearModificationEl = $('btnClearModification');

        var agentMessageTextEl = $('agentMessageText');
        var btnSendMessageEl = $('btnSendMessage');
        var actionTabMessageEl = $('actionTabMessage');
        var messageUnavailableHintEl = $('messageUnavailableHint');

        var interactionEmptyEl = $('interactionEmpty');
        var interactionRowNextPrevEl = $('interactionRowNextPrev');
        var interactionSelectSectionEl = $('interactionSelectSection');
        var interactionSetQtySectionEl = $('interactionSetQtySection');

        var modEmptyEl = $('modEmpty');
        var modMainEl = $('modMain');
        var clearModSectionEl = $('clearModSection');

        var ws = null;
        var seq = 0;
        var status = {};
        var snapshot = null;
        var events = [];

        var modParamValues = {};

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
            connBadgeEl.style.background = 'var(--ok-soft)';
            connBadgeEl.style.borderColor = '#8fdfc2';
            connBadgeEl.style.color = 'var(--ok)';
          } else {
            connBadgeEl.style.background = 'var(--danger-soft)';
            connBadgeEl.style.borderColor = '#efb6bd';
            connBadgeEl.style.color = 'var(--danger)';
          }
        }

        function getUiSpec() {
          var snap = asObj(snapshot);
          if (!snap) return null;
          return snap.uiSpec || null;
        }

        function getMessageHistory() {
          var snap = asObj(snapshot);
          if (!snap) return [];
          return asArray(snap.messageHistory);
        }

        function getToolSchema() {
          var snap = asObj(snapshot);
          if (!snap) return [];
          return asArray(snap.toolSchema);
        }

        function findToolDefinition(toolName) {
          var schema = getToolSchema();
          for (var i = 0; i < schema.length; i += 1) {
            var def = asObj(schema[i]);
            if (!def || typeof def.name !== 'string') continue;
            if (def.name === toolName) return def;
          }
          return null;
        }

        function hasTool(toolName) {
          return Boolean(findToolDefinition(toolName));
        }

        function setActivePerceptionTab(tabName) {
          document.querySelectorAll('[data-p-tab]').forEach(function (btn) {
            btn.classList.toggle('active', btn.getAttribute('data-p-tab') === tabName);
          });

          document.querySelectorAll('[id^="p-panel-"]').forEach(function (panel) {
            panel.classList.toggle('active', panel.id === 'p-panel-' + tabName);
          });
        }

        function setActiveActionTab(tabName) {
          document.querySelectorAll('[data-a-tab]').forEach(function (btn) {
            btn.classList.toggle('active', btn.getAttribute('data-a-tab') === tabName);
          });

          document.querySelectorAll('[id^="a-panel-"]').forEach(function (panel) {
            panel.classList.toggle('active', panel.id === 'a-panel-' + tabName);
          });
        }

        function setActionResult(payload, isError) {
          actionResultEl.classList.toggle('error', Boolean(isError));
          actionResultEl.textContent = toJson(payload);
        }

        function sendControl(type, payload) {
          if (!ws || ws.readyState !== WebSocket.OPEN) {
            throw new Error('control ws is not connected');
          }

          var id = nextId('c');
          ws.send(JSON.stringify({ type: type, id: id, payload: payload || {} }));
          return id;
        }

        function sendToolCall(toolName, params, reason) {
          return sendControl('tool.call', {
            toolName: toolName,
            params: params || {},
            reason: reason || 'Manual tool call from agent-test console',
          });
        }

        function parseArrayInput(raw) {
          try {
            var parsed = JSON.parse(raw);
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

        function renderPerception() {
          var uiSpec = asObj(getUiSpec());
          var state = asObj(uiSpec ? uiSpec.state : null);
          var selected = asObj(state ? state.selected : null);
          var selectedList = state ? asArray(state.selectedList) : [];
          var visibleItems = uiSpec ? asArray(uiSpec.visibleItems) : [];
          var quantities = state ? asArray(state.quantities) : [];
          var messageHistory = getMessageHistory();
          var toolSchema = getToolSchema();

          var ticketTotal = 0;
          quantities.forEach(function (entry) {
            var row = asObj(entry);
            if (!row) return;
            if (typeof row.count === 'number' && Number.isFinite(row.count)) {
              ticketTotal += row.count;
            }
          });

          var rows = [
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
              return '<div class="kv-key">' + escapeHtml(row[0]) + '</div><div>' + escapeHtml(row[1]) + '</div>';
            })
            .join('');

          statusRawEl.textContent = toJson(status || {});
          uiSpecRawEl.textContent = toJson(getUiSpec());
          schemaRawEl.textContent = toJson(getToolSchema());
          historyRawEl.textContent = toJson(getMessageHistory());
          eventsRawEl.textContent = toJson(events.slice(-150));
        }

        function renderQuickSelect() {
          if (!hasTool('select')) {
            quickSelectEl.innerHTML = '<p class="hint" style="margin:0;">Tool <code>select</code> is not available.</p>';
            return;
          }

          var uiSpec = asObj(getUiSpec());
          var visibleItems = uiSpec ? asArray(uiSpec.visibleItems) : [];
          if (visibleItems.length === 0) {
            quickSelectEl.innerHTML = '<p class="hint" style="margin:0;">No visible items in current UI Spec.</p>';
            return;
          }

          var html = visibleItems.slice(0, 14).map(function (item) {
            var row = asObj(item);
            if (!row || typeof row.id !== 'string') return '';
            var label = typeof row.value === 'string' && row.value.trim() ? row.value.trim() : row.id;
            return '<button class="btn-ghost" data-select-id="' + escapeHtml(row.id) + '">' + escapeHtml(label) + '</button>';
          });

          quickSelectEl.innerHTML = html.join('');
        }

        function getAvailableModificationTools() {
          var all = ['filter', 'sort', 'highlight', 'augment'];
          return all.filter(function (name) {
            return hasTool(name);
          });
        }

        function renderModToolSelector() {
          var available = getAvailableModificationTools();
          var current = modToolNameEl.value;

          modToolNameEl.innerHTML = '';
          available.forEach(function (name) {
            var option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            modToolNameEl.appendChild(option);
          });

          if (current && available.indexOf(current) !== -1) {
            modToolNameEl.value = current;
          } else if (available.length > 0) {
            modToolNameEl.value = available[0];
            modParamValues = {};
          }

          renderModParams();
        }

        function renderModParams() {
          modParamsWrapEl.innerHTML = '';

          var toolName = modToolNameEl.value;
          if (!toolName) return;

          var toolDef = findToolDefinition(toolName);
          var params = asObj(toolDef ? toolDef.parameters : null);

          if (!params || Object.keys(params).length === 0) {
            modParamsWrapEl.innerHTML = '<p class="hint">This tool has no parameters.</p>';
            return;
          }

          Object.keys(params).forEach(function (paramName) {
            var paramDef = asObj(params[paramName]) || {};
            var type = typeof paramDef.type === 'string' ? paramDef.type : 'string';
            var optional = Boolean(paramDef.optional);
            var description = typeof paramDef.description === 'string' ? paramDef.description : paramName;
            var enumValues = asArray(paramDef.enum);

            var wrapper = document.createElement('div');
            wrapper.className = 'tool-param';

            var label = document.createElement('label');
            label.className = 'label';
            label.textContent = paramName + (optional ? ' (optional)' : '');
            wrapper.appendChild(label);

            var input;
            if (enumValues.length > 0) {
              var select = document.createElement('select');
              var empty = document.createElement('option');
              empty.value = '';
              empty.textContent = 'Select...';
              select.appendChild(empty);

              enumValues.forEach(function (value) {
                var option = document.createElement('option');
                option.value = String(value);
                option.textContent = String(value);
                select.appendChild(option);
              });

              select.value = modParamValues[paramName] || '';
              input = select;
            } else if (type === 'array' || type === 'object') {
              var textarea = document.createElement('textarea');
              textarea.placeholder = description;
              textarea.value = modParamValues[paramName] || '';
              input = textarea;
            } else {
              var text = document.createElement('input');
              text.type = type === 'number' ? 'number' : 'text';
              text.placeholder = description;
              text.value = modParamValues[paramName] || '';
              input = text;
            }

            input.setAttribute('data-param-name', paramName);
            input.setAttribute('data-param-type', type);
            input.setAttribute('data-param-optional', optional ? 'true' : 'false');
            input.addEventListener('input', function (event) {
              var target = event.target;
              if (!target) return;
              modParamValues[paramName] = target.value;
            });

            wrapper.appendChild(input);
            modParamsWrapEl.appendChild(wrapper);
          });
        }

        function collectModParams() {
          var toolName = modToolNameEl.value;
          var toolDef = findToolDefinition(toolName);
          var paramsDef = asObj(toolDef ? toolDef.parameters : null);
          var result = {};
          if (!paramsDef) return result;

          var names = Object.keys(paramsDef);
          for (var i = 0; i < names.length; i += 1) {
            var paramName = names[i];
            var paramDef = asObj(paramsDef[paramName]) || {};
            var type = typeof paramDef.type === 'string' ? paramDef.type : 'string';
            var optional = Boolean(paramDef.optional);
            var raw = modParamValues[paramName];

            if ((raw === undefined || raw === '') && !optional) {
              throw new Error('Missing required parameter: ' + paramName);
            }

            if (raw === undefined || raw === '') continue;

            if (type === 'number') {
              var parsedNum = Number(raw);
              if (Number.isNaN(parsedNum)) {
                throw new Error('Invalid number for parameter: ' + paramName);
              }
              result[paramName] = parsedNum;
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

        function renderAction() {
          var hasNext = hasTool('next');
          var hasPrev = hasTool('prev');
          var hasSelect = hasTool('select');
          var hasSetQuantity = hasTool('setQuantity');
          var hasPostMessage = hasTool('postMessage');

          interactionRowNextPrevEl.classList.toggle('hidden', !(hasNext || hasPrev));
          btnToolNextEl.classList.toggle('hidden', !hasNext);
          btnToolPrevEl.classList.toggle('hidden', !hasPrev);

          interactionSelectSectionEl.classList.toggle('hidden', !hasSelect);
          interactionSetQtySectionEl.classList.toggle('hidden', !hasSetQuantity);
          interactionEmptyEl.classList.toggle('hidden', hasNext || hasPrev || hasSelect || hasSetQuantity);

          var modTools = getAvailableModificationTools();
          var hasClear = hasTool('clearModification');

          modMainEl.classList.toggle('hidden', modTools.length === 0);
          clearModSectionEl.classList.toggle('hidden', !hasClear);
          modEmptyEl.classList.toggle('hidden', modTools.length > 0 || hasClear);

          actionTabMessageEl.classList.toggle('hidden', !hasPostMessage);
          messageUnavailableHintEl.classList.toggle('hidden', hasPostMessage);
          btnSendMessageEl.disabled = !hasPostMessage;
          agentMessageTextEl.disabled = !hasPostMessage;
          if (!hasPostMessage && document.getElementById('a-panel-message').classList.contains('active')) {
            setActiveActionTab('interaction');
          }

          renderQuickSelect();
          renderModToolSelector();
        }

        function refreshAllViews() {
          renderPerception();
          renderAction();
        }

        function connect() {
          var protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
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
            var message;
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
              if (message.payload && Object.prototype.hasOwnProperty.call(message.payload, 'snapshot')) {
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
              var item = message.payload ? message.payload.event : null;
              if (item) {
                events.push(item);
                if (events.length > 500) {
                  events = events.slice(-500);
                }
              }
              renderPerception();
              return;
            }

            if (message.type === 'control.result') {
              setActionResult(
                {
                  type: message.type,
                  replyTo: message.replyTo || null,
                  payload: message.payload || {},
                },
                false
              );
              refreshAllViews();
              return;
            }

            if (message.type === 'control.error') {
              setActionResult(
                {
                  type: message.type,
                  replyTo: message.replyTo || null,
                  payload: message.payload || {},
                },
                true
              );
              refreshAllViews();
            }
          };
        }

        document.querySelectorAll('[data-p-tab]').forEach(function (button) {
          button.addEventListener('click', function () {
            var tab = button.getAttribute('data-p-tab');
            if (!tab) return;
            setActivePerceptionTab(tab);
          });
        });

        document.querySelectorAll('[data-a-tab]').forEach(function (button) {
          button.addEventListener('click', function () {
            var tab = button.getAttribute('data-a-tab');
            if (!tab) return;
            setActiveActionTab(tab);
          });
        });

        quickSelectEl.addEventListener('click', function (event) {
          var target = event.target;
          if (!target || !target.getAttribute) return;

          var itemId = target.getAttribute('data-select-id');
          if (!itemId) return;

          try {
            if (!hasTool('select')) {
              throw new Error('Tool select is not currently available.');
            }
            sendToolCall('select', { itemId: itemId }, 'Quick select from UI Spec visibleItems');
          } catch (error) {
            setActionResult({ error: String(error) }, true);
          }
        });

        modToolNameEl.addEventListener('change', function () {
          modParamValues = {};
          renderModParams();
        });

        btnToolNextEl.addEventListener('click', function () {
          try {
            if (!hasTool('next')) {
              throw new Error('Tool next is not currently available.');
            }
            sendToolCall('next', {}, 'Quick interaction: next');
          } catch (error) {
            setActionResult({ error: String(error) }, true);
          }
        });

        btnToolPrevEl.addEventListener('click', function () {
          try {
            if (!hasTool('prev')) {
              throw new Error('Tool prev is not currently available.');
            }
            sendToolCall('prev', {}, 'Quick interaction: prev');
          } catch (error) {
            setActionResult({ error: String(error) }, true);
          }
        });

        btnSetQuantityEl.addEventListener('click', function () {
          try {
            if (!hasTool('setQuantity')) {
              throw new Error('Tool setQuantity is not currently available.');
            }

            var typeId = setQuantityTypeIdEl.value && setQuantityTypeIdEl.value.trim();
            if (!typeId) throw new Error('typeId is required');

            var quantity = Number(setQuantityQtyEl.value);
            if (!Number.isInteger(quantity) || quantity < 0) {
              throw new Error('quantity must be an integer >= 0');
            }

            sendToolCall('setQuantity', { typeId: typeId, quantity: quantity }, 'GUI interaction: setQuantity');
          } catch (error) {
            setActionResult({ error: String(error) }, true);
          }
        });

        btnApplyModificationEl.addEventListener('click', function () {
          try {
            var toolName = modToolNameEl.value;
            if (!toolName) {
              throw new Error('No modification tool selected.');
            }
            if (!hasTool(toolName)) {
              throw new Error('Tool ' + toolName + ' is not currently available.');
            }

            var params = collectModParams();
            var reason = modReasonEl.value && modReasonEl.value.trim()
              ? modReasonEl.value.trim()
              : 'Manual GUI modification from agent-test console';

            sendToolCall(toolName, params, reason);
          } catch (error) {
            setActionResult({ error: String(error) }, true);
          }
        });

        btnClearModificationEl.addEventListener('click', function () {
          try {
            if (!hasTool('clearModification')) {
              throw new Error('Tool clearModification is not currently available.');
            }

            var type = clearModTypeEl.value || 'all';
            sendToolCall('clearModification', { type: type }, 'Clear GUI modification');
          } catch (error) {
            setActionResult({ error: String(error) }, true);
          }
        });

        btnSendMessageEl.addEventListener('click', function () {
          try {
            if (!hasTool('postMessage')) {
              throw new Error('Tool postMessage is not currently available.');
            }
            var text = agentMessageTextEl.value && agentMessageTextEl.value.trim();
            if (!text) {
              throw new Error('Message text is empty');
            }

            sendToolCall('postMessage', { text: text }, 'Post message to chat timeline');
          } catch (error) {
            setActionResult({ error: String(error) }, true);
          }
        });

        btnSessionEndEl.addEventListener('click', function () {
          try {
            sendControl('session.end', { reason: 'manual-stop' });
          } catch (error) {
            setActionResult({ error: String(error) }, true);
          }
        });

        setActivePerceptionTab('uiSpec');
        setActiveActionTab('interaction');
        refreshAllViews();
        connect();
      })();
    </script>
  </body>
</html>`;
