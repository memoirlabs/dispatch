import type { DispatchConfig } from "@memoir/dispatch";

const config: DispatchConfig = {
  ports: [3000, 3001, 5173, 8080, 8787],
  commandDir: ".dispatch/commands",
  commands: {
    // sync: ["bun", "scripts/sync.ts"],
  },
};

export default config;
