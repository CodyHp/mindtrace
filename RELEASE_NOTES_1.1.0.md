## What's new in 1.1.0

### Word tracking (IME-safe)
- Replaced per-character tracking with idle-pause sampling: on a short pause, the doc's char count is sampled and the net delta is logged (+added / -deleted), so deletions are now visualized correctly without IME composition noise.

### Performance
- Reuse ECharts instances instead of disposing/rebuilding every chart on each render.
- Charts render lazily as they scroll into view, and update through async idle scheduling.
- Parsed event files are cached by mtime/size to avoid repeated I/O.

### Fixes
- Exclude the dashboard note itself from tracking (it was inflating char counts and active time).
- Auto-refresh the dashboard when switching back to it.
- Follow Obsidian theme changes via css-change; language switch forces re-render.
