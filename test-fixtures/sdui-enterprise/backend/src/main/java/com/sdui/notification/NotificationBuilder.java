package com.sdui.notification;

import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Component
public class NotificationBuilder {

    private String type;
    private final Map<String, Object> payload = new HashMap<>();

    public NotificationBuilder withType(String type) {
        this.type = type;
        return this;
    }

    public NotificationBuilder withPayload(String key, Object value) {
        this.payload.put(key, value);
        return this;
    }

    public Map<String, Object> build() {
        Map<String, Object> notification = new HashMap<>();
        notification.put("id", UUID.randomUUID().toString());
        notification.put("type", type);
        notification.put("payload", new HashMap<>(payload));
        notification.put("timestamp", System.currentTimeMillis());

        // Reset for next build
        this.type = null;
        this.payload.clear();

        return notification;
    }
}
