# Development container for Vibe. Pins match the repo: Bun from package.json
# "packageManager", Rust from rust-toolchain.toml. Node 22 comes from the
# devcontainer feature in .devcontainer/devcontainer.json.
# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

ARG BUN_VERSION=1.3.3
ARG RUST_TOOLCHAIN=1.95

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*

USER vscode
ENV BUN_INSTALL=/home/vscode/.bun
ENV PATH=/home/vscode/.bun/bin:/home/vscode/.cargo/bin:$PATH

RUN curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --profile minimal --default-toolchain "${RUST_TOOLCHAIN}" -c rustfmt -c clippy
