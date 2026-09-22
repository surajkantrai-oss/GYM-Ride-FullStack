import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: [
    "@gymride/api-client",
    "@gymride/types",
    "@gymride/validation",
    "@gymride/web-ui",
  ],
};
export default config;
