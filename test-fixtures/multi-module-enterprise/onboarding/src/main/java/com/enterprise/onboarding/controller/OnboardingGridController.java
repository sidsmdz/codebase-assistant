package com.enterprise.onboarding.controller;

import com.enterprise.common.annotations.RequiresPermission;
import com.enterprise.onboarding.service.OnboardingGridService;
import com.enterprise.onboarding.service.OnboardingGridService.GridData;
import com.enterprise.onboarding.service.OnboardingGridService.GridRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/onboarding/grid")
public class OnboardingGridController {
    
    @Autowired
    private OnboardingGridService gridService;
    
    @PostMapping("/data")
    @RequiresPermission(resource = "onboarding.grid", action = "read")
    public ResponseEntity<GridData> getGridData(
            @RequestParam Long userId,
            @RequestBody GridRequest request) {
        GridData data = gridService.getGridData(userId, request);
        return ResponseEntity.ok(data);
    }
    
    @PutMapping("/rows/{rowId}")
    @RequiresPermission(resource = "onboarding.grid", action = "write")
    public ResponseEntity<Void> updateRow(
            @PathVariable Long rowId,
            @RequestParam Long userId,
            @RequestBody Map<String, Object> updates) {
        gridService.updateRow(userId, rowId, updates);
        return ResponseEntity.ok().build();
    }
    
    @DeleteMapping("/rows/{rowId}")
    @RequiresPermission(resource = "onboarding.grid", action = "delete")
    public ResponseEntity<Void> deleteRow(
            @PathVariable Long rowId,
            @RequestParam Long userId) {
        gridService.deleteRow(userId, rowId);
        return ResponseEntity.ok().build();
    }
    
    @PostMapping("/export")
    @RequiresPermission(resource = "onboarding.grid", action = "export")
    public ResponseEntity<byte[]> exportData(
            @RequestParam Long userId,
            @RequestBody GridRequest request) {
        byte[] data = gridService.exportData(userId, request);
        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_OCTET_STREAM)
            .header("Content-Disposition", "attachment; filename=onboarding-data.csv")
            .body(data);
    }
}
