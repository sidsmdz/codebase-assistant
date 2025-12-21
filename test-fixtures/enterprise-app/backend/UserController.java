package com.enterprise.backend.controller;

import com.enterprise.backend.service.UserService;
import com.enterprise.backend.model.User;
import com.enterprise.backend.dto.UserResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.stream.Collectors;

/**
 * REST controller for user management endpoints.
 * Provides CRUD operations and search functionality.
 */
@RestController
@RequestMapping("/api/users")
@CrossOrigin(origins = "*")
public class UserController {

    @Autowired
    private UserService userService;

    /**
     * GET endpoint to retrieve user by ID.
     * @param id User ID
     * @return User response DTO
     */
    @GetMapping("/{id}")
    public ResponseEntity<UserResponse> getUserById(@PathVariable Long id) {
        return userService.getUserById(id)
            .map(user -> ResponseEntity.ok(UserResponse.fromEntity(user)))
            .orElse(ResponseEntity.notFound().build());
    }

    /**
     * GET endpoint to retrieve all users by status.
     * @param status Status filter
     * @return List of user responses
     */
    @GetMapping("/status/{status}")
    public ResponseEntity<List<UserResponse>> getUsersByStatus(@PathVariable String status) {
        List<UserResponse> users = userService.getActiveUsersByStatus(status)
            .stream()
            .map(UserResponse::fromEntity)
            .collect(Collectors.toList());

        return ResponseEntity.ok(users);
    }

    /**
     * POST endpoint to create a new user.
     * @param user User data
     * @return Created user response
     */
    @PostMapping
    public ResponseEntity<UserResponse> createUser(@RequestBody User user) {
        try {
            User createdUser = userService.createUser(user);
            return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(UserResponse.fromEntity(createdUser));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    /**
     * PUT endpoint to update existing user.
     * @param id User ID
     * @param user Updated user data
     * @return Updated user response
     */
    @PutMapping("/{id}")
    public ResponseEntity<UserResponse> updateUser(
        @PathVariable Long id,
        @RequestBody User user
    ) {
        try {
            User updatedUser = userService.updateUser(id, user);
            return ResponseEntity.ok(UserResponse.fromEntity(updatedUser));
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        }
    }

    /**
     * DELETE endpoint to remove a user.
     * @param id User ID
     * @return No content response
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteUser(@PathVariable Long id) {
        userService.deleteUser(id);
        return ResponseEntity.noContent().build();
    }

    /**
     * GET endpoint to search users by email.
     * @param email Email search pattern
     * @return List of matching users
     */
    @GetMapping("/search")
    public ResponseEntity<List<UserResponse>> searchUsers(
        @RequestParam String email
    ) {
        List<UserResponse> users = userService.searchUsersByEmail(email)
            .stream()
            .map(UserResponse::fromEntity)
            .collect(Collectors.toList());

        return ResponseEntity.ok(users);
    }

    /**
     * POST endpoint for bulk user import.
     * @param users List of users to import
     * @return Import result with count
     */
    @PostMapping("/bulk-import")
    public ResponseEntity<ImportResult> bulkImport(@RequestBody List<User> users) {
        int successCount = userService.bulkImportUsers(users);

        ImportResult result = new ImportResult();
        result.setSuccessCount(successCount);
        result.setTotalCount(users.size());
        result.setFailureCount(users.size() - successCount);

        return ResponseEntity.ok(result);
    }

    /**
     * Inner class for import results.
     */
    public static class ImportResult {
        private int successCount;
        private int totalCount;
        private int failureCount;

        public int getSuccessCount() { return successCount; }
        public void setSuccessCount(int successCount) { this.successCount = successCount; }

        public int getTotalCount() { return totalCount; }
        public void setTotalCount(int totalCount) { this.totalCount = totalCount; }

        public int getFailureCount() { return failureCount; }
        public void setFailureCount(int failureCount) { this.failureCount = failureCount; }
    }
}
