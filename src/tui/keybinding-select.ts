import * as p from "@clack/prompts";
import { t } from "../i18n.js";

/**
 * Prompts the user to select a keybinding scheme (default, Vim, or Emacs).
 *
 * Displays an interactive select prompt and exits the process if the user cancels.
 *
 * @returns The name of the selected keybinding scheme.
 */
export async function selectKeybindings(initialValue?: string): Promise<string> {
  const kb = await p.select({
    message: t("kb.select"),
    options: [
      { value: "default", label: t("kb.default"),  hint: t("kb.defaultHint") },
      { value: "vim",     label: t("kb.vim"),      hint: t("kb.vimHint") },
      { value: "emacs",   label: t("kb.emacs"),    hint: t("kb.emacsHint") },
    ],
    initialValue,
  });
  if (p.isCancel(kb)) { p.cancel(t("cancelled")); process.exit(0); }
  return kb;
}
