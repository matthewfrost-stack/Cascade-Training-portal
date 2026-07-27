---
name: additive-development
description: Use whenever adding a new feature, component, or endpoint to ensure existing code is not refactored or broken.
---

# Additive Development Guidelines

Follow these guidelines when adding new features, components, or API endpoints to the codebase:

1. **Reuse Existing Utilities and UI Components First**: Search the codebase for established components, icons, and helper functions before creating duplicates.
2. **Append or Create Isolated Files**: Place new functionality in new, modular files or append cleanly to existing files without rewriting existing functions.
3. **Preserve Core Working Logic**: Never delete, rewrite, or modify existing working business logic unless explicitly requested by the user.
4. **Interface Safety**: Halt and ask the user for confirmation if a proposed change requires altering or breaking an existing interface or method signature.
