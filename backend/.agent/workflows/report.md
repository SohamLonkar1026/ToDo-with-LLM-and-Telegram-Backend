---
description: generate a detailed report with full code files in the reports folder
---

When the user says "give me the report" or "make report", follow these steps precisely:

## 0. Ensure Reports Folder Exists
- Check if a `reports/` folder exists in the project root.
- If it does NOT exist, create it before proceeding.

## 1. Identify Recent Changes
- Look at the most recent user prompt(s) and all code changes made since then.
- List every file that was modified, created, or deleted.

## 2. Create the Report
Save a new markdown file to the project's `reports/` folder, named descriptively (e.g., `reports/settings_validation_report.md`).

## 3. Report Structure
The report MUST contain the following sections in this order:

### Header
- Title, date, and scope of the changes.

### Summary of Changes
- A brief paragraph explaining what was done and why.

### Per-File Breakdown
For **each file that was changed**, create a section with:
1. **File path** (e.g., `backend/src/controllers/settings.controller.ts`)
2. **What changed** — list the specific lines/snippets that were modified.
3. **Why it changed** — the logic or reasoning behind each modification.
4. **Diff view** — show the before/after using a fenced `diff` code block:
   ```diff
   -old line
   +new line
   ```
5. **Full updated file** — paste the ENTIRE current contents of the file in a fenced code block with the correct language identifier (e.g., ```typescript, ```tsx, ```prisma).

### Verification
- Include build/compile results if applicable.
- Note any tests run or manual checks performed.

## 4. Notify User
After saving the report, notify the user with a link to the new report file.
