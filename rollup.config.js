import {createRequire} from "https://deno.land/std@0.110.0/node/module.ts";

export default [
  // UMD build
  {
    input: "src/index.ts",
    output: {
      name: "ucflows",
      file: pkg.browser,
      format: "umd",
      sourcemap: true
    },
    plugins: [
      resolve(),
      typescript({ tsconfig: "./tsconfig.build.json" }),
      terser()
    ],
  },
  // CommonJS (for Node) and ES module (for bundlers) build.
  {
    input: "src/index.ts",
    output: [
      { file: pkg.main, format: "cjs" },
      { file: pkg.module, format: "es" },
    ],
    plugins: [typescript({ tsconfig: "./tsconfig.build.json" })],
  },
  // Bundle d.ts files into one
  {
    input: "./dist/dts/index.d.ts",
    output: [{ file: "dist/ucflows.d.ts", format: "es" }],
    plugins: [dts()],
  }
];