# 2027 planner proof verification

The planner proof command performs the machine-checkable release gates first.
This checklist is the separate human inspection pass for appearance, usability,
and real viewer behavior.

## Generate the proof set

From the workspace root, run:

```bash
pnpm --filter @workspace/scripts run proof:planner
```

The command must exit successfully before inspection. It writes these files to
the gitignored `proof/` directory:

- `2027-monday-vertical.pdf`
- `2027-sunday-vertical.pdf`
- `2027-monday-landscape.pdf`
- `2027-13month-monday.pdf`

Record the command summary with the inspection results. Do not inspect or
approve a set if the command reports a failed assertion.

## Inspection procedure

Open each PDF at 100% in the target tablet viewer and check these items in order:

1. **Cover** — confirm the year, edition name, applied theme, and week-start
   claim match the filename.
2. **March month spread** — confirm March 1 is under the correct weekday, the
   grid is not crowded, day numbers are legible, and trailing empty cells look
   intentional rather than broken.
3. **Week spread** — confirm seven correctly dated day columns, then inspect the
   first and last weekly pages for controls that lead nowhere.
4. **Day page** — confirm the date and sections are correct, and open a calendar
   link to verify it targets that date.
5. **Navigation round-trip** — from the month grid, enter a day, return to the
   month, then move forward one week.
6. **Typography and density** — at 100% on a tablet-sized view, confirm type is
   legible and the page does not feel cramped.

Repeat the pass in each viewer app that matters for release: GoodNotes,
Notability, and Noteshelf.

## Results

Leave this table empty until a person performs the inspection.

| Date | File | Device | Viewer app | Theme | Run by | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |