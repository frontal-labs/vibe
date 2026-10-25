import { expectType } from "tsd"

import {
  createSkillRegistry,
  loadMarkdownSkill,
  type MarkdownSkill,
  parseMarkdownSkill,
  type Skill,
  type SkillRegistry,
} from "../src/index"

expectType<SkillRegistry>(createSkillRegistry([]))
expectType<MarkdownSkill>(parseMarkdownSkill("---\nname: greet\n---\nSay hello."))
expectType<Skill>(loadMarkdownSkill("---\nname: greet\n---\nSay hello."))
