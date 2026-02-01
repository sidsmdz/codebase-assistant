package com.enterprise.common.annotations;

import java.lang.annotation.*;

/**
 * Annotation to mark resources that require permissions
 */
@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface RequiresPermission {
    
    /**
     * The resource identifier
     */
    String resource();
    
    /**
     * The required action
     */
    String action();
    
    /**
     * Optional message to display when permission is denied
     */
    String message() default "Access denied";
}
