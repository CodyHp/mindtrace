import * as echarts from "echarts/core";
import { BarChart, GraphChart, HeatmapChart, LineChart } from "echarts/charts";
import { CalendarComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { FolderNode, Report, RevisitMode } from "../report/aggregate";
import { UNCATEGORIZED } from "../report/classify";
import { calendarDayLabels, t, weekdayLabels } from "../i18n";
import { localDay } from "../utils";

echarts.use([
  BarChart,
  GraphChart,
  HeatmapChart,
  LineChart,
  CalendarComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

// ---------- 主题桥接 ----------
interface ThemeVars {
  accent: string;
  textNormal: string;
  textMuted: string;
  textFaint: string;
  border: string;
  bg: string;
}

let colorThemeOverride: string | null = null;

export function setColorTheme(color: string): void {
  colorThemeOverride = color === "theme" ? null : color;
}

function readTheme(): ThemeVars {
  const css = getComputedStyle(document.body);
  const get = (name: string, fb: string): string => {
    const v = css.getPropertyValue(name).trim();
    return v || fb;
  };
  return {
    accent: colorThemeOverride ?? get("--interactive-accent", "#7c5cff"),
    textNormal: get("--text-normal", "#3d3d3d"),
    textMuted: get("--text-muted", "#8a8a8a"),
    textFaint: get("--text-faint", "#b0b0b0"),
    border: get("--background-modifier-border", "rgba(128,128,128,0.22)"),
    bg: get("--background-secondary", "#f2f2f2"),
  };
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  if (!ca || !cb) return a;
  const ch = [0, 1, 2].map((i) => Math.round(ca[i] + (cb[i] - ca[i]) * t));
  return `#${ch.map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

// ---------- 图表实例管理 ----------
type Chart = ReturnType<typeof echarts.init>;
let activeCharts: Chart[] = [];

function initChart(el: HTMLElement): Chart {
  const chart = echarts.init(el);
  activeCharts.push(chart);
  return chart;
}

function disposeCharts(): void {
  for (const c of activeCharts) c.dispose();
  activeCharts = [];
}

export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}

function baseTooltip(theme: ThemeVars) {
  return {
    backgroundColor: theme.bg,
    borderColor: theme.border,
    textStyle: { color: theme.textNormal },
  };
}

function axisCommon(theme: ThemeVars) {
  return {
    axisLine: { lineStyle: { color: theme.border } },
    axisTick: { lineStyle: { color: theme.border } },
    splitLine: { lineStyle: { color: theme.border } },
  };
}

function displayFolder(folder: string): string {
  return folder === UNCATEGORIZED ? t("uncategorized") : folder;
}

function card(el: HTMLElement, title: string): HTMLElement {
  const box = el.createEl("div", { cls: "obstracker-card" });
  const h3 = box.createEl("h3");
  h3.createEl("span", { text: title });
  return box;
}

function emptyHint(box: HTMLElement): void {
  box.createEl("div", {
    cls: "obstracker-empty",
    text: t("empty"),
  });
}

// ---------- 导出 ----------
function downloadUrl(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

function downloadText(text: string, filename: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  downloadUrl(url, filename);
  URL.revokeObjectURL(url);
}

function toCsv(data: unknown): string | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  const first = data[0] as Record<string, unknown>;
  const keys = Object.keys(first);
  const esc = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    if (typeof v === "object") return `"${JSON.stringify(v).replace(/"/g, '""')}"`;
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = keys.join(",");
  const rows = data.map((row) => keys.map((k) => esc((row as Record<string, unknown>)[k])).join(","));
  return [header, ...rows].join("\n");
}

/** 在卡片标题栏加 PNG / JSON / CSV 导出按钮 */
function addExportActions(box: HTMLElement, chart: Chart, data: unknown, name: string): void {
  const h3 = box.querySelector("h3");
  if (!h3) return;
  const actions = h3.createEl("div", { cls: "obstracker-card-actions" });

  const pngBtn = actions.createEl("button", { cls: "obstracker-back", text: "PNG" });
  pngBtn.title = t("exportImage");
  pngBtn.onclick = (): void => {
    const url = chart.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "transparent" });
    downloadUrl(url, `${name}.png`);
  };

  const jsonBtn = actions.createEl("button", { cls: "obstracker-back", text: "JSON" });
  jsonBtn.title = t("exportData");
  jsonBtn.onclick = (): void => {
    downloadText(JSON.stringify(data, null, 2), `${name}.json`, "application/json");
  };

  const csv = toCsv(data);
  if (csv) {
    const csvBtn = actions.createEl("button", { cls: "obstracker-back", text: "CSV" });
    csvBtn.title = t("exportCsv");
    csvBtn.onclick = (): void => {
      downloadText(csv, `${name}.csv`, "text/csv");
    };
  }
}

