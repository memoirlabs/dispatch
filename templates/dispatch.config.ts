import type { DispatchConfig } from "@memoir/dispatch";

const config: DispatchConfig = {
  name: "my-project",
  ports: [3000, 3001, 5173, 8080, 8787],
  appFilter: "@my-scope/web-app",
  commandDir: ".dispatch/commands",
  deployScript: "deploy",
  scriptAliases: {
    port: ["portclean", "checkport"],
    update: ["update-all", "deps:refresh"],
    verify: ["preflight"],
  },
  commands: {
    // Override any dispatch command with a shell string or argv array.
    // dev: ["pnpm", "exec", "turbo", "run", "dev", "--filter=@my-scope/web-app"],
    // deploy: "pnpm run ci && pnpm dlx vercel deploy --prod",
  },
};

export default config;
