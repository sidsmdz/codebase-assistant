package com.sdui.model;

import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.Table;
import javax.persistence.Column;
import java.util.List;

@Entity
@Table(name = "layout_definitions")
public class LayoutDefinition {

    @Id
    private String id;

    @Column(name = "screen_id")
    private String screenId;

    @Column(name = "title")
    private String title;

    @Column(name = "theme")
    private String theme;

    @Column(name = "component_ids", columnDefinition = "TEXT")
    private String componentIds;

    @Column(name = "config_json", columnDefinition = "TEXT")
    private String configJson;

    public LayoutDefinition() {}

    public LayoutDefinition(String id, String screenId, String title) {
        this.id = id;
        this.screenId = screenId;
        this.title = title;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getScreenId() { return screenId; }
    public void setScreenId(String screenId) { this.screenId = screenId; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getTheme() { return theme; }
    public void setTheme(String theme) { this.theme = theme; }

    public String getComponentIds() { return componentIds; }
    public void setComponentIds(String componentIds) { this.componentIds = componentIds; }

    public String getConfigJson() { return configJson; }
    public void setConfigJson(String configJson) { this.configJson = configJson; }
}