// ---------- 渲染入口 ----------
export function renderReport(el: HTMLElement, report: Report, openFile?: (path: string) => void): void {
  disposeCharts();
  el.empty();
  el.addClass("obstracker-report");

  renderKpis(el, report);
  renderToday(el, report);

  if (report.totalSeconds === 0) {
    const box = card(el, t("startRecording"));
    emptyHint(box);
    return;
  }

  renderMatrix(el, report);
  renderFolderBars(el, report.folderTree);
  renderWritePeak(el, report);
  renderCalendar(el, report);
  renderDocActivity(el, report);
  renderWeekCompare(el, report);
  renderWeekday(el, report);
  renderFlow(el, report);
  renderDocGrowth(el, report);
  renderReadWrite(el, report);
  renderWordTrend(el, report);
  renderDocs(el, report, openFile);
  renderTimeline(el, report);
}

function renderKpis(el: HTMLElement, report: Report): void {
  const kpis = el.createEl("div", { cls: "obstracker-kpis" });
  const add = (label: string, value: string): void => {
    const k = kpis.createEl("div", { cls: "obstracker-kpi" });
    k.createEl("div", { cls: "obstracker-kpi-value", text: value });
    k.createEl("div", { cls: "obstracker-kpi-label", text: label });
  };
  add(t("kpiToday"), fmtDuration(report.today.activeSeconds));
  add(t("kpiStreak"), t("days", { n: report.streak }));
  add(t("kpiRead"), fmtDuration(report.totalReadSeconds));
  add(t("kpiWrite"), fmtDuration(report.totalWriteSeconds));
}

function renderToday(el: HTMLElement, report: Report): void {
  const box = card(el, t("today"));
  const today = report.today;

  const summary = box.createEl("div", { cls: "obstracker-today-summary" });
  const active = summary.createEl("div", { cls: "obstracker-today-big" });
  active.createEl("div", { cls: "obstracker-today-value", text: fmtDuration(today.activeSeconds) });
  active.createEl("div", { cls: "obstracker-today-label", text: t("activeTime") });
  const words = summary.createEl("div", { cls: "obstracker-today-big" });
  words.createEl("div", { cls: "obstracker-today-value", text: t("chars", { n: today.addedChars }) });
  words.createEl("div", { cls: "obstracker-today-label", text: t("todayWriting") });

  if (today.topFolders.length > 0) {
    const list = box.createEl("div", { cls: "obstracker-today-folders" });
    for (const f of today.topFolders) {
      const row = list.createEl("div", { cls: "obstracker-doc-row" });
      row.createEl("span", { cls: "obstracker-doc-path", text: displayFolder(f.folder) });
      row.createEl("span", { cls: "obstracker-doc-count", text: fmtDuration(f.seconds) });
    }
  } else {
    box.createEl("div", { cls: "obstracker-empty", text: t("todayEmpty") });
  }
}

