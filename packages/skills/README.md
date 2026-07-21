# vibe/skills

Define, load, and register agent skills.

## What it does

`defineSkill` declares skills, `createSkillRegistry` manages them, and the
Markdown helpers (`markdownSkill`, `parseMarkdownSkill`, `loadMarkdownSkill`)
let skills be authored as Markdown files. Defines `Skill`, `SkillMeta`, and
`SkillKind` types.

## Install

```sh
bun add vibe/skills
```

## Usage

```ts
import { defineSkill, createSkillRegistry } from "vibe/skills"

const skill = defineSkill({ name: "summarize", description: "Summarize text" })
const registry = createSkillRegistry()
registry.register(skill)
```
