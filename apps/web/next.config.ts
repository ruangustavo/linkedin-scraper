import type { NextConfig } from "next";

const config: NextConfig = {
  // Resolve metadata and missing jobs before streaming locks in the HTTP status.
  htmlLimitedBots: /.*/,
};

export default config;
