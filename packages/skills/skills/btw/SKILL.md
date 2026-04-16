---
name: btw
description: Helps you use the /btw (or /qq) side-conversation workflow effectively. Use when you want to think in parallel, ask side questions without interrupting ongoing work, or inject a side thread back into the main agent.
---

# BTW / QQ — Side Conversations

Use this skill when the user wants to work in parallel with the main agent instead of derailing the current turn.

Both `/btw` and `/qq` are identical — use whichever feels natural. `/qq` stands for "quick question".

## When to use BTW

Prefer the BTW workflow when the user wants to:

- ask a side question while the main agent keeps working
- brainstorm or compare options without interrupting the current run
- prepare a plan or summary before handing it back to the main agent
- keep exploratory discussion out of the main transcript/context

## Commands

Use these commands in your guidance to the user:

```text
/btw <question>
/btw --save <question>
/btw:new [question]
/btw:open
/btw:clear
/btw:inject [instructions]
/btw:summarize [instructions]
```

Every `/btw` command has a `/qq` equivalent:

```text
/qq <question>
/qq --save <question>
/qq:new [question]
/qq:open
/qq:clear
/qq:inject [instructions]
/qq:summarize [instructions]
```

## How to guide the user

### For a quick side question

Recommend:

```text
/btw <question>
```

or

```text
/qq <question>
```

Use this when the user wants an immediate aside and does not need a visible saved note.

### For a saved one-off note

Recommend:

```text
/btw --save <question>
```

Use this when the user wants the exchange to appear as a visible BTW note in the session transcript.

### To inspect the full side thread

Recommend:

```text
/btw:open
```

Use this when the compact BTW widget is clipped and the user wants a scrollable full-thread view.

### For a fresh side thread

Recommend:

```text
/btw:new
```

or

```text
/btw:new <question>
```

Use this when the previous BTW discussion is no longer relevant.

### To hand the full thread back to the main agent

Recommend:

```text
/btw:inject <instructions>
```

Use this when the exact discussion matters and the user wants the main agent to act on it.

### To hand back a condensed version

Recommend:

```text
/btw:summarize <instructions>
```

Use this when the thread is long and only the distilled outcome should go back into the main agent.

## Recommendation rules

- Prefer `/btw` over normal chat when the user explicitly wants a side conversation.
- Prefer `/btw:summarize` over `/btw:inject` for long exploratory threads.
- Prefer `/btw:inject` when precise wording, detailed tradeoffs, or a full plan matters.
- Suggest `/btw:new` before starting a totally unrelated side topic.
- Suggest `/btw:open` when the compact widget is clipped and the user needs the full thread.
- Suggest `/btw:clear` when the widget/thread should be dismissed.

## Response style

When helping the user use BTW:

- give the exact slash command to run
- explain briefly why that command fits
- keep the guidance short and operational

## Examples

### Example: brainstorm while coding continues

```text
/btw what are the risks of switching this to optimistic updates?
```

### Example: quick question shorthand

```text
/qq what does this error mean?
```

### Example: create a clean new thread

```text
/btw:new sketch a safer migration plan
```

### Example: send the result back

```text
/btw:summarize implement the recommended migration plan
```
