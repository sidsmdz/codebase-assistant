import { EventDispatcher } from './EventDispatcher';

interface GridUpdateMessage {
    gridId: string;
    updateType: string;
    rows?: any[];
    totalCount?: number;
}

interface LayoutUpdateMessage {
    screenId: string;
    updateType: string;
    components?: any[];
}

interface ActionResponseMessage {
    resultType: string;
    success: boolean;
    payload?: any;
}

export class MessageHandler {
    private eventDispatcher: EventDispatcher;

    constructor(eventDispatcher: EventDispatcher) {
        this.eventDispatcher = eventDispatcher;
    }

    handleGridUpdate(gridId: string, message: GridUpdateMessage): void {
        switch (message.updateType) {
            case 'DATA_REFRESH':
                this.eventDispatcher.dispatch('GRID_DATA_REFRESH', {
                    gridId,
                    rows: message.rows,
                    totalCount: message.totalCount
                });
                break;
            case 'ROW_UPDATE':
                this.eventDispatcher.dispatch('GRID_ROW_UPDATE', {
                    gridId,
                    rows: message.rows
                });
                break;
            case 'SORT_COMPLETE':
                this.eventDispatcher.dispatch('GRID_SORT_COMPLETE', {
                    gridId,
                    rows: message.rows,
                    totalCount: message.totalCount
                });
                break;
        }
    }

    handleLayoutUpdate(message: LayoutUpdateMessage): void {
        switch (message.updateType) {
            case 'COMPONENT_CHANGE':
                this.eventDispatcher.dispatch('LAYOUT_COMPONENT_CHANGE', {
                    screenId: message.screenId,
                    components: message.components
                });
                break;
            case 'FULL_REFRESH':
                this.eventDispatcher.dispatch('LAYOUT_FULL_REFRESH', {
                    screenId: message.screenId
                });
                break;
        }
    }

    handleActionResponse(message: ActionResponseMessage): void {
        if (message.success) {
            this.eventDispatcher.dispatch('ACTION_SUCCESS', {
                resultType: message.resultType,
                payload: message.payload
            });
        } else {
            this.eventDispatcher.dispatch('ACTION_FAILURE', {
                resultType: message.resultType
            });
        }
    }
}
