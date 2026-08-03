---
trigger: Always On
---

# Mandatory Execution Workflow

These rules apply to **every task** in this workspace, no exceptions.

---

## 1. Plan Before You Code

Before editing or creating any source files, you **MUST** generate an Implementation Plan artifact that lists:
- The exact files you intend to **create** (marked `[NEW]`)
- The exact files you intend to **modify** (marked `[MODIFY]`)
- A one-line description of what changes in each file

Wait for explicit user confirmation on the plan before making any workspace file edits.

---

## 2. Break Down Large Tasks

If a task requires touching **more than 3 existing files**, halt immediately and propose breaking it into smaller, individually-confirmable sub-tasks. Do not proceed until the user approves the breakdown.

---

## 3. Keep Changes Additive

- Reuse existing components and utilities wherever possible.
- Never delete or restructure working code unless the user explicitly asks for it.
- If a change requires breaking an existing interface or prop contract, stop and explain the impact before proceeding.

---

## 4. Update PROJECT_SUMMARY.md After Every Change

After completing any task that introduces a **new page, component, API route, or major feature**, you **must** update `PROJECT_SUMMARY.md` in the project root:

| What was added | Where to update in PROJECT_SUMMARY.md |
|---|---|
| New page/route | §5 Key Pages |
| New shared component | §6 Shared Components table |
| New API endpoint | §7 API Routes table |
| New skill or workflow | §10 Agent Skill Rules table |
| New permission or role | §4 Core Concepts |

Update the `*Last updated:*` date at the bottom of the file to today's date.

---

## 5. Verify Before Closing

After all changes, run:
```bash
npx tsc --noEmit
```
Confirm it exits with zero errors before declaring the task complete. If a build error is introduced, fix it before closing the task — do not leave the codebase in a broken state.