function renderMatrix(el: HTMLElement, report: Report): void {
  const box = card(el, t("timeByTopic"));
  const theme = readTheme();

  const folderTotals = new Map<string, number>();
  for (const c of report.matrix) folderTotals.set(c.folder, (folderTotals.get(c.folder) ?? 0) + c.seconds);
  const folders = [...folderTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map((x) => x[0]);
  if (folders.length === 0) {
    emptyHint(box);
    return;
  }

  const cellMap = new Map<string, number>();
  for (const c of report.matrix) cellMap.set(`${c.hour}|${c.folder}`, c.seconds);
  const maxSec = Math.max(1, ...report.matrix.map((c) => c.seconds));

  const data: [number, number, number][] = [];
  for (let fi = 0; fi < folders.length; fi++) {
    for (let h = 0; h < 24; h++) {
      const secs = cellMap.get(`${h}|${folders[fi]}`) ?? 0;
      if (secs > 0) data.push([h, fi, secs]);
    }
  }

  const div = box.createEl("div", { cls: "obstracker-chart obstracker-chart-tall" });
  const chart = initChart(div);
  chart.setOption({
    tooltip: {
      ...baseTooltip(theme),
      position: "top",
      formatter: (p: { value: [number, number, number] }) =>
        `${displayFolder(folders[p.value[1]])} · ${p.value[0]}:00-${p.value[0] + 1}:00 · ${fmtDuration(p.value[2])}`,
    },
    grid: { left: 150, right: 20, top: 10, bottom: 55 },
    xAxis: {
      type: "category",
      data: Array.from({ length: 24 }, (_, i) => `${i}`),
      splitArea: { show: true },
      ...axisCommon(theme),
    },
    yAxis: { type: "category", data: folders.map(displayFolder), splitArea: { show: true }, ...axisCommon(theme) },
    visualMap: {
      min: 0,
      max: maxSec,
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      inRange: { color: [mixHex(theme.accent, theme.bg, 0.88), theme.accent] },
      textStyle: { color: theme.textMuted },
    },
    series: [{ type: "heatmap", data, emphasis: { itemStyle: { borderColor: theme.textNormal, borderWidth: 1 } } }],
  } as any);
  addExportActions(box, chart, report.matrix, "time-topic");
}

function renderFolderBars(el: HTMLElement, tree: FolderNode[]): void {
  const box = card(el, t("topicRanking"));
  const theme = readTheme();
  if (tree.length === 0) {
    emptyHint(box);
    return;
  }

  const stack: FolderNode[][] = [tree];
  const path: string[] = [];
  const toolbar = box.createEl("div", { cls: "obstracker-toolbar" });
  const pathLabel = toolbar.createEl("span", { cls: "obstracker-path", text: t("all") });
  const backBtn = toolbar.createEl("button", { text: t("backUp"), cls: "obstracker-back" });
  backBtn.style.display = "none";

  const div = box.createEl("div", { cls: "obstracker-chart" });
  const chart = initChart(div);

  const draw = (): void => {
    const nodes = stack[stack.length - 1];
    const names = nodes.map((n) => n.folder);
    const values = nodes.map((n) => n.seconds);
    chart.setOption({
      tooltip: {
        ...baseTooltip(theme),
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (p: { name: string; value: number }[]) => `${displayFolder(p[0].name)}<br/>${fmtDuration(p[0].value)}`,
      },
      grid: { left: 160, right: 50, top: 10, bottom: 30 },
      xAxis: { type: "value", ...axisCommon(theme), axisLabel: { color: theme.textMuted, formatter: (v: number) => fmtDuration(v) } },
      yAxis: { type: "category", data: names.map(displayFolder), inverse: true, ...axisCommon(theme) },
      series: [{ type: "bar", data: values, barMaxWidth: 20, itemStyle: { color: mixHex(theme.accent, theme.bg, 0.2), borderRadius: [0, 4, 4, 0] } }],
    } as any);
    chart.off("click");
    chart.on("click", (params: { dataIndex: number }) => {
      const node = nodes[params.dataIndex];
      if (node && node.children.length > 0) {
        stack.push(node.children);
        path.push(node.folder);
        pathLabel.textContent = path.map(displayFolder).join(" / ");
        draw();
      }
    });
    backBtn.style.display = stack.length > 1 ? "" : "none";
  };

  addExportActions(box, chart, tree, "topic-ranking");

  backBtn.onclick = (): void => {
    if (stack.length > 1) {
      stack.pop();
      path.pop();
      pathLabel.textContent = path.length ? path.map(displayFolder).join(" / ") : t("all");
      draw();
    }
  };

  draw();
}

function renderWritePeak(el: HTMLElement, report: Report): void {
  const box = card(el, t("activeHours"));
  const theme = readTheme();
  const div = box.createEl("div", { cls: "obstracker-chart" });
  const chart = initChart(div);
  chart.setOption({
    tooltip: { ...baseTooltip(theme), trigger: "axis", valueFormatter: (v: number) => fmtDuration(v) },
    legend: { data: [t("read"), t("write")], top: 0, textStyle: { color: theme.textMuted } },
    grid: { left: 60, right: 20, top: 34, bottom: 30 },
    xAxis: { type: "category", data: report.writePeak.map((p) => `${p.hour}`), ...axisCommon(theme) },
    yAxis: { type: "value", ...axisCommon(theme), axisLabel: { color: theme.textMuted, formatter: (v: number) => fmtDuration(v) } },
    series: [
      { name: t("read"), type: "bar", stack: "t", data: report.writePeak.map((p) => p.readSeconds), itemStyle: { color: mixHex(theme.accent, theme.bg, 0.5) } },
      { name: t("write"), type: "bar", stack: "t", data: report.writePeak.map((p) => p.writeSeconds), itemStyle: { color: theme.accent } },
    ],
  } as any);
  addExportActions(box, chart, report.writePeak, "active-hours");
}

function renderCalendar(el: HTMLElement, report: Report): void {
  const box = card(el, t("activeCalendar"));
  const theme = readTheme();

  const stats = box.createEl("div", { cls: "obstracker-calendar-stats" });
  stats.createEl("span", { text: `${t("currentStreak")} ${t("days", { n: report.streak })}` });
  stats.createEl("span", { text: `${t("longestStreak")} ${t("days", { n: report.bestStreak })}` });

  if (report.dailyActive.length === 0) {
    emptyHint(box);
    return;
  }

  const maxSec = Math.max(1, ...report.dailyActive.map((d) => d.seconds));
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 364); // 近一年

  const div = box.createEl("div", { cls: "obstracker-chart" });
  const chart = initChart(div);
  chart.setOption({
    tooltip: {
      ...baseTooltip(theme),
      formatter: (p: { value: [string, number] }) => `${p.value[0]}<br/>${fmtDuration(p.value[1])}`,
    },
    visualMap: {
      min: 0,
      max: maxSec,
      calculable: false,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      inRange: { color: [mixHex(theme.accent, theme.bg, 0.9), theme.accent] },
      textStyle: { color: theme.textMuted },
    },
    calendar: {
      range: [localDay(start.getTime()), localDay(now.getTime())],
      cellSize: ["auto", 13],
      yearLabel: { show: false },
      dayLabel: { nameMap: calendarDayLabels(), color: theme.textMuted },
      monthLabel: { color: theme.textMuted },
      itemStyle: { color: theme.bg, borderColor: theme.border, borderWidth: 2 },
      splitLine: { lineStyle: { color: theme.border } },
    },
    series: [
      {
        type: "heatmap",
        coordinateSystem: "calendar",
        data: report.dailyActive.map((d) => [d.day, d.seconds]),
      },
    ],
  } as any);
  addExportActions(box, chart, report.dailyActive, "activity-calendar");
}

