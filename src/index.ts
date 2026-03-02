import { selectLanguage, getLocale } from "./i18n.js";
import { welcome } from "./tui/welcome.js";
import { selectMode } from "./tui/mode-select.js";
import { setupProviders } from "./tui/provider-setup.js";
import { selectPreset } from "./tui/preset-select.js";
import { runConfigWizard, type WizardBaseConfig } from "./tui/config-wizard.js";
import { confirmApply } from "./tui/confirm-apply.js";
import { detectEnv, type EnvInfo } from "./utils/detect.js";
import type { OhPConfig } from "./types.js";
import { EXTENSIONS } from "./registry.js";

/**
 * 主入口函数。检测环境、选择语言、展示欢迎界面，根据用户选择的模式执行对应配置流程，最终确认并应用配置。
 */
export async function run() {
  const env = await detectEnv();
  await selectLanguage();
  welcome(env);

  const mode = await selectMode(env);
  let config: OhPConfig;

  if (mode === "quick") {
    config = await quickFlow(env);
  } else if (mode === "preset") {
    config = await presetFlow(env);
  } else {
    config = await customFlow(env);
  }

  config.locale = getLocale();
  await confirmApply(config, env);
}

/**
 * 快速配置流程。仅需设置提供商和主题，其余选项使用推荐默认值。
 * @param env - 当前检测到的环境信息
 * @returns 生成的配置对象
 */
async function quickFlow(env: EnvInfo): Promise<OhPConfig> {
  const providerSetup = await setupProviders(env);
  return {
    ...providerSetup,
    theme: "dark",
    keybindings: "default",
    extensions: ["safe-guard", "git-guard", "auto-session-name", "custom-footer", "compact-header", "auto-update"],
    prompts: ["review", "fix", "explain", "commit", "test"],
    agents: "general-developer",
    thinking: "medium",
  };
}

/**
 * 预设配置流程。用户选择一个预设方案，再配置提供商，合并生成最终配置。
 * @param env - 当前检测到的环境信息
 * @returns 生成的配置对象
 */
async function presetFlow(env: EnvInfo): Promise<OhPConfig> {
  const preset = await selectPreset();
  return runConfigWizard(env, preset);
}

/**
 * 自定义配置流程。用户逐项选择主题、快捷键、扩展、代理等，并可配置高级选项（如自动压缩阈值）。
 * @param env - 当前检测到的环境信息
 * @returns 生成的配置对象
 */
async function customFlow(env: EnvInfo): Promise<OhPConfig> {
  const defaultExtensions = EXTENSIONS.filter(e => e.default).map(e => e.name);
  const initial: WizardBaseConfig = {
    theme: "dark",
    keybindings: "default",
    extensions: defaultExtensions,
    prompts: ["review", "fix", "explain", "commit", "test", "refactor", "optimize", "security", "document", "pr"],
    agents: "general-developer",
    thinking: "medium",
  };
  return runConfigWizard(env, initial);
}
