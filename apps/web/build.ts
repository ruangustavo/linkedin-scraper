import { rm } from "node:fs/promises";
import tailwind from "bun-plugin-tailwind";

await rm("./dist", { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: ["./src/server.ts"],
  root: ".",
  outdir: "./dist",
  publicPath: "/",
  naming: "[name].[ext]",
  target: "bun",
  plugins: [tailwind],
  minify: true,
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});

if (!result.success) {
  throw new AggregateError(result.logs, "Web build failed");
}
