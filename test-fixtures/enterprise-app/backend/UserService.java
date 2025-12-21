package com.enterprise.backend.service;

import com.enterprise.backend.repository.UserRepository;
import com.enterprise.backend.model.User;
import com.enterprise.grpc.UserServiceGrpc;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Service layer for user management operations.
 * Integrates with gRPC service for inter-service communication.
 */
@Service
@Transactional
public class UserService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private UserServiceGrpc userServiceGrpc;

    @Autowired
    private AuditService auditService;

    /**
     * Retrieves a user by their unique identifier.
     * @param userId The unique user ID
     * @return Optional containing the user if found
     */
    public Optional<User> getUserById(Long userId) {
        auditService.logAccess("getUserById", userId);

        try {
            return userRepository.findById(userId)
                .map(user -> {
                    // Enrich user data from gRPC service
                    user.setPermissions(userServiceGrpc.getUserPermissions(userId));
                    return user;
                });
        } catch (Exception e) {
            auditService.logError("getUserById", userId, e);
            throw new RuntimeException("Failed to retrieve user", e);
        }
    }

    /**
     * Retrieves all active users with specific status.
     * @param status User status filter
     * @return List of users matching the status
     */
    public List<User> getActiveUsersByStatus(String status) {
        return userRepository.findAll().stream()
            .filter(user -> status.equals(user.getStatus()))
            .filter(User::isActive)
            .collect(Collectors.toList());
    }

    /**
     * Creates a new user in the system.
     * @param user User entity to create
     * @return Created user with generated ID
     */
    public User createUser(User user) {
        validateUser(user);

        User savedUser = userRepository.save(user);

        // Notify gRPC service about new user
        userServiceGrpc.notifyUserCreated(savedUser.getId(), savedUser.getEmail());

        auditService.logUserCreation(savedUser.getId());

        return savedUser;
    }

    /**
     * Updates an existing user's information.
     * @param userId User ID to update
     * @param updatedUser Updated user data
     * @return Updated user entity
     */
    public User updateUser(Long userId, User updatedUser) {
        return userRepository.findById(userId)
            .map(existingUser -> {
                existingUser.setEmail(updatedUser.getEmail());
                existingUser.setName(updatedUser.getName());
                existingUser.setStatus(updatedUser.getStatus());

                User saved = userRepository.save(existingUser);
                auditService.logUserUpdate(userId);

                return saved;
            })
            .orElseThrow(() -> new RuntimeException("User not found: " + userId));
    }

    /**
     * Soft deletes a user by marking them as inactive.
     * @param userId User ID to delete
     */
    public void deleteUser(Long userId) {
        userRepository.findById(userId).ifPresent(user -> {
            user.setActive(false);
            userRepository.save(user);

            auditService.logUserDeletion(userId);
            userServiceGrpc.notifyUserDeleted(userId);
        });
    }

    /**
     * Searches users by email pattern.
     * @param emailPattern Email search pattern
     * @return List of matching users
     */
    public List<User> searchUsersByEmail(String emailPattern) {
        return userRepository.findByEmailContaining(emailPattern);
    }

    /**
     * Validates user data before persistence.
     * @param user User to validate
     */
    private void validateUser(User user) {
        if (user.getEmail() == null || user.getEmail().isEmpty()) {
            throw new IllegalArgumentException("Email is required");
        }
        if (user.getName() == null || user.getName().isEmpty()) {
            throw new IllegalArgumentException("Name is required");
        }
    }

    /**
     * Bulk imports users from external system.
     * @param users List of users to import
     * @return Number of successfully imported users
     */
    @Transactional
    public int bulkImportUsers(List<User> users) {
        int successCount = 0;

        for (User user : users) {
            try {
                validateUser(user);
                userRepository.save(user);
                successCount++;
            } catch (Exception e) {
                auditService.logError("bulkImport", user.getEmail(), e);
            }
        }

        auditService.logBulkImport(successCount, users.size());

        return successCount;
    }
}
