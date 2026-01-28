/**
 * Form Field Component with Validation
 *
 * Supports 3 validation patterns:
 * - Pattern C1: Inline validation (immediate on change)
 * - Pattern C2: Batch validation (on form submit)
 * - Pattern C3: Real-time debounced (with delay)
 */

import React, { useState, useEffect, useRef } from 'react';
import { TextField, Box, Typography } from '@mui/material';
import { FormField as FormFieldType, EventType } from '../../broker/types';

interface FormFieldProps {
    field: FormFieldType;
    validationMode: 'INLINE' | 'BATCH' | 'REALTIME_DEBOUNCED';
    sendEvent: (eventType: string, componentId: string, data: Record<string, string>) => void;
    formId: string;
}

export const FormField: React.FC<FormFieldProps> = ({
    field,
    validationMode,
    sendEvent,
    formId
}) => {
    const [value, setValue] = useState(field.value || '');
    const [validationMessage, setValidationMessage] = useState('');
    const [isValid, setIsValid] = useState(true);
    const debounceTimer = useRef<NodeJS.Timeout | null>(null);

    /**
     * Handle value change
     */
    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = event.target.value;
        setValue(newValue);

        // Trigger validation based on mode
        if (validationMode === 'INLINE') {
            // Pattern C1: Immediate validation
            console.log('Pattern C1: Inline validation triggered');
            sendValidationEvent(newValue);
        } else if (validationMode === 'REALTIME_DEBOUNCED') {
            // Pattern C3: Debounced validation
            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current);
            }

            debounceTimer.current = setTimeout(() => {
                console.log('Pattern C3: Debounced validation triggered');
                sendValidationEvent(newValue);
            }, 500); // 500ms debounce
        }

        // For BATCH mode (Pattern C2), validation happens on form submit
    };

    /**
     * Send INPUT_CHANGED event to server
     */
    const sendValidationEvent = (newValue: string) => {
        sendEvent(EventType.INPUT_CHANGED, field.fieldId, {
            fieldId: field.fieldId,
            value: newValue,
            validationMode,
            formId
        });
    };

    /**
     * Cleanup debounce timer
     */
    useEffect(() => {
        return () => {
            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current);
            }
        };
    }, []);

    /**
     * Update validation state from server response
     * This would be triggered by UI_ACTION message with SHOW_VALIDATION
     */
    const updateValidation = (valid: boolean, message: string) => {
        setIsValid(valid);
        setValidationMessage(message);
    };

    // Expose updateValidation to parent (via ref or context in real implementation)
    useEffect(() => {
        (window as any)[`validation_${field.fieldId}`] = updateValidation;
        return () => {
            delete (window as any)[`validation_${field.fieldId}`];
        };
    }, [field.fieldId]);

    return (
        <Box sx={{ mb: 2 }}>
            <TextField
                id={field.fieldId}
                label={field.label}
                value={value}
                onChange={handleChange}
                required={field.required}
                error={!isValid}
                helperText={validationMessage}
                fullWidth
                variant="outlined"
            />

            {/* Debug info */}
            <Typography variant="caption" sx={{ color: 'grey.600', fontSize: '0.7rem' }}>
                Validation mode: {validationMode}
            </Typography>
        </Box>
    );
};
