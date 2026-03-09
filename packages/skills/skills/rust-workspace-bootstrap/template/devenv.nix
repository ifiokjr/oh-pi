{
  pkgs,
  lib,
  config,
  inputs,
  ...
}:

{
  packages =
    with pkgs;
    [
      cargo-binstall
      cargo-run-bin
      dprint
      mdbook
      nixfmt
      rustup
      shfmt
    ]
    ++ lib.optionals stdenv.isDarwin [
      coreutils
    ];

  enterShell = ''
    set -e
    rustup toolchain install nightly --component rustfmt --no-self-update 2>/dev/null || true
    rustup update stable --no-self-update 2>/dev/null || true
  '';

  # Disable dotenv hint since direnv interpolation is preferred.
  dotenv.disableHint = true;

  scripts = {
    "__PROJECT_NAME__" = {
      exec = ''
        set -e
        cargo run --quiet -p __CLI_CRATE__ -- $@
      '';
      description = "Run the __PROJECT_NAME__ CLI from source.";
      binary = "bash";
    };
    "install:all" = {
      exec = ''
        set -e
        install:cargo:bin
      '';
      description = "Install all local development binaries.";
      binary = "bash";
    };
    "install:cargo:bin" = {
      exec = ''
        set -e
        cargo bin --install
      '';
      description = "Install cargo binaries from [workspace.metadata.bin].";
      binary = "bash";
    };
    "update:deps" = {
      exec = ''
        set -e
        cargo update
        devenv update
      '';
      description = "Update Cargo and Nix dependencies.";
      binary = "bash";
    };
    "build:all" = {
      exec = ''
        set -e
        if [ -z "$CI" ]; then
          cargo build --workspace --all-features
        else
          cargo build --workspace --all-features --locked
        fi
      '';
      description = "Build all crates with all features activated.";
      binary = "bash";
    };
    "build:default" = {
      exec = ''
        set -e
        cargo build --workspace --locked
      '';
      description = "Build workspace crates with default features.";
      binary = "bash";
    };
    "test:all" = {
      exec = ''
        set -e
        test:cargo
        test:docs
      '';
      description = "Run all tests across workspace crates.";
      binary = "bash";
    };
    "test:cargo" = {
      exec = ''
        set -e
        cargo nextest run --workspace --all-features --locked
      '';
      description = "Run rust tests with cargo-nextest.";
      binary = "bash";
    };
    "test:docs" = {
      exec = ''
        set -e
        cargo test --workspace --doc --locked
      '';
      description = "Run Rust documentation tests.";
      binary = "bash";
    };
    "coverage:all" = {
      exec = ''
        set -e
        mkdir -p "$DEVENV_ROOT/target/coverage"
        cargo llvm-cov nextest \
          --workspace \
          --all-features \
          --locked \
          --lcov \
          --output-path "$DEVENV_ROOT/target/coverage/lcov.info"
      '';
      description = "Generate lcov coverage report for the whole workspace.";
      binary = "bash";
    };
    "fix:all" = {
      exec = ''
        set -e
        fix:clippy
        fix:format
      '';
      description = "Apply all autofixable lint/format changes.";
      binary = "bash";
    };
    "fix:format" = {
      exec = ''
        set -e
        dprint fmt --config "$DEVENV_ROOT/dprint.json"
      '';
      description = "Format files with dprint.";
      binary = "bash";
    };
    "fix:clippy" = {
      exec = ''
        set -e
        cargo clippy --workspace --all-features --all-targets --fix --allow-dirty --allow-staged
      '';
      description = "Apply clippy autofixes for all workspace crates.";
      binary = "bash";
    };
    "docs:build" = {
      exec = ''
        set -e
        mdbook build "$DEVENV_ROOT/docs"
      '';
      description = "Build mdBook documentation.";
      binary = "bash";
    };
    "verify:docs" = {
      exec = ''
        set -e
        [ -f "$DEVENV_ROOT/docs/book.toml" ]
        [ -f "$DEVENV_ROOT/docs/src/SUMMARY.md" ]
        mdbook build "$DEVENV_ROOT/docs" -d "$DEVENV_ROOT/target/mdbook"
      '';
      description = "Validate docs layout and build mdBook.";
      binary = "bash";
    };
    "deny:check" = {
      exec = ''
        set -e
        cargo deny check
      '';
      description = "Run cargo-deny checks.";
      binary = "bash";
    };
    "lint:all" = {
      exec = ''
        set -e
        lint:clippy
        lint:format
        verify:docs
        deny:check
      '';
      description = "Run all lint and quality gates.";
      binary = "bash";
    };
    "lint:format" = {
      exec = ''
        set -e
        dprint check
      '';
      description = "Check formatting with dprint.";
      binary = "bash";
    };
    "lint:clippy" = {
      exec = ''
        set -e
        cargo clippy --workspace --all-features --all-targets --locked
      '';
      description = "Run clippy checks across the workspace.";
      binary = "bash";
    };
    "release:dry-run" = {
      exec = ''
        set -e
        knope release --dry-run
      '';
      description = "Preview the next release without mutating files.";
      binary = "bash";
    };
  };
}
