package com.enterprise.erp.backend.user;

import com.enterprise.erp.domain.models.User;
import com.enterprise.erp.domain.models.Enums.UserStatus;
import com.enterprise.erp.domain.models.Enums.Role;
import com.enterprise.erp.shared.utils.ValidationUtils;
import com.enterprise.erp.integration.events.EventPublisher;
import com.enterprise.erp.integration.events.UserEvent;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * User Service - Core business logic for user management
 * Depends on: shared domain models, validation utils, event publisher
 */
@Service
@Transactional
public class UserService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private EventPublisher eventPublisher;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private NotificationServiceClient notificationClient;

    /**
     * Create new user with validation
     */
    public User createUser(UserRegistrationRequest request) {
        // Validate using shared utils
        if (!ValidationUtils.isValidEmail(request.getEmail())) {
            throw new ValidationException("Invalid email format");
        }

        if (!ValidationUtils.isValidUsername(request.getUsername())) {
            throw new ValidationException("Invalid username format");
        }

        if (!ValidationUtils.isStrongPassword(request.getPassword())) {
            throw new ValidationException("Password does not meet strength requirements");
        }

        // Check for existing user
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new DuplicateUserException("Email already registered");
        }

        if (userRepository.existsByUsername(request.getUsername())) {
            throw new DuplicateUserException("Username already taken");
        }

        // Create user entity
        User user = new User();
        user.setUsername(request.getUsername());
        user.setEmail(request.getEmail());
        user.setFirstName(request.getFirstName());
        user.setLastName(request.getLastName());
        user.setStatus(UserStatus.PENDING);
        user.addRole(Role.CUSTOMER);

        // Encrypt password
        String encryptedPassword = passwordEncoder.encode(request.getPassword());
        // Store encrypted password

        // Save to database
        User savedUser = userRepository.save(user);

        // Publish event for other services
        eventPublisher.publish(new UserEvent(
                UserEvent.EventType.USER_CREATED,
                savedUser.getId(),
                savedUser
        ));

        // Send welcome notification
        notificationClient.sendWelcomeEmail(savedUser);

        return savedUser;
    }

    /**
     * Update user profile
     */
    public User updateUser(Long userId, UserUpdateRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new UserNotFoundException("User not found: " + userId));

        // Validate updates
        if (request.getEmail() != null && !ValidationUtils.isValidEmail(request.getEmail())) {
            throw new ValidationException("Invalid email format");
        }

        // Update fields
        if (request.getFirstName() != null) {
            user.setFirstName(request.getFirstName());
        }

        if (request.getLastName() != null) {
            user.setLastName(request.getLastName());
        }

        if (request.getEmail() != null && !request.getEmail().equals(user.getEmail())) {
            // Check email availability
            if (userRepository.existsByEmail(request.getEmail())) {
                throw new DuplicateUserException("Email already in use");
            }
            user.setEmail(request.getEmail());
        }

        user.setUpdatedAt(LocalDateTime.now());
        User updatedUser = userRepository.save(user);

        // Publish update event
        eventPublisher.publish(new UserEvent(
                UserEvent.EventType.USER_UPDATED,
                updatedUser.getId(),
                updatedUser
        ));

        return updatedUser;
    }

    /**
     * Activate user account
     */
    public User activateUser(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new UserNotFoundException("User not found: " + userId));

        if (user.getStatus() == UserStatus.ACTIVE) {
            throw new IllegalStateException("User already active");
        }

        user.setStatus(UserStatus.ACTIVE);
        user.setUpdatedAt(LocalDateTime.now());

        User activatedUser = userRepository.save(user);

        // Publish activation event
        eventPublisher.publish(new UserEvent(
                UserEvent.EventType.USER_ACTIVATED,
                activatedUser.getId(),
                activatedUser
        ));

        // Send activation notification
        notificationClient.sendActivationEmail(activatedUser);

        return activatedUser;
    }

    /**
     * Upgrade user to premium
     */
    public User upgradeToPremium(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new UserNotFoundException("User not found: " + userId));

        if (user.isPremium()) {
            throw new IllegalStateException("User is already premium");
        }

        user.addRole(Role.PREMIUM_CUSTOMER);
        user.setUpdatedAt(LocalDateTime.now());

        User upgradedUser = userRepository.save(user);

        // Publish premium upgrade event
        eventPublisher.publish(new UserEvent(
                UserEvent.EventType.USER_UPGRADED_PREMIUM,
                upgradedUser.getId(),
                upgradedUser
        ));

        return upgradedUser;
    }

    /**
     * Get user by ID with caching
     */
    public Optional<User> getUserById(Long userId) {
        return userRepository.findById(userId);
    }

    /**
     * Get user by email
     */
    public Optional<User> getUserByEmail(String email) {
        if (!ValidationUtils.isValidEmail(email)) {
            return Optional.empty();
        }
        return userRepository.findByEmail(email);
    }

    /**
     * Search users with filters
     */
    public List<User> searchUsers(UserSearchCriteria criteria) {
        return userRepository.findAll().stream()
                .filter(user -> matchesCriteria(user, criteria))
                .collect(Collectors.toList());
    }

    /**
     * Get all active users
     */
    public List<User> getActiveUsers() {
        return userRepository.findAll().stream()
                .filter(User::isActive)
                .collect(Collectors.toList());
    }

    /**
     * Get all premium users
     */
    public List<User> getPremiumUsers() {
        return userRepository.findAll().stream()
                .filter(User::isPremium)
                .collect(Collectors.toList());
    }

    /**
     * Suspend user account
     */
    public User suspendUser(Long userId, String reason) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new UserNotFoundException("User not found: " + userId));

        user.setStatus(UserStatus.SUSPENDED);
        user.setUpdatedAt(LocalDateTime.now());

        User suspendedUser = userRepository.save(user);

        // Publish suspension event
        eventPublisher.publish(new UserEvent(
                UserEvent.EventType.USER_SUSPENDED,
                suspendedUser.getId(),
                suspendedUser
        ));

        // Send suspension notification
        notificationClient.sendSuspensionEmail(suspendedUser, reason);

        return suspendedUser;
    }

    /**
     * Delete user (soft delete)
     */
    @Transactional
    public void deleteUser(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new UserNotFoundException("User not found: " + userId));

        user.setStatus(UserStatus.DEACTIVATED);
        user.setUpdatedAt(LocalDateTime.now());
        userRepository.save(user);

        // Publish deletion event
        eventPublisher.publish(new UserEvent(
                UserEvent.EventType.USER_DELETED,
                user.getId(),
                user
        ));
    }

    /**
     * Check if user matches search criteria
     */
    private boolean matchesCriteria(User user, UserSearchCriteria criteria) {
        if (criteria.getStatus() != null && user.getStatus() != criteria.getStatus()) {
            return false;
        }

        if (criteria.getRole() != null && !user.hasRole(criteria.getRole())) {
            return false;
        }

        if (criteria.getSearchTerm() != null) {
            String searchTerm = criteria.getSearchTerm().toLowerCase();
            return user.getUsername().toLowerCase().contains(searchTerm)
                    || user.getEmail().toLowerCase().contains(searchTerm)
                    || user.getFullName().toLowerCase().contains(searchTerm);
        }

        return true;
    }
}
