/** Options for generating a container image build. */
export interface DockerfileOptions {
  /** Base image. Defaults to the official Bun image. */
  readonly baseImage?: string
  /** Entry file the container runs (relative to the app root). */
  readonly entry?: string
  /** Port the server listens on. */
  readonly port?: number
  /** Extra `ENV KEY value` lines. Values are emitted verbatim — don't put secrets here. */
  readonly env?: Readonly<Record<string, string>>
}

/** A Lambda Function URL / API Gateway v2 style HTTP event (the subset we read). */
export interface LambdaHttpEvent {
  readonly rawPath?: string
  readonly rawQueryString?: string
  readonly headers?: Record<string, string | undefined>
  readonly body?: string
  readonly isBase64Encoded?: boolean
  readonly requestContext?: { readonly http?: { readonly method?: string } }
}

/** A Lambda proxy result (v2). */
export interface LambdaHttpResult {
  readonly statusCode: number
  readonly headers: Record<string, string>
  readonly body: string
}
