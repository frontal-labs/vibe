# http-server

Expose an agent over HTTP with `@vibe/adapters`. Runs on Bun (`Bun.serve`) or Node
(`http.createServer`).

```sh
bun run --filter @example/http-server start
curl -sX POST localhost:3000 -d '{"prompt":"hi"}'
curl -sN -X POST 'localhost:3000?stream=1' -d '{"prompt":"hi"}'   # SSE
```
