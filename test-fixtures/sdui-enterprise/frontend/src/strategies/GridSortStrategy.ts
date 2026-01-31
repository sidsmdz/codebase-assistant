interface GridRow {
    id: string;
    cells: Record<string, any>;
}

type SortComparator = (a: any, b: any) => number;

export class GridSortStrategy {
    private comparators: Map<string, SortComparator> = new Map();

    constructor() {
        this.comparators.set('string', (a, b) => String(a).localeCompare(String(b)));
        this.comparators.set('number', (a, b) => Number(a) - Number(b));
        this.comparators.set('date', (a, b) => new Date(a).getTime() - new Date(b).getTime());
    }

    sort(data: GridRow[], field: string, direction: 'ASC' | 'DESC', type: string = 'string'): GridRow[] {
        const comparator = this.comparators.get(type) || this.comparators.get('string')!;
        const multiplier = direction === 'ASC' ? 1 : -1;

        return [...data].sort((a, b) => {
            const valA = a.cells[field];
            const valB = b.cells[field];

            if (valA == null && valB == null) return 0;
            if (valA == null) return 1;
            if (valB == null) return -1;

            return comparator(valA, valB) * multiplier;
        });
    }

    registerComparator(type: string, comparator: SortComparator): void {
        this.comparators.set(type, comparator);
    }

    getAvailableTypes(): string[] {
        return Array.from(this.comparators.keys());
    }
}
