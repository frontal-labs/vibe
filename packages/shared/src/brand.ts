export type Brand<Base, BrandName extends string> = Base & {
  readonly __brand: BrandName
}
