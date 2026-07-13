import { expectType } from "tsd"
import type { AppGraph, BuildManifest } from "../src/index"
import { bundleApp, discoverApp } from "../src/index"

expectType<Promise<AppGraph>>(discoverApp("/app"))
expectType<Promise<BuildManifest>>(bundleApp("/app"))
