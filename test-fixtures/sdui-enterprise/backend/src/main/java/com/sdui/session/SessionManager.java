package com.sdui.session;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class SessionManager {

    private final Map<String, SessionInfo> activeSessions = new ConcurrentHashMap<>();
    private final Map<String, Set<String>> screenSessions = new ConcurrentHashMap<>();
    private final Map<String, Set<String>> gridSessions = new ConcurrentHashMap<>();

    public void registerSession(String sessionId, String userId) {
        SessionInfo info = new SessionInfo(sessionId, userId, System.currentTimeMillis());
        activeSessions.put(sessionId, info);
    }

    public void removeSession(String sessionId) {
        activeSessions.remove(sessionId);
        screenSessions.values().forEach(sessions -> sessions.remove(sessionId));
        gridSessions.values().forEach(sessions -> sessions.remove(sessionId));
    }

    public void subscribeToScreen(String sessionId, String screenId) {
        screenSessions.computeIfAbsent(screenId, k -> ConcurrentHashMap.newKeySet()).add(sessionId);
    }

    public void subscribeToGrid(String sessionId, String gridId) {
        gridSessions.computeIfAbsent(gridId, k -> ConcurrentHashMap.newKeySet()).add(sessionId);
    }

    public List<String> getSessionsForScreen(String screenId) {
        Set<String> sessions = screenSessions.get(screenId);
        return sessions != null ? new ArrayList<>(sessions) : Collections.emptyList();
    }

    public List<String> getSessionsForGrid(String gridId) {
        Set<String> sessions = gridSessions.get(gridId);
        return sessions != null ? new ArrayList<>(sessions) : Collections.emptyList();
    }

    public boolean isSessionActive(String sessionId) {
        return activeSessions.containsKey(sessionId);
    }

    public int getActiveSessionCount() {
        return activeSessions.size();
    }
}
