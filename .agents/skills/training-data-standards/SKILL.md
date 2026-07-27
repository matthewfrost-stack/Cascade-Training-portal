---
name: training-data-standards
description: Use when modifying user progress, course state, or adding backend endpoints.
---

# Training Data & State Standards

Follow these rules when extending data models, user progress states, or API route payloads:

1. **Additive Type Extensions**: Always extend TypeScript interfaces and database types additively using optional fields (`?`), union types, or interface extension (`interface Extended extends Base`).
2. **Backwards Compatibility**: Maintain full backwards compatibility with existing stored user training records, matrix data, and API contracts.
3. **Data Protection**: Do not remove, rename, or mutate existing database fields or JSON keys without explicit data migration paths.
