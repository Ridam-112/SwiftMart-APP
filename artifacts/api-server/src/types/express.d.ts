// This file is a TypeScript module augmentation.
// Express 5 types (@types/express@5) type req.params values as `string | string[]`,
// but Express routing always populates named params as plain strings.
// Adding `export {}` makes this file a module so the `declare module` below
// is treated as an augmentation (merged with the original), not a replacement.
export {};

declare module "express-serve-static-core" {
  interface ParamsDictionary {
    [key: string]: string;
  }
}
