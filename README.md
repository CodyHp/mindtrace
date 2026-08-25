# ObsTracker

Local-first attention analytics for Obsidian. It silently records how much time you spend on each note — reading and writing — then turns it into a **topic × time** dashboard so you can see where your attention actually goes.

## Features

- **Automatic, zero-friction tracking** — records open/switch/close, edit deltas, and idle/blur gaps in the background. No manual timers.
- **Folder-based topic classification** — time rolls up recursively along your folder tree, drill down from topic to subfolder to file.
- **Read vs. write inference** — heuristic split of active time into reading and writing.
- **Rich dashboard** (a dedicated note, not a sidebar):
  - topic × time heatmap, topic ranking with drill-down
  - active-hours, GitHub-style activity calendar
  - document activity (day / week / month / quarter / year)
  - this-week-vs-last, weekday distribution, attention flow
  - per-document word growth, read-vs-write, word trend
  - forgotten notes and revisit patterns
- **Export** — every chart exports to PNG / JSON / CSV.
- **Theme-aware UI** — charts follow your Obsidian theme and accent; optional custom base color.
- **i18n** — Simplified Chinese and English.

## Privacy

Everything stays local. Data is written as append-only JSONL to `.obstracker/` in your vault. No network, no telemetry, no cloud, and no note content is ever read or stored — only metadata (paths, timestamps, durations, character deltas).

## Install

1. Download the release (`main.js`, `manifest.json`, `styles.css`).
2. Copy them into `<vault>/.obsidian/plugins/obstracker/`.
3. Enable **ObsTracker** in Settings → Community plugins.

Or install directly from the Obsidian Community Plugins directory.

## Usage

- Enable the plugin; tracking starts automatically.
- Click the chart icon in the ribbon, or run **"Open dashboard"**, to open the dedicated dashboard note.
- You can also embed the dashboard anywhere with a ` ```obstracker ` code block.

Data is stored in `.obstracker/events-YYYY-MM-DD.jsonl` (append-only, one file per day).

## Development

```bash
npm install
npm run dev     # watch & build
npm run build   # type-check + production build
npm test        # unit tests
```

## License

[MIT](LICENSE)
