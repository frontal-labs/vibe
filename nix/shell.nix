# Legacy shell.nix for compatibility with tools that don't support flakes
# This is a simplified version that matches our flake devShell

with import <nixpkgs> {};

mkShell {
  name = "vibe-legacy-shell";
  buildInputs = [
    # Try to get Rust 1.95.0 from rust-overlay, fallback to nixpkgs
    (if pkgs ? rustc_1_95_0 then pkgs.rustc_1_95_0 else pkgs.rustc)
    pkgs.bun
    pkgs.nodejs_22
    pkgs.git
    pkgs.biome
    pkgs.pre-commit
    pkgs.jq
    pkgs.curl
    pkgs.coreutils
    pkgs.findutils
  ];

  shellHook = ''
    export VIBE_ROOT="$PWD"
    export CARGO_HOME="$PWD/.cargo"
    
    if [ ! -d "node_modules" ]; then
      echo "→ Installing bun dependencies..."
      bun install --frozen-lockfile
    fi
    
    if [ ! -f ".git/hooks/pre-commit" ]; then
      echo "→ Run 'pre-commit install --hook-type pre-commit --hook-type commit-msg' to install git hooks"
    fi
    
    echo "✓ Vibe legacy dev environment ready"
    echo "  rustc: $(rustc --version)"
    echo "  bun:   $(bun --version)"
    echo "  node:  $(node --version)"
  '';
}
