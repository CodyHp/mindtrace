import { App, PluginSettingTab, Setting } from "obsidian";
import { t } from "./i18n";
import type MindTracePlugin from "./main";

export class MindTraceSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: MindTracePlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setHeading().setName(t("settingsTitle"));

    new Setting(containerEl)
      .setName(t("dataDir"))
      .setDesc(t("dataDirDesc"))
      .addText((text) =>
        text
          .setPlaceholder(".mindtrace")
          .setValue(this.plugin.settings.dataDir)
          .onChange(async (value) => {
            this.plugin.settings.dataDir = value.trim() || ".mindtrace";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("dashboardPath"))
      .setDesc(t("dashboardPathDesc"))
      .addText((text) =>
        text
          .setPlaceholder("MindTrace.md")
          .setValue(this.plugin.settings.dashboardPath)
          .onChange(async (value) => {
            this.plugin.settings.dashboardPath = value.trim() || "MindTrace.md";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("colorTheme"))
      .setDesc(t("colorThemeDesc"))
      .addDropdown((dd) => {
        dd.addOption("theme", t("themeAuto"));
        dd.addOption("#4a90d9", t("colorBlue"));
        dd.addOption("#7c5cff", t("colorPurple"));
        dd.addOption("#50a078", t("colorGreen"));
        dd.addOption("#e08a4e", t("colorOrange"));
        dd.addOption("#d9738f", t("colorPink"));
        dd.addOption("#3aa6a0", t("colorTeal"));
        dd.setValue(this.plugin.settings.colorTheme);
        dd.onChange(async (value) => {
          this.plugin.settings.colorTheme = value;
          await this.plugin.saveSettings();
          this.plugin.setColorTheme(value);
        });
      });

    new Setting(containerEl)
      .setName(t("language"))
      .setDesc(t("languageDesc"))
      .addDropdown((dd) => {
        dd.addOption("zh-CN", "简体中文");
        dd.addOption("en", "English");
        dd.setValue(this.plugin.settings.language);
        dd.onChange(async (value) => {
          this.plugin.settings.language = value;
          await this.plugin.saveSettings();
          this.plugin.applyLanguage(value);
          window.setTimeout(() => this.display(), 0); // 立即刷新设置面板语言
        });
      });

    this.addNumber(containerEl, t("heartbeatInterval"), t("heartbeatDesc"), this.plugin.settings.heartbeatIntervalSec, async (n) => {
      this.plugin.settings.heartbeatIntervalSec = n;
      await this.plugin.saveSettings();
      this.plugin.restartHeartbeat();
    });

    this.addNumber(containerEl, t("idleThreshold"), t("idleDesc"), this.plugin.settings.idleThresholdSec, async (n) => {
      this.plugin.settings.idleThresholdSec = n;
      await this.plugin.saveSettings();
    });

    this.addNumber(containerEl, t("minSession"), t("minSessionDesc"), this.plugin.settings.minSessionSec, async (n) => {
      this.plugin.settings.minSessionSec = n;
      await this.plugin.saveSettings();
    }, 0);

    this.addNumber(containerEl, t("sliceSec"), t("sliceDesc"), this.plugin.settings.sliceSec, async (n) => {
      this.plugin.settings.sliceSec = n;
      await this.plugin.saveSettings();
    });

    this.addNumber(containerEl, t("writeThreshold"), t("writeDesc"), this.plugin.settings.writeCharThreshold, async (n) => {
      this.plugin.settings.writeCharThreshold = n;
      await this.plugin.saveSettings();
    }, 0);

    new Setting(containerEl)
      .setName(t("excludePaths"))
      .setDesc(t("excludeDesc"))
      .addTextArea((ta) =>
        ta
          .setPlaceholder(".mindtrace")
          .setValue(this.plugin.settings.excludePaths.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.excludePaths = value
              .split("\n")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            await this.plugin.saveSettings();
          }),
      );

    containerEl.createEl("div", { cls: "mindtrace-about", text: t("aboutData") });
  }

  private addNumber(
    containerEl: HTMLElement,
    name: string,
    desc: string,
    value: number,
    onSave: (n: number) => Promise<void>,
    min = 1,
  ): void {
    new Setting(containerEl)
      .setName(name)
      .setDesc(desc)
      .addText((text) =>
        text.setValue(String(value)).onChange(async (input) => {
          const n = Number(input);
          if (Number.isFinite(n) && n >= min) {
            await onSave(Math.floor(n));
          }
        }),
      );
  }
}
