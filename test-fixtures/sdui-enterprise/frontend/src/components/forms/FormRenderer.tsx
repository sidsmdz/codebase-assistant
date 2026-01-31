import React, { useState, useCallback } from 'react';
import { EventDispatcher } from '../../services/EventDispatcher';
import { WebSocketClient } from '../../services/WebSocketClient';

interface FormField {
    id: string;
    label: string;
    type: 'text' | 'number' | 'select' | 'checkbox' | 'textarea';
    required: boolean;
    options?: string[];
    defaultValue?: any;
    validation?: {
        pattern?: string;
        min?: number;
        max?: number;
    };
}

interface FormRendererProps {
    formId: string;
    fields: FormField[];
    onSubmit: (formData: Record<string, any>) => void;
    wsClient: WebSocketClient;
    eventDispatcher: EventDispatcher;
}

const FormRenderer: React.FC<FormRendererProps> = ({
    formId,
    fields,
    onSubmit,
    wsClient,
    eventDispatcher
}) => {
    const [formData, setFormData] = useState<Record<string, any>>(() => {
        const initial: Record<string, any> = {};
        fields.forEach(field => {
            initial[field.id] = field.defaultValue ?? '';
        });
        return initial;
    });
    const [errors, setErrors] = useState<Record<string, string>>({});

    const validateField = useCallback((field: FormField, value: any): string | null => {
        if (field.required && (!value || value === '')) {
            return `${field.label} is required`;
        }
        if (field.validation?.pattern && !new RegExp(field.validation.pattern).test(value)) {
            return `${field.label} format is invalid`;
        }
        if (field.validation?.min !== undefined && Number(value) < field.validation.min) {
            return `${field.label} must be at least ${field.validation.min}`;
        }
        if (field.validation?.max !== undefined && Number(value) > field.validation.max) {
            return `${field.label} must be at most ${field.validation.max}`;
        }
        return null;
    }, []);

    const handleChange = useCallback((fieldId: string, value: any) => {
        setFormData(prev => ({ ...prev, [fieldId]: value }));
        const field = fields.find(f => f.id === fieldId);
        if (field) {
            const error = validateField(field, value);
            setErrors(prev => {
                const next = { ...prev };
                if (error) next[fieldId] = error;
                else delete next[fieldId];
                return next;
            });
        }
    }, [fields, validateField]);

    const handleSubmit = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        const newErrors: Record<string, string> = {};
        fields.forEach(field => {
            const error = validateField(field, formData[field.id]);
            if (error) newErrors[field.id] = error;
        });

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        wsClient.send('/app/action', {
            actionType: 'SUBMIT_FORM',
            componentId: formId,
            formData
        });

        onSubmit(formData);
        eventDispatcher.dispatch('FORM_SUBMITTED', { formId, formData });
    }, [formData, fields, validateField, wsClient, formId, onSubmit, eventDispatcher]);

    const renderField = (field: FormField) => {
        switch (field.type) {
            case 'select':
                return (
                    <select
                        value={formData[field.id]}
                        onChange={(e) => handleChange(field.id, e.target.value)}
                    >
                        <option value="">Select...</option>
                        {field.options?.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                        ))}
                    </select>
                );
            case 'checkbox':
                return (
                    <input
                        type="checkbox"
                        checked={formData[field.id]}
                        onChange={(e) => handleChange(field.id, e.target.checked)}
                    />
                );
            case 'textarea':
                return (
                    <textarea
                        value={formData[field.id]}
                        onChange={(e) => handleChange(field.id, e.target.value)}
                    />
                );
            default:
                return (
                    <input
                        type={field.type}
                        value={formData[field.id]}
                        onChange={(e) => handleChange(field.id, e.target.value)}
                    />
                );
        }
    };

    return (
        <form className="form-renderer" data-form-id={formId} onSubmit={handleSubmit}>
            {fields.map(field => (
                <div key={field.id} className="form-field">
                    <label htmlFor={field.id}>
                        {field.label}
                        {field.required && <span className="required">*</span>}
                    </label>
                    {renderField(field)}
                    {errors[field.id] && (
                        <span className="field-error">{errors[field.id]}</span>
                    )}
                </div>
            ))}
            <button type="submit">Submit</button>
        </form>
    );
};

export default FormRenderer;
