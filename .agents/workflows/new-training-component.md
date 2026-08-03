---
name: new-training-component
description: Use this workflow when creating any new UI component related to training, courses, progress, or compliance views. Ensures type-safe, isolated, build-verified delivery.
---

# Workflow: New Training Component

Follow these 4 steps **in order**, completing each before moving to the next.

---

## Step 1 – Inspect Existing Data Models

Before writing any code, read the relevant types and existing components to understand the data shapes already in use:

- Read `src/app/training-matrix/types.ts` for matrix-level types.
- Read `src/app/components/TrainingCourseChecker.tsx` (top ~100 lines) to see how training records are shaped.
- Check `src/app/components/RecordHoverPopoverModal.tsx` for the shared popover/modal pattern.
- Check `src/lib/permissions.ts` to understand role-gating conventions.

**Goal:** Know exactly what props and data structures the new component will consume before writing a line.

---

## Step 2 – Draft the Component in an Isolated File

- Create the new file at `src/app/components/<ComponentName>.tsx`.
- Do **not** modify any existing files in this step.
- Follow the project UI conventions:
  - Accept `isDark: boolean` as a prop for theme support.
  - Use Tailwind utility classes consistent with neighbouring components.
  - Export the component as a **named default export**.
  - Add a JSDoc comment at the top describing what the component does.

---

## Step 3 – Wire Up the Import (Additive Only)

- Import the new component into the **one** parent page or component that needs it.
- Do **not** refactor or reorganise the parent file — only add the import line and the JSX usage.
- If the component needs an API endpoint that doesn't exist yet, create `src/app/api/<name>/route.ts` as a separate isolated file before wiring it up.

---

## Step 4 – Verify the Build

Run the following commands and confirm both pass with zero errors before declaring the task done:

```bash
npx tsc --noEmit
npm run build
```

If there are TypeScript or build errors, fix them in the isolated new files only. Do not touch unrelated files to suppress errors.

---

## Post-completion

After the build passes, **update `PROJECT_SUMMARY.md`** in the project root:
- Add the new component to the **§6 Shared Components** table.
- Add any new API routes to the **§7 API Routes** table.
