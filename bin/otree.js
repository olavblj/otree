#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { exec, spawn } from "node:child_process";
import { promisify } from "node:util";
import inquirer from "inquirer";
import chalk from "chalk";

const execAsync = promisify(exec);

const CONFIG_FILE = ".worktree-config.json";

function parseWorktrees(output) {
  const lines = output.trim().split("\n");
  const worktrees = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("worktree ")) {
      const path = line.substring(9); // Remove "worktree " prefix
      const headLine = lines[i + 1];
      const branchLine = lines[i + 2];

      let commit = "";
      if (headLine && headLine.startsWith("HEAD ")) {
        commit = headLine.substring(5, 12); // Get first 7 chars of commit hash
      }

      let branch = "detached";
      if (branchLine && branchLine.startsWith("branch ")) {
        branch = branchLine.substring(7).replace("refs/heads/", "");
      }

      worktrees.push({
        path,
        branch,
        commit,
      });
    }
  }

  return worktrees;
}

function loadConfig(cwd) {
  const configPath = path.join(cwd, CONFIG_FILE);
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch (error) {
      console.log(chalk.yellow("Warning: Could not parse config file"));
      return {};
    }
  }
  return {};
}

function saveConfig(cwd, config) {
  const configPath = path.join(cwd, CONFIG_FILE);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function extractUrls(text) {
  const urlPattern =
    /https?:\/\/localhost:\d+|http:\/\/127\.0\.0\.1:\d+|localhost:\d+/gi;
  const matches = text.match(urlPattern) || [];
  return [...new Set(matches)];
}

function isErrorLine(text) {
  const errorKeywords = [
    "error",
    "failed",
    "failure",
    "exception",
    "fatal",
    "cannot",
    "unable to",
    "not found",
    "enoent",
    "eacces",
    "warn",
    "warning",
  ];
  const lowerText = text.toLowerCase();
  return errorKeywords.some((keyword) => lowerText.includes(keyword));
}

function shouldShowLine(line) {
  // Show if it contains a URL
  if (extractUrls(line).length > 0) return true;

  // Show if it's an error/warning
  if (isErrorLine(line)) return true;

  // Show important ready/listening messages
  const importantKeywords = [
    "ready",
    "listening",
    "started",
    "running on",
    "available on",
    "local:",
    "server running",
  ];
  const lowerLine = line.toLowerCase();
  if (importantKeywords.some((keyword) => lowerLine.includes(keyword))) {
    return true;
  }

  return false;
}

function runCommandInWorktree(worktree, command, onOutput) {
  return new Promise((resolve, reject) => {
    const [cmd, ...args] = command.split(" ");
    const child = spawn(cmd, args, {
      cwd: worktree.path,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (data) => {
      onOutput(data.toString());
    });

    child.stderr.on("data", (data) => {
      onOutput(data.toString());
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command exited with code ${code}`));
      }
    });

    child.on("error", (error) => {
      reject(error);
    });
  });
}

// Get a color for a worktree based on its index
function getWorktreeColor(index) {
  const colors = [
    chalk.cyan,
    chalk.yellow,
    chalk.green,
    chalk.magenta,
    chalk.blue,
    chalk.red,
    chalk.gray,
    chalk.greenBright,
    chalk.yellowBright,
    chalk.blueBright,
    chalk.magentaBright,
    chalk.cyanBright,
  ];
  return colors[index % colors.length];
}

async function listWorktrees() {
  try {
    const { stdout } = await execAsync("git worktree list --porcelain");
    const worktrees = parseWorktrees(stdout);

    if (worktrees.length === 0) {
      console.log(chalk.yellow("No worktrees found."));
      return;
    }

    console.log(chalk.bold("\n📁 Git Worktrees:\n"));
    worktrees.forEach((wt, index) => {
      console.log(chalk.blue(`${index + 1}. ${wt.branch}`));
      console.log(chalk.gray(`   Path: ${wt.path}`));
      console.log(chalk.gray(`   Commit: ${wt.commit}\n`));
    });
  } catch (error) {
    console.error(chalk.red("Error listing worktrees:"), error.message);
    process.exit(1);
  }
}

async function removeWorktrees(options) {
  try {
    // Get worktrees
    const { stdout } = await execAsync("git worktree list --porcelain");
    const worktrees = parseWorktrees(stdout);

    if (worktrees.length === 0) {
      console.log(chalk.yellow("No worktrees found."));
      return;
    }

    // Filter out main worktree (we shouldn't remove the main one)
    const removableWorktrees = worktrees.filter((wt, index) => index !== 0);

    if (removableWorktrees.length === 0) {
      console.log(chalk.yellow("Only the main worktree exists. Nothing to remove."));
      return;
    }

    let worktreesToRemove = [];

    if (options.all) {
      // Confirm removing all
      const { confirmAll } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirmAll",
          message: chalk.yellow(
            `Are you sure you want to remove ALL ${removableWorktrees.length} worktree(s)? This cannot be undone!`
          ),
          default: false,
        },
      ]);

      if (!confirmAll) {
        console.log(chalk.gray("Cancelled."));
        return;
      }

      worktreesToRemove = removableWorktrees;
    } else {
      // Sort worktrees alphabetically by branch name
      const sortedWorktrees = [...removableWorktrees].sort((a, b) => 
        a.branch.localeCompare(b.branch)
      );
      
      // Interactive selection
      const { selected } = await inquirer.prompt([
        {
          type: "checkbox",
          name: "selected",
          message: "Select worktrees to remove:",
          choices: sortedWorktrees.map((wt) => ({
            name: `${wt.branch} (${wt.path})`,
            value: wt,
            checked: false,
          })),
        },
      ]);

      if (selected.length === 0) {
        console.log(chalk.yellow("No worktrees selected."));
        return;
      }

      worktreesToRemove = selected;

      // Final confirmation
      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: chalk.yellow(
            `Are you sure you want to remove ${worktreesToRemove.length} worktree(s)? This cannot be undone!`
          ),
          default: false,
        },
      ]);

      if (!confirm) {
        console.log(chalk.gray("Cancelled."));
        return;
      }
    }

    // Remove selected worktrees
    console.log(
      chalk.bold(
        `\n🗑️  Removing ${worktreesToRemove.length} worktree(s)...\n`
      )
    );

    for (const wt of worktreesToRemove) {
      try {
        await execAsync(`git worktree remove "${wt.path}"`);
        console.log(chalk.green(`✓ Removed: ${wt.branch} (${wt.path})`));
      } catch (error) {
        // If normal remove fails, try force remove
        try {
          await execAsync(`git worktree remove --force "${wt.path}"`);
          console.log(
            chalk.yellow(`⚠ Force removed: ${wt.branch} (${wt.path})`)
          );
        } catch (forceError) {
          console.log(
            chalk.red(`✗ Failed to remove: ${wt.branch} - ${error.message}`)
          );
        }
      }
    }

    console.log(chalk.bold.green("\n✨ Done!\n"));
  } catch (error) {
    console.error(chalk.red("Error removing worktrees:"), error.message);
    process.exit(1);
  }
}

async function runCommand(options) {
  try {
    const cwd = process.cwd();
    const config = loadConfig(cwd);
    const verbose = options.verbose || false;
    let route = options.route || null;

    // Get worktrees
    const { stdout } = await execAsync("git worktree list --porcelain");
    const worktrees = parseWorktrees(stdout);

    if (worktrees.length === 0) {
      console.log(chalk.yellow("No worktrees found."));
      return;
    }

    // Select worktrees
    let selectedWorktrees = [];

    if (options.all) {
      selectedWorktrees = worktrees;
    } else {
      // Sort worktrees alphabetically by branch name
      const sortedWorktrees = [...worktrees].sort((a, b) => 
        a.branch.localeCompare(b.branch)
      );
      
      const { selected } = await inquirer.prompt([
        {
          type: "checkbox",
          name: "selected",
          message: "Select worktrees to run command in:",
          choices: sortedWorktrees.map((wt) => ({
            name: `${wt.branch} (${wt.path})`,
            value: wt,
            checked: false,
          })),
        },
      ]);
      selectedWorktrees = selected;
    }

    if (selectedWorktrees.length === 0) {
      console.log(chalk.yellow("No worktrees selected."));
      return;
    }

    // Get command
    let command = options.command;

    // If -dc flag is used, use default command
    if (options.useDefaultCommand && config.defaultCommand) {
      command = config.defaultCommand;
      console.log(chalk.gray(`Using default command: ${command}`));
    }

    if (!command) {
      const choices = config.savedCommands || [];
      if (config.defaultCommand) {
        choices.unshift(`${config.defaultCommand} (default)`);
      }
      choices.push("Enter custom command...");

      const { commandChoice } = await inquirer.prompt([
        {
          type: "list",
          name: "commandChoice",
          message: "Select or enter command to run:",
          choices,
        },
      ]);

      if (commandChoice === "Enter custom command...") {
        const { customCommand } = await inquirer.prompt([
          {
            type: "input",
            name: "customCommand",
            message: "Enter command to run:",
            validate: (input) =>
              input.trim() !== "" || "Command cannot be empty",
          },
        ]);
        command = customCommand;

        // Ask if user wants to save this command
        const { saveCommand } = await inquirer.prompt([
          {
            type: "confirm",
            name: "saveCommand",
            message: "Save this command for future use?",
            default: false,
          },
        ]);

        if (saveCommand) {
          const { setAsDefault } = await inquirer.prompt([
            {
              type: "confirm",
              name: "setAsDefault",
              message: "Set as default command?",
              default: false,
            },
          ]);

          if (setAsDefault) {
            config.defaultCommand = command;
          }

          if (!config.savedCommands) {
            config.savedCommands = [];
          }
          if (!config.savedCommands.includes(command)) {
            config.savedCommands.push(command);
          }

          saveConfig(cwd, config);
          console.log(chalk.green("✓ Command saved"));
        }
      } else {
        command = commandChoice.replace(" (default)", "");
      }
    }

    // Get route if not specified via command line
    if (!route) {
      const routeChoices = config.savedRoutes || [];
      if (config.defaultRoute) {
        routeChoices.unshift(`${config.defaultRoute} (default)`);
      }
      routeChoices.push("No route");
      routeChoices.push("Enter custom route...");

      const { routeChoice } = await inquirer.prompt([
        {
          type: "list",
          name: "routeChoice",
          message: "Select a route to append to URLs (optional):",
          choices: routeChoices,
        },
      ]);

      if (routeChoice === "Enter custom route...") {
        const { customRoute } = await inquirer.prompt([
          {
            type: "input",
            name: "customRoute",
            message: "Enter route (e.g., /pitchdeck/1):",
            validate: (input) => {
              if (input.trim() === "") return "Route cannot be empty";
              return true;
            },
          },
        ]);
        route = customRoute;

        // Ask if user wants to save this route
        const { saveRoute } = await inquirer.prompt([
          {
            type: "confirm",
            name: "saveRoute",
            message: "Save this route for future use?",
            default: false,
          },
        ]);

        if (saveRoute) {
          const { setAsDefaultRoute } = await inquirer.prompt([
            {
              type: "confirm",
              name: "setAsDefaultRoute",
              message: "Set as default route?",
              default: false,
            },
          ]);

          if (setAsDefaultRoute) {
            config.defaultRoute = route;
          }

          if (!config.savedRoutes) {
            config.savedRoutes = [];
          }
          if (!config.savedRoutes.includes(route)) {
            config.savedRoutes.push(route);
          }

          saveConfig(cwd, config);
          console.log(chalk.green("✓ Route saved"));
        }
      } else if (routeChoice !== "No route") {
        route = routeChoice.replace(" (default)", "");
      }
    }

    // Run commands in parallel
    console.log(
      chalk.bold(
        `\n🚀 Running "${command}" in ${selectedWorktrees.length} worktree(s)...\n`
      )
    );

    const processInfos = selectedWorktrees.map((wt) => ({
      worktree: wt,
      urls: [],
      output: [],
    }));

    const runPromises = selectedWorktrees.map((wt, index) => {
      const colorFn = getWorktreeColor(index);
      const prefix = colorFn(`[${wt.branch}]`);

      return runCommandInWorktree(wt, command, (chunk) => {
        processInfos[index].output.push(chunk);
        const urls = extractUrls(chunk);
        processInfos[index].urls.push(...urls);

        // Print output with worktree context - only important lines unless verbose
        chunk.split("\n").forEach((line) => {
          const trimmedLine = line.trim();
          if (!trimmedLine) return;

          // In verbose mode, show everything
          if (verbose) {
            console.log(`${prefix} ${line}`);
            return;
          }

          // Otherwise, only show important lines
          if (shouldShowLine(trimmedLine)) {
            // Color code errors/warnings in red
            if (isErrorLine(trimmedLine)) {
              console.log(`${prefix} ${chalk.red(line)}`);
            } else if (extractUrls(trimmedLine).length > 0) {
              // Highlight URLs in green
              console.log(`${prefix} ${chalk.green(line)}`);

              // If a route is specified, also show the URL with the route
              if (route) {
                const lineUrls = extractUrls(trimmedLine);
                lineUrls.forEach((url) => {
                  // Ensure route starts with /
                  const normalizedRoute = route.startsWith("/")
                    ? route
                    : `/${route}`;
                  const routeUrl = `${url}${normalizedRoute}`;
                  console.log(
                    `${prefix} ${chalk.gray("┃ Route  ")} ${chalk.green(
                      routeUrl
                    )}`
                  );
                });
              }
            } else {
              console.log(`${prefix} ${line}`);
            }
          }
        });
      });
    });

    // Wait for all to complete or fail
    const results = await Promise.allSettled(runPromises);

    // Print summary
    console.log(chalk.bold("\n\n📊 Summary:\n"));

    processInfos.forEach((info, index) => {
      const result = results[index];
      const status =
        result.status === "fulfilled" ? chalk.green("✓") : chalk.red("✗");
      const colorFn = getWorktreeColor(index);

      console.log(
        `${status} ${colorFn(info.worktree.branch)} (${info.worktree.path})`
      );

      if (info.urls.length > 0) {
        const uniqueUrls = [...new Set(info.urls)];
        uniqueUrls.forEach((url) => {
          console.log(`  ${chalk.gray("→")} ${chalk.underline(url)}`);
          if (route) {
            const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
            console.log(
              `  ${chalk.gray("  Route:")} ${chalk.underline(
                url + normalizedRoute
              )}`
            );
          }
        });
      }

      if (result.status === "rejected") {
        console.log(`  ${chalk.red("Error:")} ${result.reason.message}`);
      }

      console.log("");
    });

    // Extract and display all URLs
    const allUrls = processInfos.flatMap((info) => info.urls);
    const uniqueUrls = [...new Set(allUrls)];

    if (uniqueUrls.length > 0) {
      console.log(chalk.bold.green("🌐 All running services:\n"));
      uniqueUrls.forEach((url) => {
        console.log(`  ${chalk.cyan("•")} ${chalk.underline(url)}`);
        if (route) {
          const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
          console.log(
            `    ${chalk.gray("Route:")} ${chalk.underline(
              url + normalizedRoute
            )}`
          );
        }
      });
      console.log("");
    }
  } catch (error) {
    console.error(chalk.red("Error running command:"), error.message);
    process.exit(1);
  }
}

async function copyFiles(options) {
  try {
    const cwd = process.cwd();
    const config = loadConfig(cwd);

    // Get worktrees
    const { stdout } = await execAsync("git worktree list --porcelain");
    const worktrees = parseWorktrees(stdout);

    if (worktrees.length === 0) {
      console.log(chalk.yellow("No worktrees found."));
      return;
    }

    // Select worktrees
    let selectedWorktrees = [];

    if (options.all) {
      selectedWorktrees = worktrees;
    } else {
      // Sort worktrees alphabetically by branch name
      const sortedWorktrees = [...worktrees].sort((a, b) => 
        a.branch.localeCompare(b.branch)
      );
      
      const { selected } = await inquirer.prompt([
        {
          type: "checkbox",
          name: "selected",
          message: "Select worktrees to copy file to:",
          choices: sortedWorktrees.map((wt) => ({
            name: `${wt.branch} (${wt.path})`,
            value: wt,
            checked: wt.path !== cwd,
          })),
        },
      ]);
      selectedWorktrees = selected;
    }

    if (selectedWorktrees.length === 0) {
      console.log(chalk.yellow("No worktrees selected."));
      return;
    }

    // Get file to copy
    let fileToCopy = options.file;

    if (!fileToCopy) {
      const choices = config.filesToCopy || [".env"];
      choices.push("Enter custom file path...");

      const { fileChoice } = await inquirer.prompt([
        {
          type: "list",
          name: "fileChoice",
          message: "Select file to copy:",
          choices,
        },
      ]);

      if (fileChoice === "Enter custom file path...") {
        const { customFile } = await inquirer.prompt([
          {
            type: "input",
            name: "customFile",
            message: "Enter file path to copy:",
            validate: (input) => {
              if (input.trim() === "") return "File path cannot be empty";
              if (!fs.existsSync(path.join(cwd, input))) {
                return `File ${input} not found`;
              }
              return true;
            },
          },
        ]);
        fileToCopy = customFile;

        // Ask if user wants to save this file
        const { saveFile } = await inquirer.prompt([
          {
            type: "confirm",
            name: "saveFile",
            message: "Remember this file for future copying?",
            default: false,
          },
        ]);

        if (saveFile) {
          if (!config.filesToCopy) {
            config.filesToCopy = [];
          }
          if (!config.filesToCopy.includes(fileToCopy)) {
            config.filesToCopy.push(fileToCopy);
          }
          saveConfig(cwd, config);
          console.log(chalk.green("✓ File saved to config"));
        }
      } else {
        fileToCopy = fileChoice;
      }
    }

    const sourceFile = path.join(cwd, fileToCopy);
    if (!fs.existsSync(sourceFile)) {
      console.error(chalk.red(`File ${fileToCopy} not found`));
      return;
    }

    // Copy file to selected worktrees
    console.log(
      chalk.bold(
        `\n📋 Copying ${fileToCopy} to ${selectedWorktrees.length} worktree(s)...\n`
      )
    );

    selectedWorktrees.forEach((wt) => {
      const destFile = path.join(wt.path, fileToCopy);
      const destDir = path.dirname(destFile);

      // Create directory if it doesn't exist
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      try {
        fs.copyFileSync(sourceFile, destFile);
        console.log(chalk.green(`✓ ${wt.branch}: ${fileToCopy} copied`));
      } catch (error) {
        console.log(
          chalk.red(`✗ ${wt.branch}: Failed to copy - ${error.message}`)
        );
      }
    });

    console.log(chalk.bold.green("\n✨ Done!\n"));
  } catch (error) {
    console.error(chalk.red("Error copying files:"), error.message);
    process.exit(1);
  }
}

async function manageConfig() {
  try {
    const cwd = process.cwd();
    const config = loadConfig(cwd);

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "What would you like to do?",
        choices: [
          "View current configuration",
          "Set default command",
          "Add saved command",
          "Set default route",
          "Add saved route",
          "Add file to copy list",
          "Clear configuration",
        ],
      },
    ]);

    switch (action) {
      case "View current configuration":
        console.log(chalk.bold("\n📝 Current Configuration:\n"));
        console.log(JSON.stringify(config, null, 2));
        console.log("");
        break;

      case "Set default command": {
        const { defaultCommand } = await inquirer.prompt([
          {
            type: "input",
            name: "defaultCommand",
            message: "Enter default command:",
            default: config.defaultCommand || "",
          },
        ]);
        config.defaultCommand = defaultCommand;
        saveConfig(cwd, config);
        console.log(chalk.green("✓ Default command updated"));
        break;
      }

      case "Add saved command": {
        const { newCommand } = await inquirer.prompt([
          {
            type: "input",
            name: "newCommand",
            message: "Enter command to save:",
          },
        ]);
        if (!config.savedCommands) {
          config.savedCommands = [];
        }
        if (!config.savedCommands.includes(newCommand)) {
          config.savedCommands.push(newCommand);
        }
        saveConfig(cwd, config);
        console.log(chalk.green("✓ Command added"));
        break;
      }

      case "Set default route": {
        const { defaultRoute } = await inquirer.prompt([
          {
            type: "input",
            name: "defaultRoute",
            message: "Enter default route (e.g., /pitchdeck/1):",
            default: config.defaultRoute || "",
          },
        ]);
        config.defaultRoute = defaultRoute;
        saveConfig(cwd, config);
        console.log(chalk.green("✓ Default route updated"));
        break;
      }

      case "Add saved route": {
        const { newRoute } = await inquirer.prompt([
          {
            type: "input",
            name: "newRoute",
            message: "Enter route to save (e.g., /pitchdeck/1):",
          },
        ]);
        if (!config.savedRoutes) {
          config.savedRoutes = [];
        }
        if (!config.savedRoutes.includes(newRoute)) {
          config.savedRoutes.push(newRoute);
        }
        saveConfig(cwd, config);
        console.log(chalk.green("✓ Route added"));
        break;
      }

      case "Add file to copy list": {
        const { newFile } = await inquirer.prompt([
          {
            type: "input",
            name: "newFile",
            message: "Enter file path:",
            default: ".env",
          },
        ]);
        if (!config.filesToCopy) {
          config.filesToCopy = [];
        }
        if (!config.filesToCopy.includes(newFile)) {
          config.filesToCopy.push(newFile);
        }
        saveConfig(cwd, config);
        console.log(chalk.green("✓ File added"));
        break;
      }

      case "Clear configuration": {
        const { confirm } = await inquirer.prompt([
          {
            type: "confirm",
            name: "confirm",
            message: "Are you sure you want to clear all configuration?",
            default: false,
          },
        ]);
        if (confirm) {
          saveConfig(cwd, {});
          console.log(chalk.green("✓ Configuration cleared"));
        }
        break;
      }
    }
  } catch (error) {
    console.error(chalk.red("Error managing config:"), error.message);
    process.exit(1);
  }
}

function showHelp() {
  console.log(chalk.bold("\n🌳 otree - Git Worktree Manager\n"));
  console.log("Usage: otree <command> [options]\n");
  console.log(chalk.bold("Commands:"));
  console.log("  list, ls              List all git worktrees");
  console.log("  run                   Run a command in selected worktrees");
  console.log("  copy                  Copy files to selected worktrees");
  console.log("  remove, rm            Remove selected worktrees");
  console.log("  config                Manage configuration");
  console.log("  help                  Show this help message\n");
  console.log(chalk.bold("Run Options:"));
  console.log("  -a, --all             Run in all worktrees");
  console.log("  -c, --command <cmd>   Specify command to run");
  console.log("  -dc                   Use default command from config");
  console.log(
    "  -r, --route <route>   Show URLs with this route appended (e.g., /pitchdeck/1)"
  );
  console.log(
    "  -v, --verbose         Show all output (default: only URLs and errors)\n"
  );
  console.log(chalk.bold("Copy Options:"));
  console.log("  -a, --all             Copy to all worktrees");
  console.log("  -f, --file <file>     Specify file to copy\n");
  console.log(chalk.bold("Remove Options:"));
  console.log("  -a, --all             Remove all worktrees (except main)\n");
  console.log(chalk.bold("Examples:"));
  console.log("  otree list");
  console.log("  otree run --all --command 'pnpm dev'");
  console.log("  otree run --all -dc              # Use default command");
  console.log("  otree run --all --command 'pnpm dev' --route /pitchdeck/1");
  console.log("  otree run --verbose --command 'pnpm build'");
  console.log("  otree copy --all --file .env");
  console.log("  otree remove                     # Interactive selection");
  console.log("  otree remove --all               # Remove all (except main)");
  console.log("  otree config\n");
}

// Main CLI
const args = process.argv.slice(2);
const command = args[0];

// Parse options
const options = {
  all: args.includes("-a") || args.includes("--all"),
  verbose: args.includes("-v") || args.includes("--verbose"),
  useDefaultCommand: args.includes("-dc"),
  command: null,
  file: null,
  route: null,
};

// Get --command value
const commandIndex =
  args.indexOf("-c") !== -1 ? args.indexOf("-c") : args.indexOf("--command");
if (commandIndex !== -1 && args[commandIndex + 1]) {
  options.command = args[commandIndex + 1];
}

// Get --file value
const fileIndex =
  args.indexOf("-f") !== -1 ? args.indexOf("-f") : args.indexOf("--file");
if (fileIndex !== -1 && args[fileIndex + 1]) {
  options.file = args[fileIndex + 1];
}

// Get --route value
const routeIndex =
  args.indexOf("-r") !== -1 ? args.indexOf("-r") : args.indexOf("--route");
if (routeIndex !== -1 && args[routeIndex + 1]) {
  options.route = args[routeIndex + 1];
}

switch (command) {
  case "list":
  case "ls":
    await listWorktrees();
    break;

  case "run":
    await runCommand(options);
    break;

  case "copy":
    await copyFiles(options);
    break;

  case "remove":
  case "rm":
    await removeWorktrees(options);
    break;

  case "config":
    await manageConfig();
    break;

  case "help":
  case "--help":
  case "-h":
  case undefined:
    showHelp();
    break;

  default:
    console.log(chalk.red(`Unknown command: ${command}`));
    console.log(chalk.gray("Run 'otree help' for usage information"));
    process.exit(1);
}
