package com.enterprise.onboarding.service;

import com.enterprise.common.security.PermissionChecker;
import com.enterprise.common.security.Permitted;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Service for managing onboarding grid data with permissions
 */
@Service
public class OnboardingGridService implements Permitted {
    
    @Autowired
    private PermissionChecker permissionChecker;
    
    private static final String RESOURCE = "onboarding.grid";
    
    /**
     * Get grid data with permission filtering
     */
    public GridData getGridData(Long userId, GridRequest request) {
        // Check read permission
        permissionChecker.requirePermission(userId, RESOURCE, "read");
        
        // Check if user can see sensitive columns
        boolean canViewSensitive = permissionChecker.checkPermission(userId, RESOURCE, "view-sensitive");
        
        List<Map<String, Object>> rows = fetchGridRows(request);
        
        if (!canViewSensitive) {
            rows = filterSensitiveColumns(rows);
        }
        
        return new GridData(rows, rows.size(), request.getPage(), request.getPageSize());
    }
    
    /**
     * Update grid row
     */
    public void updateRow(Long userId, Long rowId, Map<String, Object> updates) {
        // Check write permission
        permissionChecker.requirePermission(userId, RESOURCE, "write");
        
        // Additional check for sensitive fields
        if (containsSensitiveFields(updates)) {
            permissionChecker.requirePermission(userId, RESOURCE, "write-sensitive");
        }
        
        // Perform update (mock implementation)
        System.out.println("Updating row " + rowId + " with " + updates);
    }
    
    /**
     * Delete grid row
     */
    public void deleteRow(Long userId, Long rowId) {
        // Check delete permission
        permissionChecker.requirePermission(userId, RESOURCE, "delete");
        
        // Perform delete (mock implementation)
        System.out.println("Deleting row " + rowId);
    }
    
    /**
     * Export grid data
     */
    public byte[] exportData(Long userId, GridRequest request) {
        // Check export permission
        permissionChecker.requirePermission(userId, RESOURCE, "export");
        
        GridData data = getGridData(userId, request);
        
        // Mock export implementation
        return ("Exported " + data.getTotal() + " rows").getBytes();
    }
    
    private List<Map<String, Object>> fetchGridRows(GridRequest request) {
        // Mock data
        return List.of(
            Map.of("id", 1, "name", "John Doe", "email", "john@example.com", "ssn", "***-**-1234"),
            Map.of("id", 2, "name", "Jane Smith", "email", "jane@example.com", "ssn", "***-**-5678")
        );
    }
    
    private List<Map<String, Object>> filterSensitiveColumns(List<Map<String, Object>> rows) {
        return rows.stream()
            .map(row -> {
                Map<String, Object> filtered = new HashMap<>(row);
                filtered.remove("ssn");
                return filtered;
            })
            .toList();
    }
    
    private boolean containsSensitiveFields(Map<String, Object> updates) {
        return updates.containsKey("ssn") || updates.containsKey("salary");
    }
    
    @Override
    public boolean isPermitted(Long userId, String action) {
        return permissionChecker.checkPermission(userId, RESOURCE, action);
    }
    
    @Override
    public String getResourceIdentifier() {
        return RESOURCE;
    }
    
    @Override
    public String[] getAvailableActions() {
        return new String[]{"read", "write", "delete", "export", "view-sensitive", "write-sensitive"};
    }
    
    public static class GridRequest {
        private int page = 0;
        private int pageSize = 50;
        private String sortBy;
        private String sortDir = "asc";
        
        public int getPage() { return page; }
        public void setPage(int page) { this.page = page; }
        public int getPageSize() { return pageSize; }
        public void setPageSize(int pageSize) { this.pageSize = pageSize; }
        public String getSortBy() { return sortBy; }
        public void setSortBy(String sortBy) { this.sortBy = sortBy; }
        public String getSortDir() { return sortDir; }
        public void setSortDir(String sortDir) { this.sortDir = sortDir; }
    }
    
    public static class GridData {
        private List<Map<String, Object>> rows;
        private int total;
        private int page;
        private int pageSize;
        
        public GridData(List<Map<String, Object>> rows, int total, int page, int pageSize) {
            this.rows = rows;
            this.total = total;
            this.page = page;
            this.pageSize = pageSize;
        }
        
        public List<Map<String, Object>> getRows() { return rows; }
        public int getTotal() { return total; }
        public int getPage() { return page; }
        public int getPageSize() { return pageSize; }
    }
}
