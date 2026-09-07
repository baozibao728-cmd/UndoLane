# Final Live Demo Validation

Evidence: [three runs and SQLite verification](final-live-1788804618166/results.json). Exactly three real MiMo V2.5 runs, with fresh independent SQLite workspaces. No application code or prompt changes between runs. Human edits, previews and commits used the normal Web UI. No mock/fixture inference.

## Prompt used in all three attempts

For all approved assets, set the campaign to 'Autumn Launch' and rename each display_name with the prefix 'Autumn — '. Do not modify status or note.

## Results

| Take | Campaign / title | Model calls | Tool sequence | Agent Actions / Effects | Human Actions / Effects | Target Eligible / Protected | Commit / Hero retained | Active elapsed | Errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | both, two approved assets | 5 | list, get, get, patch, patch | 2 / 4 | 1 / 1 | 1 / 1 | yes / yes | 28.894 s | no product errors |
| 2 | both, two approved assets | 6 | list, get, get, patch, patch | 2 / 4 | 1 / 1 | 1 / 1 | yes / yes | 24.424 s | no product errors |
| 3 | both, two approved assets | 6 | list, get, get, patch, patch, list | 2 / 4 | not executed | not executed | not executed | 18.470 s | MODEL_BUDGET_EXCEEDED |

Tool names expand to assets_list, asset_get, asset_patch. The target is asset_b's two-field Agent Action. Each passing take separately undid asset_a's Action too (2 Eligible / 0 Protected), yielding 3 compensations across 2 commits. The original 2 Agent Actions/4 Effects and 1 Human Action/Effect remain.

The first two runs encountered a validation-harness relative-URL error during the final read-only audit. This was not a product API/tool/schema error. A corrected read-only browser/SQLite audit passed without additional model calls or business writes. Original workflow times were 26.715 s and 23.202 s; supplemental audit times were 2.179 s and 1.222 s. Active elapsed above sums these, excluding the scheduling gap. The raw JSON preserves the harness error separately.

## Final state for passing takes

asset_a: Cake 01, campaign null, approved, empty note. Title/campaign revisions both 2.

asset_b: Hero — Final, campaign null, approved, empty note. Title/campaign revisions both 2. The active title Effect belongs to the Human Action.

asset_c: Cake 03, campaign null, unapproved, empty note; all revisions 0.

All other fields retain revision 0. Real UI values and API field state agree with read-only SQLite checks. Original history and compensation records are present. Screenshots are alongside the evidence JSON.

Take 3 was stopped after the Agent failure: its 2 Actions/4 Effects remain in its isolated workspace. No automatic replay, Human edit or undo was performed.

## Recording readiness

2/3 full successes demonstrate the core Live flow, but do not establish reliable repeatability for an uncut live presentation. The issue is scheduling/tool-use efficiency under the existing six-response budget, not field ownership or MiMo response-schema compatibility. Take 3 spent its final response on another collection read rather than finishing. No must-fix compatibility bug was found. The budget and code were not changed.

## Final Recording Checklist

1. Stop the normal dev server. In PowerShell, select a new folder per take: `$env:UNDOLANE_WEB_DATA = '.undolane-web/recording-' + (Get-Date -Format 'yyyyMMdd-HHmmss')`; then `npm run dev`. This seeds a fresh database without deleting older evidence. Existing ignored `.env` supplies MiMo configuration.
2. Open http://127.0.0.1:5173/#/workspace. Confirm Cake 01/02/03, two approved, empty campaigns and revision 0.
3. Open New agent run, select Live model, and enter the prompt below. Do not use Demo recipe.
4. Look for assets_list, asset_get (if requested), and asset_patch. Confirm two Agent Actions and four recorded Effects, with both campaign and title actually changed. Only continue when the Run is completed; a failed Run is not a successful recording take.
5. Edit asset_b through its normal editor. Set display_name to Hero — Final, leaving the other fields unchanged.
6. Open asset_b's Action → Review undo → Preview Undo. Show 1 Eligible / 1 Protected and the Human ownership explanation. Let judges read the original title, Agent title and current Human title.
7. Commit. Show partially_undone, one restored and one preserved. Separately preview/commit asset_a's Action if showing the entire batch restored. Return to Workspace: campaigns null, asset_b title intact, revisions increased. History remains.
8. Edit out provider waiting time and navigation gaps if desired, labeling time compression. Keep the actual tool results, Human save, review counts, Commit result and final state visible. Never splice a Fixture result into a Live claim.
9. Hold on Undo Review for 15–20 seconds and the final preserved-title/result view for 8–12 seconds. Spend less time on terminal output; optionally finish with the architecture image.
10. Plan 2:30–3:00 for an edited explanatory recording. The successful automated active workflows took roughly 24–29 seconds, excluding human narration. Budget 3–4 minutes for an uncut take; provider latency can vary.

## Proposed final prompt (not yet validated)

For all approved assets, set campaign to 'Autumn Launch' and prefix each current display_name with 'Autumn — '. Do not modify status or note, and do not modify unapproved assets. Read assets_list first and use the returned exact revisions; call asset_get only if required information is missing. Put both field changes for each asset in a single asset_patch, and issue independent asset_patch calls together in one response when possible. After successful patch receipts, immediately give a one-sentence summary and finish; do not make an additional verification read. Do not undo anything.

This only clarifies tool planning and completion behavior; it does not hardcode IDs, revisions or outcomes. It is a recommendation, not a tested improvement: the three-run limit was honored and no fourth run was performed.
