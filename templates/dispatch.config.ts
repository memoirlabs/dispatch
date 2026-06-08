import type { DispatchConfig } from "@memoir/dispatch";

const config: DispatchConfig = {
  name: "my-project",
  ports: [3000, 3001, 5173, 8080, 8787],
  appFilter: "@my-scope/web-app",
  deployScript: "deploy",
  syncMode: "pull",
  aliases: {
    dp: "deploy",
  },
  scriptAliases: {
    port: ["portclean", "checkport"],
    update: ["update-all", "deps:refresh"],
    verify: ["preflight", "ship:verify"],
  },
  commands: {
    // Override any dispatch command with a shell string or argv array.
    // dev: ["bunx", "--bun", "turbo", "run", "dev", "--filter=@my-scope/web-app"],
    // deploy: "bun run ci && bunx --bun vercel deploy --prod",
  },
};

export default config;
