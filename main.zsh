# otree - Git Worktree Manager
# Manage git worktrees with ease

# Get the directory where this script is located
OTREE_DIR="${0:A:h}"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
  echo "otree requires Node.js to be installed"
  return 1
fi

# Add the bin directory to PATH
export PATH="$OTREE_DIR/bin:$PATH"

# Define otree function to run the CLI
function otree() {
  node "$OTREE_DIR/bin/otree.js" "$@"
}

# Initialize the CLI on first use
if [ ! -d "$OTREE_DIR/node_modules" ]; then
  echo "Setting up otree for first use..."
  (cd "$OTREE_DIR" && pnpm install)
fi

# Alias for convenience
alias wt='otree'
