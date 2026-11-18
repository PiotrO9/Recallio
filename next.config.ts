import type { NextConfig } from "next";

const config: NextConfig = {
  // Include the driver in the Workers bundle instead of tracing it as a native external.
  transpilePackages: ["pg"],
};

export default config;
