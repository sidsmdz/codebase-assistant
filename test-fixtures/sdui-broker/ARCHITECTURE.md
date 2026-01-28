# SDUI Broker Architecture - Complete E2E Feature Tracking System

## Overview

A production-grade Server-Driven UI system with WebSocket broker for real-time bidirectional communication between Java backend and React TypeScript thin client.

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    React Thin Client                         │
│  - Component Registry (AG Grid, Drawer, Modal, Overlay)     │
│  - WebSocket Client                                          │
│  - Event Dispatcher                                          │
│  - State Manager (UI State only)                            │
└──────────────────────┬──────────────────────────────────────┘
                       │ WebSocket (JSON/Binary)
┌──────────────────────▼──────────────────────────────────────┐
│                  WebSocket Broker                            │
│  - Message Router                                            │
│  - Session Manager                                           │
│  - Protocol Handler (RENDER, EVENT, ACTION, STATE_SYNC)     │
│  - Compression/Serialization                                 │
└──────────────────────┬──────────────────────────────────────┘
                       │ Internal Event Bus
┌──────────────────────▼──────────────────────────────────────┐
│                Java SDUI Backend                             │
│  - Layout Controller (generates UI definitions)             │
│  - Event Processor (handles client events)                  │
│  - Side Effect Engine (server-triggered UI updates)         │
│  - Business Logic Layer                                      │
│  - Data Access Layer                                         │
└─────────────────────────────────────────────────────────────┘
```

## Component Types

### 1. AG Grid Components
- **Client-Side Grid**: Data sent to client, filtering/sorting on client
- **Server-Side Grid**: Virtual scrolling, filtering/sorting on server
- **Editable Grid**: Cell editing with server validation
- **Master-Detail Grid**: Expandable rows with nested grids

### 2. Layout Components
- **Drawer**: Side panels (left/right/top/bottom)
- **Modal**: Blocking dialogs with backdrop
- **Overlay**: Non-blocking overlays (tooltips, popovers)
- **Tabs**: Tabbed navigation with lazy loading
- **Accordion**: Collapsible sections
- **Stepper**: Multi-step workflows

### 3. Form Components
- **Input Fields**: Text, number, date, select
- **Validation**: Client + server validation
- **Auto-complete**: Server-backed suggestions
- **File Upload**: Chunked upload with progress

### 4. Data Visualization
- **Charts**: Line, bar, pie (using Recharts)
- **KPI Cards**: Real-time metrics
- **Progress Bars**: Task completion

## WebSocket Protocol

### Message Types

#### 1. UI_RENDER (Server → Client)
Server sends complete UI definition to render:
```json
{
  "type": "UI_RENDER",
  "messageId": "msg_123",
  "timestamp": 1234567890,
  "payload": {
    "layoutId": "layout_456",
    "components": [...],
    "animations": {...},
    "metadata": {...}
  }
}
```

#### 2. UI_EVENT (Client → Server)
Client sends user interaction events:
```json
{
  "type": "UI_EVENT",
  "messageId": "msg_124",
  "timestamp": 1234567891,
  "payload": {
    "eventType": "BUTTON_CLICK | ROW_SELECTED | INPUT_CHANGED",
    "componentId": "grid_users",
    "data": {...}
  }
}
```

#### 3. UI_ACTION (Server → Client)
Server sends non-rendering actions (open drawer, show toast):
```json
{
  "type": "UI_ACTION",
  "messageId": "msg_125",
  "timestamp": 1234567892,
  "payload": {
    "action": "OPEN_DRAWER | SHOW_TOAST | NAVIGATE",
    "target": "drawer_notifications",
    "params": {...}
  }
}
```

#### 4. STATE_SYNC (Bidirectional)
Synchronize state between client and server:
```json
{
  "type": "STATE_SYNC",
  "messageId": "msg_126",
  "timestamp": 1234567893,
  "payload": {
    "stateType": "GRID_FILTERS | FORM_DATA | USER_PREFERENCES",
    "data": {...}
  }
}
```

#### 5. HEARTBEAT (Bidirectional)
Keep connection alive:
```json
{
  "type": "HEARTBEAT",
  "messageId": "msg_127",
  "timestamp": 1234567894
}
```

## Trigger Flows

### Flow 1: UI-Triggered Rendering (Client → Server → Client)
```
1. User clicks "Load Users" button
2. Client sends UI_EVENT (BUTTON_CLICK)
3. Broker routes to EventProcessor
4. Backend processes event, queries database
5. LayoutController generates AG Grid definition
6. Broker sends UI_RENDER to client
7. Client renders AG Grid with data
```

### Flow 2: Server-Triggered Rendering (Server → Client)
```
1. Background job completes (e.g., report generation)
2. SideEffectEngine detects completion
3. LayoutController generates notification drawer
4. Broker sends UI_ACTION (OPEN_DRAWER) + UI_RENDER
5. Client opens drawer and renders notification list
```

### Flow 3: Real-Time Data Update (Server → Client)
```
1. Database record changes (via CDC or polling)
2. SideEffectEngine emits update event
3. LayoutController generates partial UI update
4. Broker sends UI_RENDER (delta update)
5. Client merges update and re-renders affected components
```

### Flow 4: Validation Flow (Client → Server → Client)
```
1. User types in form field
2. Client sends UI_EVENT (INPUT_CHANGED) with debounce
3. Backend validates input (e.g., check username availability)
4. LayoutController generates validation message
5. Broker sends UI_ACTION (SHOW_VALIDATION)
6. Client displays inline validation error/success
```

## Redundant Patterns (for Testing)

### Pattern Group 1: Grid Row Styling
- **Pattern A**: Server assigns row classes (premium-user-blue)
- **Pattern B**: Server sends row colors directly (color: #e3f2fd)
- **Pattern C**: Server sends conditional rules (if premium then blue)
Both achieve same visual result, test pattern discovery

### Pattern Group 2: Drawer Opening
- **Pattern A**: UI_ACTION with OPEN_DRAWER
- **Pattern B**: UI_RENDER with drawer in components
- **Pattern C**: Client-side state change triggered by event
All open drawer, different mechanisms

### Pattern Group 3: Form Validation
- **Pattern A**: Inline validation on INPUT_CHANGED
- **Pattern B**: Batch validation on FORM_SUBMIT
- **Pattern C**: Real-time validation with debounce
Multiple validation strategies

### Pattern Group 4: Data Loading
- **Pattern A**: Client-side grid with all data upfront
- **Pattern B**: Server-side grid with virtual scrolling
- **Pattern C**: Infinite scroll with pagination
Different data loading patterns

## File Structure

```
test-fixtures/sdui-broker/
├── ARCHITECTURE.md                 # This file
├── protocols/
│   ├── websocket-protocol.proto   # Protocol definitions
│   └── message-schemas.json       # JSON schemas
├── backend/
│   ├── broker/
│   │   ├── WebSocketBroker.java
│   │   ├── MessageRouter.java
│   │   ├── SessionManager.java
│   │   └── ProtocolHandler.java
│   ├── sdui/
│   │   ├── LayoutController.java
│   │   ├── EventProcessor.java
│   │   ├── SideEffectEngine.java
│   │   └── ComponentBuilder.java
│   ├── domain/
│   │   ├── User.java
│   │   ├── Order.java
│   │   └── Notification.java
│   └── service/
│       ├── UserService.java
│       └── OrderService.java
├── frontend/
│   ├── src/
│   │   ├── broker/
│   │   │   ├── WebSocketClient.ts
│   │   │   ├── MessageHandler.ts
│   │   │   └── EventDispatcher.ts
│   │   ├── components/
│   │   │   ├── SDUIRenderer.tsx
│   │   │   ├── grids/
│   │   │   │   ├── ClientSideGrid.tsx
│   │   │   │   ├── ServerSideGrid.tsx
│   │   │   │   └── EditableGrid.tsx
│   │   │   ├── layout/
│   │   │   │   ├── Drawer.tsx
│   │   │   │   ├── Modal.tsx
│   │   │   │   ├── Overlay.tsx
│   │   │   │   └── Tabs.tsx
│   │   │   └── forms/
│   │   │       ├── FormField.tsx
│   │   │       └── Validation.tsx
│   │   ├── registry/
│   │   │   └── ComponentRegistry.ts
│   │   └── App.tsx
│   └── package.json
└── tests/
    └── end-to-end-tracking.test.ts
```

## Testing Strategy

### 1. Pattern Discovery Tests
- Discover all grid row styling patterns (A, B, C)
- Discover all drawer opening patterns
- Discover all validation patterns
- Verify pattern equivalence

### 2. Feature Tracking Tests
- Trace UI-triggered flow end-to-end
- Trace server-triggered flow end-to-end
- Trace validation flow across layers
- Verify all touchpoints found

### 3. Cross-Language Tests
- TypeScript client → WebSocket → Java backend
- Track message flow through broker
- Verify protocol adherence

### 4. Redundancy Tests
- Find all implementations of same feature
- Group equivalent patterns
- Suggest best practice pattern

## Success Metrics

- ✅ All component types implemented and testable
- ✅ Both UI-triggered and server-triggered flows work
- ✅ Multiple patterns for same feature discoverable
- ✅ Feature tracking traces complete end-to-end flow
- ✅ WebSocket broker handles all message types
- ✅ Client renders all SDUI components correctly
