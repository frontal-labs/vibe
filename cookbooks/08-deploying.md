# Deploying to the edge

```ts
import { toCloudflareWorker, toLambdaHandler, generateDockerfile } from "@frontal-labs/vibe/deploy"

export default toCloudflareWorker(agent)          // Cloudflare Workers
export const handler = toLambdaHandler(agent)     // AWS Lambda (Function URL / APIGW v2)
```

`generateDockerfile()` emits a two-stage Bun image; `ANTHROPIC_API_KEY` is provided
at runtime, never baked in.
