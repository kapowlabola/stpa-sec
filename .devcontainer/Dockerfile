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

# Default shell when the container opens
CMD ["/bin/bash"]