function renderDocActivity(el: HTMLElement, report: Report): void {
  const box = card(el, t("docActivity"));
  const theme = readTheme();

  const modes = [
    { label: t("day"), data: report.docActivityDaily },
    { label: t("week"), data: report.docActivityWeekly },
    { label: t("month"), data: report.docActivityMonthly },
    { label: t("quarter"), data: report.docActivityQuarterly },
    { label: t("year"), data: report.docActivityYearly },
  ];
  let currentMode = 2; // 默认月

  const switcher = box.createEl("div", { cls: "obstracker-doc-growth-switcher" });
  const buttons: HTMLElement[] = [];
  modes.forEach((m, i) => {
    const btn = switcher.createEl("button", { cls: "obstracker-back", text: m.label });
    buttons.push(btn);
    if (i === currentMode) btn.addClass("obstracker-active");
    btn.onclick = (): void => {
      currentMode = i;
      buttons.forEach((b) => b.removeClass("obstracker-active"));
      btn.addClass("obstracker-active");
      draw();
    };
  });

  const div = box.createEl("div", { cls: "obstracker-chart" });
  const chart = initChart(div);

  const draw = (): void => {
    let data = modes[currentMode].data;
    if (currentMode === 0) data = data.slice(-90); // 天粒度只显示最近 90 天
    chart.setOption({
      tooltip: { ...baseTooltip(theme), trigger: "axis" },
      legend: { data: [t("activeDocs"), t("writeDocs")], top: 0, textStyle: { color: theme.textMuted } },
      grid: { left: 50, right: 20, top: 34, bottom: 30 },
      xAxis: { type: "category", data: data.map((d) => d.period), ...axisCommon(theme) },
      yAxis: { type: "value", ...axisCommon(theme) },
      series: [
        { name: t("activeDocs"), type: "line", data: data.map((d) => d.activeDocs), lineStyle: { color: mixHex(theme.accent, theme.bg, 0.4) }, itemStyle: { color: mixHex(theme.accent, theme.bg, 0.4) }, symbolSize: 5 },
        { name: t("writeDocs"), type: "line", data: data.map((d) => d.writeDocs), lineStyle: { color: theme.accent }, itemStyle: { color: theme.accent }, symbolSize: 5 },
      ],
    } as any);
  };
  draw();
  addExportActions(box, chart, report.docActivityMonthly, "doc-activity");
}

