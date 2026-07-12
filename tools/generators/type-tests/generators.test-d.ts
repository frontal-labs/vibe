import { expectType } from "tsd"

import { renderTemplate, scaffold } from "../src/index"

expectType<string>(renderTemplate("{{x}}", { x: 1 }))
expectType<string[]>(scaffold("/tmpl", "/out", { name: "x" }))
