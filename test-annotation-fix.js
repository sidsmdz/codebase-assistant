// Quick test to verify annotation extraction works
const testCode = `package com.sdui.controller;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/layout")
public class LayoutController {
    
    @GetMapping("/{id}")
    public String getLayout() {
        return "layout";
    }
}`;

// Extract annotations like FeatureAnalyzer does
const extractAnnotations = (content) => {
    const annotations = [];
    const matches = content.matchAll(/@(\w+)(?:\([^)]*\))?/g);
    for (const match of matches) {
        annotations.push('@' + match[1]);
    }
    return [...new Set(annotations)];
};

const annotations = extractAnnotations(testCode);
console.log('File-level annotations:', annotations);
console.log('Has @RestController?', annotations.includes('@RestController'));
console.log('Has @RequestMapping?', annotations.includes('@RequestMapping'));
console.log('Has @GetMapping?', annotations.includes('@GetMapping'));
