interface LayoutComponent {
    id: string;
    type: string;
    config: Record<string, any>;
    children: string[];
}

interface Layout {
    screenId: string;
    title: string;
    theme: string;
    components: LayoutComponent[];
}

export class LayoutBuilder {
    private screenId: string = '';
    private title: string = '';
    private theme: string = 'default';
    private components: LayoutComponent[] = [];

    withScreenId(screenId: string): LayoutBuilder {
        this.screenId = screenId;
        return this;
    }

    withTitle(title: string): LayoutBuilder {
        this.title = title;
        return this;
    }

    withTheme(theme: string): LayoutBuilder {
        this.theme = theme;
        return this;
    }

    addComponent(id: string, type: string, config: Record<string, any> = {}, children: string[] = []): LayoutBuilder {
        this.components.push({ id, type, config, children });
        return this;
    }

    addGrid(id: string, columns: any[], serverSide: boolean = false): LayoutBuilder {
        return this.addComponent(id, serverSide ? 'SERVER_GRID' : 'CLIENT_GRID', { columns });
    }

    addForm(id: string, fields: any[]): LayoutBuilder {
        return this.addComponent(id, 'FORM', { fields });
    }

    addPanel(id: string, title: string, content: string): LayoutBuilder {
        return this.addComponent(id, 'PANEL', { title, content });
    }

    build(): Layout {
        if (!this.screenId) {
            throw new Error('screenId is required');
        }
        return {
            screenId: this.screenId,
            title: this.title,
            theme: this.theme,
            components: [...this.components]
        };
    }

    reset(): LayoutBuilder {
        this.screenId = '';
        this.title = '';
        this.theme = 'default';
        this.components = [];
        return this;
    }
}
