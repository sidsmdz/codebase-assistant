# Multi-Module Enterprise Test Fixture - Feature Detection Guide

## Overview
This test fixture demonstrates a real-world enterprise multi-module project using:
- **gRPC/Protobuf** for service communication
- **Server-Driven UI (SDUI)** for dynamic frontend rendering
- **Permission-based access control** across modules
- **Maven multi-module** project structure

## Project Structure

```
multi-module-enterprise/
├── pom.xml (parent)
├── proto/ (shared protobuf definitions)
│   ├── permissions.proto
│   ├── common.proto
│   └── onboarding.proto
├── permissions/ (Module 1)
│   ├── pom.xml
│   └── src/main/java/com/enterprise/permissions/
│       ├── grpc/PermissionGrpcService.java
│       ├── service/PermissionService.java
│       ├── model/ (Role, Permission, UserRole)
│       └── repository/ (JPA repositories)
├── common/ (Module 2)
│   ├── pom.xml
│   └── src/main/java/com/enterprise/common/
│       ├── security/Permitted.java (PUBLIC INTERFACE)
│       ├── security/PermissionChecker.java
│       └── grpc/SecurityGrpcService.java
└── onboarding/ (Module 3)
    ├── pom.xml
    ├── src/main/java/com/enterprise/onboarding/
    │   ├── grpc/OnboardingGrpcService.java (SDUI endpoint)
    │   ├── sdui/LayoutBuilder.java (SDUI pattern)
    │   ├── service/OnboardingService.java (implements Permitted)
    │   ├── service/OnboardingGridService.java (implements Permitted)
    │   └── model/ (OnboardingTask)
    └── frontend/src/
        ├── components/SDUIRenderer.tsx
        ├── components/ComponentRenderer.tsx
        └── hooks/usePermissionChecker.ts
```

## Testing Feature Detection

### Step 1: Reload Extension Window
```
Press F1 → "Developer: Reload Window"
```

### Step 2: Scan the Multi-Module Project
In GitHub Copilot Chat:
```
/scan test-fixtures/multi-module-enterprise
```

### Expected Results

#### Module Detection
The analyzer should detect **3 modules**:
- `permissions` at `test-fixtures/multi-module-enterprise/permissions`
- `common` at `test-fixtures/multi-module-enterprise/common`  
- `onboarding` at `test-fixtures/multi-module-enterprise/onboarding`

#### Feature Detection (Expected ~8-10 features)

**Permissions Module Features:**
1. **Permission Management**
   - Entry Point: `PermissionGrpcService` (@GrpcService)
   - Components: PermissionService, PermissionController
   - Pattern: gRPC + JPA + Spring
   
2. **Role Management**
   - Entry Point: RoleRepository
   - Components: Role, UserRole models
   - Dependencies: Permission entity

**Common Module Features:**
3. **Security Service**
   - Entry Point: `SecurityGrpcService` (@GrpcService)
   - Components: PermissionChecker
   - Cross-module: Calls permissions module

**Onboarding Module Features:**
4. **SDUI Layout Management**
   - Entry Point: `OnboardingGrpcService` (@GrpcService)
   - Components: LayoutBuilder
   - Pattern: Server-Driven UI
   
5. **Task Management**
   - Entry Point: OnboardingService (implements Permitted)
   - Components: OnboardingTask, OnboardingTaskRepository
   - Cross-module: Uses PermissionChecker from common
   
6. **Grid Management**
   - Entry Point: OnboardingGridService (implements Permitted)
   - Cross-module: Uses PermissionChecker
   - Pattern: Permission-filtered data grid
   
7. **Frontend SDUI Rendering**
   - Entry Point: SDUIRenderer (React component)
   - Components: ComponentRenderer, hooks
   - Pattern: Dynamic UI consumption

### Step 3: Test /modules Command
```
/modules
```

Expected output:
```
Modules in workspace:
1. permissions (3 features)
   - Permission Management
   - Role Management
   
2. common (1 feature)
   - Security Service
   
3. onboarding (4 features)
   - SDUI Layout Management
   - Task Management
   - Grid Management
   - Frontend SDUI Rendering
```

### Step 4: Test Cross-Module Query

**Query**: "How do I apply permissions to onboarding?"

**Expected Behavior:**
The system should:
1. Identify `Permitted` interface in **common** module
2. Find implementations in **onboarding** module:
   - OnboardingService
   - OnboardingGridService
3. Trace dependency to `PermissionChecker` (common → permissions)
4. Show the full integration pattern