function renderWeekCompare(el: HTMLElement, report: Report): void {
  const box = card(el, t("weekCompare"));
  const theme = readTheme();
  if (report.weekCompare.length === 0) {
    emptyHint(box);
    return;
  }
  const folders = report.weekCompare.map((w) => w.folder);
  const div = box.createEl("div", { cls: "obstracker-chart" });
  const chart = initChart(div);
  chart.setOption({
    tooltip: { ...baseTooltip(theme), trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: number) => fmtDuration(v) },
    legend: { data: [t("thisWeek"), t("lastWeek")], top: 0, textStyle: { color: theme.textMuted } },
    grid: { left: 140, right: 30, top: 34, bottom: 30 },
    xAxis: { type: "value", ...axisCommon(theme), axisLabel: { color: theme.textMuted, formatter: (v: number) => fmtDuration(v) } },
    yAxis: { type: "category", data: folders.map(displayFolder), inverse: true, ...axisCommon(theme) },
    series: [
      { name: t("thisWeek"), type: "bar", data: report.weekCompare.map((w) => w.thisWeek), itemStyle: { color: theme.accent, borderRadius: [0, 4, 4, 0] } },
      { name: t("lastWeek"), type: "bar", data: report.weekCompare.map((w) => w.lastWeek), itemStyle: { color: mixHex(theme.accent, theme.bg, 0.5), borderRadius: [0, 4, 4, 0] } },
    ],
  } as any);
  addExportActions(box, chart, report.weekCompare, "week-compare");
}

