import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ARCHITECTURE.md: the domain layer must stay free of UI, i18n and storage so it can run on a server.
describe("layering", () => {
  const dir = __dirname;
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  it.each(files)("domain/%s only imports from the domain layer or the contract", (file) => {
    const imports = [...readFileSync(join(dir, file), "utf8").matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
    const foreign = imports.filter((i) => i.startsWith("../") || i === "react" || i.startsWith("react-"));
    expect(foreign).toEqual([]);
  });
});
