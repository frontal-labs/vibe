# vibe/deploy

Generate deployment artifacts and platform handlers for Vibe apps.

## What it does

Produces Dockerfiles/`.dockerignore` (`generateDockerfile`,
`generateDockerignore`), builds a `DeployPlan`/`DeployManifest` (`deployPlan`,
`generateHandler`), and adapts handlers for Cloudflare Workers, AWS Lambda, and
Vercel (`toCloudflareWorker`, `toLambdaHandler`, `toVercelHandler`).

## Install

```sh
bun add vibe/deploy
```

## Usage

```ts
import { deployPlan, toVercelHandler, generateDockerfile } from "vibe/deploy"

const plan = deployPlan(agents, { target: "vercel" })
const handler = toVercelHandler(plan)
```