function renderWeekday(el: HTMLElement, report: Report): void {
  const box = card(el, t("weekdayDist"));
  const theme = readTheme();
  const labels = weekdayLabels();
  const div = box.createEl("div", { cls: "obstracker-chart" });
  const chart = initChart(div);
  chart.setOption({
    tooltip: { ...baseTooltip(theme), trigger: "axis", valueFormatter: (v: number) => fmtDuration(v) },
    grid: { left: 60, right: 20, top: 16, bottom: 30 },
    xAxis: { type: "category", data: labels, ...axisCommon(theme) },
    yAxis: { type: "value", ...axisCommon(theme), axisLabel: { color: theme.textMuted, formatter: (v: number) => fmtDuration(v) } },
    series: [{ type: "bar", data: report.weekday.map((w) => w.seconds), itemStyle: { color: mixHex(theme.accent, theme.bg, 0.25), borderRadius: [4, 4, 0, 0] } }],
  } as any);
  addExportActions(box, chart, report.weekday, "weekday-distribution");
}

function renderFlow(el: HTMLElement, report: Report): void {
  const box = card(el, t("attentionFlow"));
  const theme = readTheme();
  if (report.flow.length === 0) {
    emptyHint(box);
    return;
  }
  // 节点度数 = 切换总次数（出度 + 入度），用于节点大小
  const degree = new Map<string, number>();
  for (const f of report.flow) {
    degree.set(f.source, (degree.get(f.source) ?? 0) + f.value);
    degree.set(f.target, (degree.get(f.target) ?? 0) + f.value);
  }
  const maxDegree = Math.max(1, ...degree.values());

  const div = box.createEl("div", { cls: "obstracker-chart obstracker-chart-tall" });
  const chart = initChart(div);
  chart.setOption({
    tooltip: {
      ...baseTooltip(theme),
      trigger: "item",
      formatter: (p: { dataType?: string; name?: string; value?: number; data?: { source: string; target: string; value: number } }) => {
        if (p.dataType === "edge") return `${displayFolder(p.data?.source ?? "")} → ${displayFolder(p.data?.target ?? "")}<br/>${t("switchCount", { n: p.data?.value ?? 0 })}`;
        return `${displayFolder(p.name ?? "")}<br/>${t("switchCount", { n: p.value ?? 0 })}`;
      },
    },
    series: [
      {
        type: "graph",
        layout: "force",
        data: [...degree.entries()].map(([name, value]) => ({
          name: displayFolder(name),
          value,
          symbolSize: 22 + (value / maxDegree) * 42,
        })),
        links: report.flow.map((f) => ({ source: displayFolder(f.source), target: displayFolder(f.target), value: f.value })),
        roam: true,
        draggable: true,
        edgeSymbol: ["none", "arrow"],
        edgeSymbolSize: 7,
        lineStyle: { color: mixHex(theme.accent, theme.bg, 0.3), width: 1, curveness: 0.12, opacity: 0.6 },
        itemStyle: { color: theme.accent },
        label: { show: true, color: theme.textNormal, fontSize: 12 },
        emphasis: { focus: "adjacency" },
        force: { repulsion: 280, edgeLength: 130, gravity: 0.1 },
      },
    ],
  } as any);
  addExportActions(box, chart, report.flow, "attention-flow");
}

