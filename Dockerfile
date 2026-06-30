# Build/test image for Casper3643 Odra contracts.
# Linux base avoids the Windows MSVC-linker pain; Odra needs nightly + wasm32 + wabt/binaryen.
# rust:1.85 base (stable) builds the CLIs (cargo-odra needs edition2024, stabilized in 1.85);
# nightly-2024-07-31 is installed separately and selected by the project's rust-toolchain file
# when compiling the Odra contracts.
FROM rust:1.85-bookworm

# Default toolchain stays stable (1.85+) for `cargo install`. Install the nightly Odra needs.
RUN rustup toolchain install nightly-2024-07-31 --profile minimal --component rustfmt --target wasm32-unknown-unknown

# cargo-odra (CLI) + casper-client (pinned 5.0.0 per Odra compat). Built on stable 1.85+.
RUN cargo install cargo-odra --locked \
    && cargo install casper-client --version 5.0.0 --locked

# wasm tooling: wabt (wasm-strip) + binaryen 121 (wasm-opt --signext-lowering +
# --llvm-memory-copy-fill-lowering, required by Odra; Debian's binaryen 108 is too old).
RUN apt-get update \
    && apt-get install -y --no-install-recommends wabt ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && curl -sL https://github.com/WebAssembly/binaryen/releases/download/version_121/binaryen-version_121-x86_64-linux.tar.gz | tar xz -C /usr/local --strip-components=1

WORKDIR /workspace
