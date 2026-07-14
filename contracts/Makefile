# MateFi — Soroban contracts Makefile
# Requires: Rust toolchain with wasm32v1-none target, stellar-cli ≥ 26
# Install target: rustup target add wasm32v1-none

WASM_TARGET := wasm32v1-none
WASM_OUT    := target/$(WASM_TARGET)/release

.PHONY: build test fmt lint clean deploy help

help:
	@echo "MateFi Soroban Contracts"
	@echo ""
	@echo "Usage:"
	@echo "  make build    — compile all contracts to WASM"
	@echo "  make test     — run all contract unit tests"
	@echo "  make fmt      — format source code"
	@echo "  make lint     — run Clippy (warnings = errors)"
	@echo "  make clean    — remove build artifacts"
	@echo "  make deploy   — deploy all WASMs to Stellar testnet"
	@echo ""
	@echo "Env vars for deploy:"
	@echo "  STELLAR_SECRET_KEY — Stellar account secret (S...)"
	@echo "  STELLAR_NETWORK    — testnet (default) or mainnet"

build:
	cargo build --target $(WASM_TARGET) --release

test:
	cargo test

fmt:
	cargo fmt --all

lint:
	cargo clippy --all-targets --all-features -- -D warnings

clean:
	cargo clean

# Deploy all contracts.  Requires STELLAR_SECRET_KEY to be set.
# Run `scripts/deploy-all.sh` for full sequenced init after this step.
deploy: build
ifndef STELLAR_SECRET_KEY
	$(error STELLAR_SECRET_KEY is not set. Export it before running make deploy)
endif
	@for wasm in $(WASM_OUT)/*.wasm; do \
	  echo "Deploying $$wasm …"; \
	  stellar contract deploy \
	    --wasm "$$wasm" \
	    --source "$(STELLAR_SECRET_KEY)" \
	    --network "$${STELLAR_NETWORK:-testnet}"; \
	done
