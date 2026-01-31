package com.sdui.model;

import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.Table;
import javax.persistence.Column;

@Entity
@Table(name = "grid_configs")
public class GridConfig {

    @Id
    private String id;

    @Column(name = "grid_id")
    private String gridId;

    @Column(name = "screen_id")
    private String screenId;

    @Column(name = "columns_json", columnDefinition = "TEXT")
    private String columnsJson;

    @Column(name = "default_sort_field")
    private String defaultSortField;

    @Column(name = "default_sort_direction")
    private String defaultSortDirection;

    @Column(name = "page_size")
    private int pageSize;

    @Column(name = "active")
    private boolean active;

    public GridConfig() {}

    public GridConfig(String id, String gridId, String screenId) {
        this.id = id;
        this.gridId = gridId;
        this.screenId = screenId;
        this.pageSize = 50;
        this.active = true;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getGridId() { return gridId; }
    public void setGridId(String gridId) { this.gridId = gridId; }

    public String getScreenId() { return screenId; }
    public void setScreenId(String screenId) { this.screenId = screenId; }

    public String getColumnsJson() { return columnsJson; }
    public void setColumnsJson(String columnsJson) { this.columnsJson = columnsJson; }

    public String getDefaultSortField() { return defaultSortField; }
    public void setDefaultSortField(String defaultSortField) { this.defaultSortField = defaultSortField; }

    public String getDefaultSortDirection() { return defaultSortDirection; }
    public void setDefaultSortDirection(String defaultSortDirection) { this.defaultSortDirection = defaultSortDirection; }

    public int getPageSize() { return pageSize; }
    public void setPageSize(int pageSize) { this.pageSize = pageSize; }

    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
}