**Expected Response:**
```
To apply permissions to onboarding components:

1. Implement the Permitted interface from common module:
   - getResourceIdentifier(): Returns "onboarding.tasks" or "onboarding.grid"
   - isPermitted(userId, action): Checks permissions
   
2. Inject PermissionChecker from common module:
   @Autowired
   private PermissionChecker permissionChecker;
   
3. Use permissionChecker.requirePermission() to enforce:
   permissionChecker.requirePermission(userId, "onboarding.grid", "read");

Example from OnboardingGridService:
- Resource: "onboarding.grid"
- Actions: read, write, delete, export, view-sensitive, write-sensitive
- Implements Permitted interface
- Uses PermissionChecker for enforcement

The permission data comes from the permissions module via gRPC.
```

### Step 5: Test SDUI Pattern Recognition

**Query**: "Explain the SDUI architecture"

**Expected Response:**
```
The SDUI (Server-Driven UI) architecture in the onboarding module:

Backend (onboarding module):
1. LayoutBuilder - Constructs dynamic layouts
   - buildOnboardingDashboard(): Main dashboard
   - buildTaskListLayout(): Task list UI
   - buildGridLayout(): Grid UI with permissions
   
2. OnboardingGrpcService - Delivers layouts via gRPC
   - getLayout(): Returns LayoutDefinition protobuf
   - processAction(): Handles UI interactions
   - Integrates permissions via PermissionConfig
   
3. Proto Definitions (onboarding.proto):
   - LayoutDefinition: Screen structure
   - ComponentDefinition: UI components
   - PermissionConfig: Permission requirements per component

Frontend (onboarding/frontend):
1. SDUIRenderer - Main renderer
   - Fetches layout from gRPC service
   - Renders components dynamically
   
2. ComponentRenderer - Component factory
   - Renders based on component.type
   - Checks permissions before rendering
   - Handles fallback behaviors (hide/disable/show_message)
   
3. Permission Integration:
   - usePermissionCheck hook
   - Calls /api/permissions/check
   - Caches results

Flow:
User → SDUIRenderer → gRPC GetLayout → LayoutBuilder → 
  LayoutDefinition (with PermissionConfig) → ComponentRenderer →
  Permission Check → Render/Hide/Disable
```

### Step 6: Verify Cross-Module Dependencies

**Query**: "/modules onboarding"

**Expected Output:**
```
Module: onboarding
Path: test-fixtures/multi-module-enterprise/onboarding
Type: Maven
Language: Java, TypeScript
Features: 4

Dependencies on other modules:
- common (provides Permitted, PermissionChecker)
- permissions (provides permission data)

Cross-module feature dependencies:
- SDUI Layout Management → Security Service (common)
- Task Management → Permitted interface (common)
- Grid Management → PermissionChecker (common)
```

## Testing Scenarios

### Scenario 1: Adding Permission to a New Grid Column

**User Query**: 
"How would I add a permission check for a sensitive column in the onboarding grid?"

**Expected Guidance:**
1. Reference OnboardingGridService.getGridData()
2. Show the canViewSensitive permission check
3. Explain filterSensitiveColumns() method
4. Show how to add new permission in permissions module

### Scenario 2: Creating a New SDUI Component

**User Query**:
"How do I add a new SDUI component type?"

**Expected Guidance:**
1. Add ComponentDefinition in LayoutBuilder
2. Handle in ComponentRenderer switch statement
3. Add gRPC message in onboarding.proto
4. Implement permission checks

### Scenario 3: Adding a New Permission Resource

**User Query**:
"How do I create a new permission resource for 'onboarding.reports'?"

**Expected Guidance:**
1. Use PermissionService.createPermission() in permissions module
2. Reference the resource in onboarding module
3. Implement Permitted interface
4. Add to LayoutBuilder with PermissionConfig

## Debugging

If features are not detected:
1. Check Output panel (Extension Host)
2. Look for debug logs:
   - "📝 File X has annotations: ..."
   - "✨ Component X (type) has annotations: ..."
   - "Found N primary entry points"
   - "Built feature: ..."

If cross-module deps not detected:
1. Check "Detected N modules" log
2. Verify pom.xml dependencies
3. Check module registration

## Success Criteria

✅ All 3 modules detected
✅ 8-10 features identified across modules
✅ Cross-module dependencies tracked
✅ Permitted interface implementations recognized
✅ SDUI pattern detected
✅ gRPC services identified as entry points
✅ Permission resources catalogued
✅ Can query: "how to apply permissions to onboarding"
✅ Can query: "explain SDUI architecture"
