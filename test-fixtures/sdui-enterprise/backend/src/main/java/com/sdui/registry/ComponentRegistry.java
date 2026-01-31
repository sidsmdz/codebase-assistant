package com.sdui.registry;

import com.sdui.model.LayoutDefinition;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Component
public class ComponentRegistry {

    private final Map<String, ComponentDefinition> components = new HashMap<>();
    private final Map<String, LayoutDefinition> layouts = new HashMap<>();

    public void registerComponent(String componentId, String type, Map<String, Object> defaultConfig) {
        ComponentDefinition definition = new ComponentDefinition(componentId, type, defaultConfig);
        components.put(componentId, definition);
    }

    public void registerLayout(String layoutId, LayoutDefinition layout) {
        layouts.put(layoutId, layout);
    }

    public ComponentDefinition getComponent(String componentId) {
        return components.get(componentId);
    }

    public LayoutDefinition getLayout(String layoutId) {
        return layouts.get(layoutId);
    }

    public void validateComponent(String componentId) {
        if (!components.containsKey(componentId)) {
            throw new IllegalArgumentException("Component not registered: " + componentId);
        }
    }

    public List<ComponentDefinition> getComponentsByType(String type) {
        return components.values().stream()
                .filter(c -> c.getType().equals(type))
                .collect(Collectors.toList());
    }

    public boolean hasComponent(String componentId) {
        return components.containsKey(componentId);
    }

    public int getRegisteredComponentCount() {
        return components.size();
    }
}
