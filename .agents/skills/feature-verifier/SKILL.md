---
name: feature-verifier
description: Use after implementing a feature to verify that the app builds and existing features pass.
---

# Feature Verification Protocol

Always execute empirical verification after implementing code changes to verify build and runtime integrity:

1. **Type & Syntax Check**: Run `npx tsc --noEmit` in the terminal to verify zero TypeScript errors.
2. **Production Build Check**: Run `npm run build` or `npm test` in the terminal to ensure Next.js packages without syntax, linting, or compilation errors.
3. **No Unchecked Success Claims**: Never declare a task complete without empirical terminal verification output confirming exit code 0.