function renderDocGrowth(el: HTMLElement, report: Report): void {
  const box = card(el, t("docGrowth"));
  const theme = readTheme();
  if (report.docGrowth.length === 0) {
    emptyHint(box);
    return;
  }
  let current = report.docGrowth[0];
  const title = box.createEl("div", { cls: "obstracker-doc-growth-title", text: current.notePath });
  const div = box.createEl("div", { cls: "obstracker-chart" });
  const chart = initChart(div);

  const draw = (): void => {
    chart.setOption({
      tooltip: { ...baseTooltip(theme), trigger: "axis" },
      grid: { left: 70, right: 20, top: 16, bottom: 30 },
      xAxis: { type: "time", ...axisCommon(theme) },
      yAxis: { type: "value", name: t("cumulativeChars"), nameTextStyle: { color: theme.textFaint }, ...axisCommon(theme) },
      series: [
        {
          type: "line",
          showSymbol: false,
          data: current.points.map((p) => [p.ts, p.cumulative]),
          lineStyle: { color: theme.accent },
          itemStyle: { color: theme.accent },
          areaStyle: { color: mixHex(theme.accent, theme.bg, 0.85) },
        },
      ],
    } as any);
  };
  draw();
  addExportActions(box, chart, report.docGrowth, "word-growth");

  const switcher = box.createEl("div", { cls: "obstracker-doc-growth-switcher" });
  const buttons: HTMLElement[] = [];
  for (const d of report.docGrowth.slice(0, 6)) {
    const btn = switcher.createEl("button", { cls: "obstracker-back", text: d.notePath.split("/").pop() ?? d.notePath });
    buttons.push(btn);
    btn.onclick = (): void => {
      current = d;
      title.textContent = d.notePath;
      buttons.forEach((b) => b.removeClass("obstracker-active"));
      btn.addClass("obstracker-active");
      draw();
    };
  }
  if (buttons.length > 0) buttons[0].addClass("obstracker-active");
}

function renderReadWrite(el: HTMLElement, report: Report): void {
  const box = card(el, t("readWriteByDay"));
  const theme = readTheme();
  if (report.readWriteByDay.length === 0) {
    emptyHint(box);
    return;
  }
  const days = report.readWriteByDay.slice(-14);
  const div = box.createEl("div", { cls: "obstracker-chart" });
  const chart = initChart(div);
  chart.setOption({
    tooltip: { ...baseTooltip(theme), trigger: "axis", valueFormatter: (v: number) => fmtDuration(v) },
    legend: { data: [t("read"), t("write")], top: 0, textStyle: { color: theme.textMuted } },
    grid: { left: 70, right: 20, top: 34, bottom: 30 },
    xAxis: { type: "category", data: days.map((d) => d.day), ...axisCommon(theme) },
    yAxis: { type: "value", ...axisCommon(theme), axisLabel: { color: theme.textMuted, formatter: (v: number) => fmtDuration(v) } },
    series: [
      { name: t("read"), type: "bar", stack: "t", data: days.map((d) => d.readSeconds), itemStyle: { color: mixHex(theme.accent, theme.bg, 0.5) } },
      { name: t("write"), type: "bar", stack: "t", data: days.map((d) => d.writeSeconds), itemStyle: { color: theme.accent } },
    ],
  } as any);
  addExportActions(box, chart, report.readWriteByDay, "read-write");
}

function renderWordTrend(el: HTMLElement, report: Report): void {
  const box = card(el, t("wordTrend"));
  const theme = readTheme();
  if (report.wordTrend.length === 0) {
    emptyHint(box);
    return;
  }
  const days = report.wordTrend.slice(-14);
  const div = box.createEl("div", { cls: "obstracker-chart" });
  const chart = initChart(div);
  chart.setOption({
    tooltip: { ...baseTooltip(theme), trigger: "axis" },
    grid: { left: 60, right: 20, top: 16, bottom: 30 },
    xAxis: { type: "category", data: days.map((d) => d.day), ...axisCommon(theme) },
    yAxis: { type: "value", name: t("addedChars"), nameTextStyle: { color: theme.textFaint }, ...axisCommon(theme) },
    series: [
      { name: t("addedChars"), type: "line", data: days.map((d) => d.addedChars), lineStyle: { color: theme.accent }, itemStyle: { color: theme.accent }, areaStyle: { color: mixHex(theme.accent, theme.bg, 0.85) }, symbolSize: 6 },
    ],
  } as any);
  addExportActions(box, chart, report.wordTrend, "word-trend");
}

