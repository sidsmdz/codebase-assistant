/**
 * TypeScript type definitions for SDUI Broker protocol
 */

export enum MessageType {
    UI_RENDER = 'UI_RENDER',
    UI_EVENT = 'UI_EVENT',
    UI_ACTION = 'UI_ACTION',
    STATE_SYNC = 'STATE_SYNC',
    HEARTBEAT = 'HEARTBEAT',
    ERROR = 'ERROR',
    CONNECTION_ACK = 'CONNECTION_ACK'
}

export interface BrokerMessage {
    messageId: string;
    timestamp: number;
    type: MessageType | string;
    payload: string;
    metadata: Record<string, string>;
}

// UI Render payload
export interface UIRenderPayload {
    layoutId: string;
    components: Component[];
    mode: 'FULL_RENDER' | 'DELTA_RENDER' | 'APPEND';
    timestamp: number;
}

// Component definition
export interface Component {
    id: string;
    type: ComponentType;
    props?: Record<string, string>;
    children?: Component[];
    gridConfig?: GridConfig;
    drawerConfig?: DrawerConfig;
    modalConfig?: ModalConfig;
    formConfig?: FormConfig;
}

export enum ComponentType {
    // Grids
    CLIENT_SIDE_GRID = 'CLIENT_SIDE_GRID',
    SERVER_SIDE_GRID = 'SERVER_SIDE_GRID',
    EDITABLE_GRID = 'EDITABLE_GRID',
    MASTER_DETAIL_GRID = 'MASTER_DETAIL_GRID',

    // Layout
    DRAWER = 'DRAWER',
    MODAL = 'MODAL',
    OVERLAY = 'OVERLAY',
    TABS = 'TABS',
    ACCORDION = 'ACCORDION',
    STEPPER = 'STEPPER',

    // Forms
    TEXT_INPUT = 'TEXT_INPUT',
    NUMBER_INPUT = 'NUMBER_INPUT',
    SELECT = 'SELECT',
    AUTOCOMPLETE = 'AUTOCOMPLETE',
    DATE_PICKER = 'DATE_PICKER',
    FILE_UPLOAD = 'FILE_UPLOAD',
    FORM = 'FORM',

    // Data Viz
    LINE_CHART = 'LINE_CHART',
    BAR_CHART = 'BAR_CHART',
    PIE_CHART = 'PIE_CHART',
    KPI_CARD = 'KPI_CARD',

    // Basic
    BUTTON = 'BUTTON',
    TEXT = 'TEXT',
    CONTAINER = 'CONTAINER',
    DIVIDER = 'DIVIDER'
}

// Grid configuration
export interface GridConfig {
    mode: 'CLIENT_SIDE' | 'SERVER_SIDE' | 'INFINITE_SCROLL';
    columns: ColumnDef[];
    rows?: GridRow[];
    serverSideConfig?: ServerSideConfig;
    rowStyleMode?: 'CLASS_BASED' | 'COLOR_BASED' | 'RULE_BASED';
    rowStyleRules?: RowStyleRule[];
    enableFiltering?: boolean;
    enableSorting?: boolean;
    pagination?: boolean;
    pageSize?: number;
}

export interface ColumnDef {
    field: string;
    headerName: string;
    type: string;
    sortable: boolean;
    filterable: boolean;
    width: number;
    editable?: boolean;
}

export interface GridRow {
    id: string;
    data: Record<string, string>;
    rowClass?: string;
    rowColor?: string;
    cellColors?: Record<string, string>;
}

export interface ServerSideConfig {
    dataSourceUrl: string;
    cacheBlockSize: number;
    maxBlocksInCache: number;
}

export interface RowStyleRule {
    condition: string;
    className: string;
    color: string;
}

// Drawer configuration
export interface DrawerConfig {
    position: 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM';
    width: number;
    isOpen: boolean;
    openMode: 'ACTION_BASED' | 'RENDER_BASED' | 'STATE_BASED';
    backdrop?: boolean;
    closeOnBackdrop?: boolean;
}

// Modal configuration
export interface ModalConfig {
    title: string;
    width: number;
    height: number;
    backdrop: boolean;
    closeOnBackdrop: boolean;
    closeOnEscape?: boolean;
}

// Form configuration
export interface FormConfig {
    formId: string;
    fields: FormField[];
    validationMode: 'INLINE' | 'BATCH' | 'REALTIME_DEBOUNCED';
    submitAction: string;
}

export interface FormField {
    fieldId: string;
    label: string;
    inputType: string;
    required: boolean;
    value?: string;
}

// UI Action payload
export interface UIActionPayload {
    actionId: string;
    actionType: string;
    targetComponentId: string;
    params: Record<string, string>;
}

export enum ActionType {
    OPEN_DRAWER = 'OPEN_DRAWER',
    CLOSE_DRAWER = 'CLOSE_DRAWER',
    OPEN_MODAL = 'OPEN_MODAL',
    CLOSE_MODAL = 'CLOSE_MODAL',
    SHOW_TOAST = 'SHOW_TOAST',
    NAVIGATE = 'NAVIGATE',
    SCROLL_TO = 'SCROLL_TO',
    FOCUS_FIELD = 'FOCUS_FIELD',
    SHOW_VALIDATION = 'SHOW_VALIDATION',
    UPDATE_CELL = 'UPDATE_CELL'
}

// State sync payload
export interface StateSyncPayload {
    stateId: string;
    stateType: string;
    stateData: string;
    direction: 'CLIENT_TO_SERVER' | 'SERVER_TO_CLIENT';
}

// Event types
export enum EventType {
    BUTTON_CLICK = 'BUTTON_CLICK',
    ROW_SELECTED = 'ROW_SELECTED',
    ROW_EDITED = 'ROW_EDITED',
    INPUT_CHANGED = 'INPUT_CHANGED',
    FORM_SUBMITTED = 'FORM_SUBMITTED',
    TAB_CHANGED = 'TAB_CHANGED',
    DRAWER_OPENED = 'DRAWER_OPENED',
    DRAWER_CLOSED = 'DRAWER_CLOSED',
    MODAL_OPENED = 'MODAL_OPENED',
    MODAL_CLOSED = 'MODAL_CLOSED',
    FILTER_CHANGED = 'FILTER_CHANGED',
    SORT_CHANGED = 'SORT_CHANGED',
    PAGE_CHANGED = 'PAGE_CHANGED'
}
