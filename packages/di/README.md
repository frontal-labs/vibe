# vibe/di

Lightweight dependency-injection container.

## What it does

A minimal DI system: create scoped containers with `createContainer`, register
services behind typed `ServiceToken`s via `createToken`, and resolve them with
support for factories, scopes, and registration metadata.

## Install

```sh
bun add vibe/di
```

## Usage

```ts
import { createContainer, createToken } from "@vibe/di"

const loggerToken = createToken<Logger>("logger")
const container = createContainer()
container.register(loggerToken, () => createLogger())
const logger = container.resolve(loggerToken)
```
