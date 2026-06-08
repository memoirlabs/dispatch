export type Category =
  | "core"
  | "quality"
  | "deploy"
  | "repo"
  | "ops"
  | "project"
  | "debug";

export type CommandName = string;

export type DispatchCommand = {
  name: CommandName;
  aliases?: string[];
  category: Category;
  summary: string;
  usage?: string;
  examples?: string[];
  hidden?: boolean;
  passthrough?: boolean;
  run: CommandResolver;
};

export type CommandResolver = (context: DispatchContext, args: string[]) => Promise<ResolvedCommand | void> | ResolvedCommand | void;

export type CommandResult = ResolvedCommand | string | string[] | void;

export type ProjectCommand =
  | string
  | string[]
  | {
    summary?: string;
    run?: (context: DispatchContext, args: string[]) => Promise<CommandResult> | CommandResult;
    command?: string | string[];
  }
  | ((context: DispatchContext, args: string[]) => Promise<CommandResult> | CommandResult);

export type ResolvedCommand = {
  cmd: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  stdin?: "ignore" | "inherit";
  stdout?: "inherit" | "pipe";
  stderr?: "inherit" | "pipe";
};

export type DispatchConfig = {
  name?: string;
  ports?: number[];
  appFilter?: string;
  deployScript?: string;
  syncMode?: "pull" | "hard";
  commandDir?: string;
  commands?: Record<string, string | string[]>;
  aliases?: Record<string, string>;
  scriptAliases?: Record<string, string[]>;
};

export type PackageManager = "bun" | "pnpm" | "npm" | "yarn";

export type PackageJson = {
  name?: string;
  private?: boolean;
  version?: string;
  packageManager?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  workspaces?: string[] | { packages?: string[] };
};

export type WorkspacePackage = {
  root: string;
  relativePath: string;
  packageJson: PackageJson;
  hasDependencies: boolean;
};

export type DispatchContext = {
  startCwd: string;
  repoRoot: string;
  packageJson: PackageJson;
  packageManager: PackageManager;
  config: DispatchConfig;
  verbose?: boolean;
  quiet?: boolean;
};