function renderDocs(el: HTMLElement, report: Report, openFile?: (path: string) => void): void {
  const box = card(el, t("docProfile"));
  const theme = readTheme();
  const cols = box.createEl("div", { cls: "obstracker-doc-cols" });

  const forgotBox = cols.createEl("div");
  forgotBox.createEl("h4", { text: t("forgotten") });
  if (report.forgottenDocs.length === 0) {
    emptyHint(forgotBox);
  } else {
    for (const d of report.forgottenDocs.slice(0, 10)) {
      const row = forgotBox.createEl("div", { cls: "obstracker-doc-row" });
      docLink(row, d.notePath, openFile);
      row.createEl("span", { cls: "obstracker-doc-count", text: lastText(d.lastTs) });
    }
  }

  const revisitBox = cols.createEl("div");
  revisitBox.createEl("h4", { text: t("revisitMode") });
  if (report.revisit.length === 0) {
    emptyHint(revisitBox);
  } else {
    for (const d of report.revisit) {
      const row = revisitBox.createEl("div", { cls: "obstracker-doc-row" });
      docLink(row, d.notePath, openFile);
      const tag = row.createEl("span", { cls: "obstracker-tag", text: modeLabel(d.mode) });
      tag.style.color = modeColor(d.mode, theme);
      tag.style.borderColor = modeColor(d.mode, theme);
    }
  }
}

function docLink(parent: HTMLElement, notePath: string, openFile?: (path: string) => void): void {
  const el = parent.createEl("span", { cls: "obstracker-doc-path obstracker-doc-link", text: notePath });
  if (openFile) {
    el.onclick = (): void => openFile(notePath);
  }
}

function modeColor(mode: RevisitMode, theme: ThemeVars): string {
  if (mode === "深耕型") return theme.accent;
  if (mode === "复习型") return "#50a078";
  return "#dc8250";
}

function modeLabel(mode: RevisitMode): string {
  if (mode === "深耕型") return t("deep");
  if (mode === "复习型") return t("review");
  return t("stuck");
}

function renderTimeline(el: HTMLElement, report: Report): void {
  const box = card(el, t("timeline"));
  if (report.timeline.length === 0) {
    emptyHint(box);
    return;
  }

  let expanded = false;
  const table = box.createEl("table", { cls: "obstracker-table" });
  const head = table.createEl("thead").createEl("tr");
  head.createEl("th", { text: t("time") });
  head.createEl("th", { text: t("note") });
  head.createEl("th", { text: t("duration") });
  head.createEl("th", { text: t("readWrite") });

  const tbody = table.createEl("tbody");
  const renderRows = (): void => {
    tbody.empty();
    const list = expanded ? report.timeline.slice(0, 100) : report.timeline.slice(0, 10);
    for (const item of list) {
      const tr = tbody.createEl("tr");
      tr.createEl("td", { text: new Date(item.ts).toLocaleString() });
      tr.createEl("td", { text: item.noteTitle });
      tr.createEl("td", { text: fmtDuration(item.activeSeconds) });
      tr.createEl("td", { text: `${fmtDuration(item.readSeconds)} / ${fmtDuration(item.writeSeconds)}` });
    }
  };
  renderRows();

  const toggle = box.createEl("button", { cls: "obstracker-back", text: t("expandAll") });
  toggle.style.marginTop = "8px";
  toggle.onclick = (): void => {
    expanded = !expanded;
    toggle.textContent = expanded ? t("collapse") : t("expandAll");
    renderRows();
  };
}

function lastText(ts: number): string {
  if (!ts) return t("never");
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days <= 0) return t("today");
  if (days === 1) return t("yesterday");
  if (days < 30) return t("daysAgo", { n: days });
  return t("monthsAgo", { n: Math.floor(days / 30) });
}
