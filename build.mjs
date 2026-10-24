import { build } from "esbuild";

const files = ["landing", "login", "cabinet", "admin"];

for (const name of files) {
  await build({
    entryPoints: ["src/client/" + name + ".ts"],
    outfile: "public/assets/" + name + ".js",
    bundle: true,
    minify: true,
    format: "iife",
    target: "es2020",
  });
}

console.log("Готово");
