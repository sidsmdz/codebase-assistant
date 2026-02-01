package com.enterprise.permissions.repository;

import com.enterprise.permissions.model.UserRole;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Set;

@Repository
public interface UserRoleRepository extends JpaRepository<UserRole, Long> {
    
    List<UserRole> findByUserId(Long userId);
    
    @Query("SELECT ur FROM UserRole ur JOIN FETCH ur.role r JOIN FETCH r.permissions WHERE ur.userId = :userId")
    List<UserRole> findByUserIdWithPermissions(@Param("userId") Long userId);
    
    boolean existsByUserIdAndRoleId(Long userId, Long roleId);
    
    void deleteByUserIdAndRoleId(Long userId, Long roleId);
}
