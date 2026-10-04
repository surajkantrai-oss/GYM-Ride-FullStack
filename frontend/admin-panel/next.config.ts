import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  transpilePackages: [
    "@gymride/api-client",
    "@gymride/types",
    "@gymride/validation",
    "@gymride/web-ui",
  ],
};
export default config;
