package com.enterprise.onboarding.repository;

import com.enterprise.onboarding.model.OnboardingTask;
import com.enterprise.onboarding.model.OnboardingTask.TaskStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface OnboardingTaskRepository extends JpaRepository<OnboardingTask, Long> {
    
    List<OnboardingTask> findByUserIdOrderBySequenceAsc(Long userId);
    
    List<OnboardingTask> findByUserIdAndStatus(Long userId, TaskStatus status);
    
    long countByUserIdAndStatus(Long userId, TaskStatus status);
    
    boolean existsByUserIdAndTitleAndStatus(Long userId, String title, TaskStatus status);
}
