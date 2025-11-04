# otree - Git Worktree Manager

A powerful CLI tool for managing git worktrees with ease.

## Motivation: Testing Cursor Multi-Agent Results

**otree** was created to solve a specific workflow challenge with **Cursor's multi-agent mode**. When you run Cursor's multi-agent feature, it spawns multiple agent instances, each working on the same problem in parallel. These agents create different solutions, and you need to test them side-by-side to determine which one works best.

The problem? There was no clear way to test the different solutions side-by-side. **otree** streamlines this entire process, letting you:

- Run dev servers for all multi-agent worktrees simultaneously
- Access each solution via unique localhost URLs with a single click
- Quickly compare implementations side-by-side
- Identify which worktree produced the best result
- Apply the winning changes back in Cursor with confidence

### Cursor Multi-Agent Workflow

Here's how to use **otree** with Cursor's multi-agent mode:

1. **Run a Cursor multi-agent run** on your task/problem

2. **Run `otree run`** and select the relevant worktrees (the ones Cursor created for the multi-agent run)

3. **The terminal extracts and outputs the localhost URLs** - click each one at a time to test the different solutions in your browser

4. **See in your terminal which worktree corresponds to the port** you tested - when you find the best solution, note which worktree/branch it came from

5. **In Cursor, identify this worktree and click "Apply Changes"** to merge the winning solution into your main branch

This workflow transforms multi-agent testing from a slow, manual process into a fast, parallel comparison experience. You can have 3, 5, or even more solutions running simultaneously, each accessible with a single click.

## Features

- 📁 **List all worktrees** with detailed information
- 🚀 **Run commands** in multiple worktrees simultaneously
- 📋 **Copy files** (like `.env`) to multiple worktrees
- 🗑️ **Remove worktrees** safely with interactive selection
- 🌐 **Extract URLs** from command output (e.g., `localhost:3000`)
- 💾 **Save commands and routes** for quick reuse
- ⚙️ **Configuration management** for default commands, routes, and files

## Installation

The tool is already installed as part of the CLI tools. After building with `npm run build`, you can use it with:

```bash
otree [command]
# or use the alias
wt [command]
# or via ozsh
ozsh otree [command]
```

## Commands

### List Worktrees

```bash
otree list
# or
otree ls
# or
wt ls
```

Shows all git worktrees with their branches, paths, and commits.

### Run Commands

```bash
# Interactive mode - select worktrees and command
otree run

# Run in all worktrees with default command
otree run --all -dc

# Run in all worktrees
otree run --all

# Run specific command
otree run --command "pnpm dev"

# Run in all with specific command
otree run --all --command "pnpm dev"

# Show all output (verbose mode)
otree run --verbose --command "pnpm build"

# Run with a specific route to display alongside URLs
otree run --all --command "pnpm dev" --route /pitchdeck/1
```

**Interactive mode:**

- Worktrees are unchecked by default - select the ones you want to run
- Choose from saved commands or enter a new one
- Choose from saved routes or skip

**Quick shortcuts:**

- `-dc` flag: Use your default command (no need to type it)
- `-a` or `--all`: Run in all worktrees automatically

**Smart output:**

- Output is **intelligently filtered** to show only important information:
  - ✅ URLs (like `localhost:3000`) - highlighted in green
  - ⚠️ Errors and warnings - highlighted in red
  - ℹ️ Ready/listening messages
- **Each worktree has its own color** (cyan, yellow, green, magenta, etc.) making it easy to distinguish output
- Output from each worktree is prefixed with the colored branch name
- Verbose build logs are suppressed by default (use `--verbose` to see everything)
- A summary shows all running services with their URLs

**Example output:**

```
🚀 Running "pnpm dev" in 3 worktree(s)...

[main] ✓ Ready in 234ms                      # cyan
[main] ▲ Local: http://localhost:3000         # cyan with green URL
[feature-1] ✓ Ready in 189ms                  # yellow
[feature-1] ▲ Local: http://localhost:3001    # yellow with green URL
[feature-2] ⚠ Warning: Deprecated package found  # magenta with red warning
[feature-2] ✓ Ready in 256ms                  # magenta
[feature-2] ▲ Local: http://localhost:3002    # magenta with green URL
```

**With route option (`--route /pitchdeck/1`):**

```
🚀 Running "pnpm dev" in 3 worktree(s)...

[main] ✓ Ready in 234ms
[main] ▲ Local: http://localhost:3000
[main] ┃ Route  http://localhost:3000/pitchdeck/1
[feature-1] ✓ Ready in 189ms
[feature-1] ▲ Local: http://localhost:3001
[feature-1] ┃ Route  http://localhost:3001/pitchdeck/1
[feature-2] ✓ Ready in 256ms
[feature-2] ▲ Local: http://localhost:3002
[feature-2] ┃ Route  http://localhost:3002/pitchdeck/1

📊 Summary:

✓ main (/path/to/worktree)                     # cyan
  → http://localhost:3000
    Route: http://localhost:3000/pitchdeck/1

✓ feature-1 (/path/to/worktree-feature-1)      # yellow
  → http://localhost:3001
    Route: http://localhost:3001/pitchdeck/1

✓ feature-2 (/path/to/worktree-feature-2)      # magenta
  → http://localhost:3002
    Route: http://localhost:3002/pitchdeck/1

🌐 All running services:

  • http://localhost:3000
    Route: http://localhost:3000/pitchdeck/1
  • http://localhost:3001
    Route: http://localhost:3001/pitchdeck/1
  • http://localhost:3002
    Route: http://localhost:3002/pitchdeck/1
```

