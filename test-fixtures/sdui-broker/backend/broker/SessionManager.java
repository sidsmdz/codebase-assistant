package com.sdui.broker;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketSession;
import java.util.concurrent.ConcurrentHashMap;
import java.util.Map;

/**
 * Session Manager - Manages WebSocket session lifecycle
 *
 * Patterns demonstrated:
 * - Session state tracking
 * - Activity monitoring
 * - Session metadata storage
 */
@Component
public class SessionManager {

    private final Map<String, SessionInfo> sessions = new ConcurrentHashMap<>();

    /**
     * Register new session
     */
    public void registerSession(String sessionId, WebSocketSession webSocketSession) {
        SessionInfo info = new SessionInfo(sessionId, webSocketSession);
        sessions.put(sessionId, info);
        System.out.println("Session registered: " + sessionId);
    }

    /**
     * Unregister session
     */
    public void unregisterSession(String sessionId) {
        sessions.remove(sessionId);
        System.out.println("Session unregistered: " + sessionId);
    }

    /**
     * Update session activity timestamp
     */
    public void updateActivity(String sessionId) {
        SessionInfo info = sessions.get(sessionId);
        if (info != null) {
            info.updateActivity();
        }
    }

    /**
     * Handle session error
     */
    public void handleError(String sessionId, Throwable error) {
        SessionInfo info = sessions.get(sessionId);
        if (info != null) {
            info.recordError(error);
        }
    }

    /**
     * Get session info
     */
    public SessionInfo getSessionInfo(String sessionId) {
        return sessions.get(sessionId);
    }

    /**
     * Get all active sessions
     */
    public Map<String, SessionInfo> getAllSessions() {
        return new ConcurrentHashMap<>(sessions);
    }

    /**
     * Session information holder
     */
    public static class SessionInfo {
        private final String sessionId;
        private final WebSocketSession webSocketSession;
        private final long createdAt;
        private long lastActivityAt;
        private int errorCount;
        private Throwable lastError;
        private final Map<String, String> metadata;

        public SessionInfo(String sessionId, WebSocketSession webSocketSession) {
            this.sessionId = sessionId;
            this.webSocketSession = webSocketSession;
            this.createdAt = System.currentTimeMillis();
            this.lastActivityAt = createdAt;
            this.errorCount = 0;
            this.metadata = new ConcurrentHashMap<>();
        }

        public void updateActivity() {
            this.lastActivityAt = System.currentTimeMillis();
        }

        public void recordError(Throwable error) {
            this.errorCount++;
            this.lastError = error;
        }

        public void setMetadata(String key, String value) {
            this.metadata.put(key, value);
        }

        public String getMetadata(String key) {
            return this.metadata.get(key);
        }

        // Getters
        public String getSessionId() { return sessionId; }
        public WebSocketSession getWebSocketSession() { return webSocketSession; }
        public long getCreatedAt() { return createdAt; }
        public long getLastActivityAt() { return lastActivityAt; }
        public int getErrorCount() { return errorCount; }
        public Throwable getLastError() { return lastError; }
        public long getSessionDurationMs() {
            return System.currentTimeMillis() - createdAt;
        }
        public long getIdleTimeMs() {
            return System.currentTimeMillis() - lastActivityAt;
        }
    }
}
