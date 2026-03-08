---
default: patch
---

### Add `/colony` slash command

The ant colony can now be launched directly with `/colony <goal>` instead of
relying solely on the LLM-callable `ant_colony` tool. The command appears in
autocomplete alongside `/colony-status`, `/colony-stop`, and `/colony-resume`.

Usage: `/colony refactor the auth module to use JWT tokens`