Note: Only important lines are shown (URLs, errors, ready messages). Verbose build logs are hidden. Use `--verbose` flag to see all output.

#### Route Option: Testing Specific Pages

The `--route` or `-r` flag is a game-changer when testing specific pages or features across multiple worktrees. Instead of manually navigating to the page you're testing in each browser tab, **otree** automatically constructs and displays the full URL for that specific route.

**Why is this useful?**

When you're working on a specific page (e.g., `/pitchdeck/1` or `/dashboard/settings`), you don't want to test the homepage - you want to test _that exact page_. The route option:

1. **Saves time**: No need to manually navigate to the page in each browser tab
2. **Reduces errors**: Ensures you're testing the exact same route in each worktree
3. **Perfect for Cursor multi-agent testing**: When comparing multiple AI-generated solutions, you want to see how each one handles the specific page/feature, not the homepage
4. **One-click testing**: Just click the route URL from the terminal summary and immediately see that specific page

**How it works:**

When you specify a route like `/pitchdeck/1`, otree:

1. Extracts the base URL from each dev server (e.g., `http://localhost:3000`)
2. Appends your route to create the full URL (e.g., `http://localhost:3000/pitchdeck/1`)
3. Displays both URLs in the terminal output and summary
4. Color-codes each worktree's output so you can track which port belongs to which branch

**Via command line:**

```bash
otree run --all --command "pnpm dev" --route /pitchdeck/1
```

**Via interactive prompt:**

When you run `otree run` without the `--route` flag, you'll be prompted to select a route:

- Choose from your saved routes
- Select your default route (if set)
- Choose "No route" to skip
- Enter a custom route and optionally save it for future use

**Saving routes:**

Just like commands, you can save frequently used routes:

- When entering a custom route, you'll be asked if you want to save it
- You can set a default route that will be suggested first
- Manage saved routes via `otree config`

**Example with Cursor multi-agent:**

```bash
# After Cursor creates worktrees for agents working on a pitchdeck feature:
otree run --all --command "pnpm dev" --route /pitchdeck/1

# Output shows:
# [agent-1] → http://localhost:3000/pitchdeck/1
# [agent-2] → http://localhost:3001/pitchdeck/1
# [agent-3] → http://localhost:3002/pitchdeck/1

# Click each URL, test the implementations, and identify the best one!
```

### Copy Files

```bash
# Interactive mode - select worktrees and file
otree copy

# Copy to all worktrees
otree copy --all

# Copy specific file
otree copy --file .env

# Copy to all with specific file
otree copy --all --file .env
```

Copies files from the current directory to selected worktrees, maintaining the same relative path.

### Remove Worktrees

```bash
# Interactive mode - select worktrees to remove
otree remove

# Remove all worktrees (except main)
otree remove --all

# Using alias
otree rm
```

**Safety features:**

- The main worktree (first one) is never removed
- Interactive mode: select which worktrees to remove
- Confirmation prompt before removal
- Automatically attempts force removal if needed (for dirty worktrees)
- Shows clear success/error messages for each removal

### Configuration

```bash
otree config
```

Manage your worktree configuration:

- **View current configuration**: See all saved commands, routes, and files
- **Set default command**: Set a command that runs by default
- **Add saved command**: Add commands to quick-select list
- **Set default route**: Set a route that's selected by default
- **Add saved route**: Add routes to quick-select list (e.g., `/pitchdeck/1`)
- **Add file to copy list**: Add files to quick-select list for copying
- **Clear configuration**: Reset all configuration

## Configuration File

The tool stores configuration in `.worktree-config.json` in your project root:

```json
{
  "defaultCommand": "pnpm dev",
  "savedCommands": ["pnpm dev", "pnpm build", "pnpm test"],
  "defaultRoute": "/pitchdeck/1",
  "savedRoutes": ["/pitchdeck/1", "/dashboard", "/settings"],
  "filesToCopy": [".env", ".env.local", "config.json"]
}
```

## Use Cases

### Developing Multiple Features

Run the same dev server across multiple feature branches:

```bash
# Using explicit command
otree run --all --command "pnpm dev"

# Or use default command (faster!)
otree run --all -dc
```

### Syncing Environment Files

Copy your `.env` to all worktrees when you update it:

```bash
otree copy --all --file .env
```

### Testing Across Branches

Run tests in multiple branches simultaneously:

```bash
otree run --command "pnpm test"
```

### Comparing Performance

Run the same command across different branches and compare URLs:

```bash
otree run --all --command "pnpm preview"
```

### Cleaning Up Worktrees

Remove old worktrees you're done with:

```bash
# Interactive - select which ones to remove
otree remove

# Clean up everything (keeps main worktree)
otree remove --all
```

## Tips

1. **Save frequently used commands**: Use the config to save commands you run often
2. **Set a default command**: Set `pnpm dev` or similar as default, then use `-dc` flag for instant runs
3. **Use `-dc` for speed**: `otree run --all -dc` is the fastest way to run your common command
4. **Save frequently used routes**: Save routes like `/pitchdeck/1` for quick access
5. **Set a default route**: Set your most common route as the default
6. **Add `.env` to files**: Pre-configure common files for easy copying
7. **Use the alias `wt`**: Shorter and faster than typing `otree`
8. **Uncheck by default**: In interactive mode, deliberately select which worktrees to run

## URL Extraction

The tool automatically extracts and displays:

- `http://localhost:XXXX`
- `https://localhost:XXXX`
- `http://127.0.0.1:XXXX`
- Plain `localhost:XXXX` patterns

This makes it easy to see all your running dev servers at a glance!
