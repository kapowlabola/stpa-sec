FROM node:20-slim

# Install git and basic build tools (needed for npm packages with native deps, and for Claude Code's git operations)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /workspace
RUN chown node:node /workspace

# `node` is the non-root user baked into node:20-slim. --dangerously-skip-permissions
# is refused when Claude Code runs as root, so this must be set here (not just in
# devcontainer.json's remoteUser) — that field is only honored by VS Code / the
# devcontainer CLI. A plain `docker run` ignores it and falls back to root unless
# the image itself switches user, which is what this line does.
USER node

# Default shell when the container opens
CMD ["/bin/bash"]