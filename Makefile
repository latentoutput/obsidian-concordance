.DEFAULT_GOAL := help

help:
	@echo "Concordance make targets"
	@echo ""
	@echo "  Everyday"
	@echo "    make dev             watch build"
	@echo "    make qa              full local gate (what the pre-push hook runs)"
	@echo "    make pr              push branch, open the PR, enable auto-merge"
	@echo "    make install-local VAULT=~/path/to/vault   build and install for manual testing"
	@echo ""
	@echo "  Releasing (main requires a PR, this drives the whole flow)"
	@echo "    make release         looks at what changed, suggests the bump, asks"
	@echo "    add DRY=1 to preview without changing anything"
	@echo ""
	@echo "    If you already know the bump, skip the question:"
	@echo "      make release-patch | release-minor | release-major"
	@echo "      make release-version VERSION=0.4.2"
	@echo ""
	@echo "  Checks"
	@echo "    make typecheck lint test format-check audit"
	@echo "    npm run check:api-floor   compile src against minAppVersion's typings"
	@echo ""
	@echo "  See CONTRIBUTING.md for the branch and PR workflow."

.PHONY: help pr install install-local dev build typecheck lint lint-fix test format format-check audit outdated qa security security-history clean bump bump-patch bump-minor bump-major release release-check release-patch release-minor release-major release-version

install:
	npm install

# A leading ~ survives as a literal through make into the quoted shell tests
# below, so expand it here rather than reporting a real vault as missing.
VAULT_PATH := $(patsubst ~/%,$(HOME)/%,$(patsubst ~,$(HOME),$(VAULT)))

install-local: build
	@if [ -z "$(VAULT)" ]; then echo "Usage: make install-local VAULT=/path/to/vault" >&2; exit 1; fi
	@if [ ! -d "$(VAULT_PATH)/.obsidian" ]; then echo "$(VAULT_PATH) doesn't look like an Obsidian vault (no .obsidian/)" >&2; exit 1; fi
	@PLUGIN_DIR="$(VAULT_PATH)/.obsidian/plugins/concordance"; \
	  mkdir -p "$$PLUGIN_DIR"; \
	  cp main.js manifest.json styles.css "$$PLUGIN_DIR/"; \
	  echo "Installed Concordance into $$PLUGIN_DIR. Reload Obsidian or toggle the plugin to pick up the build."

pr:
	@BRANCH=$$(git rev-parse --abbrev-ref HEAD); \
	  if [ "$$BRANCH" = "main" ]; then \
	    echo "You are on main, which is protected. Branch first:" >&2; \
	    echo "  git checkout -b fix/something" >&2; \
	    exit 1; \
	  fi; \
	  if [ -n "$$(git status --porcelain)" ]; then \
	    echo "Uncommitted changes. Commit them first." >&2; \
	    git status --short >&2; \
	    exit 1; \
	  fi; \
	  git push -u origin "$$BRANCH" || exit 1; \
	  if gh pr view >/dev/null 2>&1; then \
	    echo "PR already exists, updated it."; \
	  else \
	    gh pr create --fill-first || exit 1; \
	  fi; \
	  gh pr merge --auto --squash; \
	  gh pr view --json url --jq '"  " + .url'

dev:
	npm run dev

build:
	npm run build

typecheck:
	npm run typecheck

lint:
	npm run lint

lint-fix:
	npm run lint:fix

test:
	npm run test

format:
	npm run format

format-check:
	npm run format:check

audit:
	npm run deps:audit

outdated:
	npm run deps:outdated

qa:
	npm run qa

security:
	npm run security

security-history:
	npm run security -- --history

clean:
	rm -f main.js

bump:
	@if [ -z "$(VERSION)" ]; then echo "Usage: make bump VERSION=X.Y.Z (or patch|minor|major)" >&2; exit 1; fi
	npm version $(VERSION)

bump-patch:
	npm version patch

bump-minor:
	npm version minor

bump-major:
	npm version major

release-check:
	@LATEST=$$(curl -fsSL https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/desktop-releases.json | jq -r '.latestVersion' 2>/dev/null); \
	  MIN=$$(node -p "require('./manifest.json').minAppVersion"); \
	  if [ -z "$$LATEST" ] || [ "$$LATEST" = "null" ]; then \
	    echo "Warning: could not read latestVersion from desktop-releases.json; skipping stable-version check." >&2; \
	    exit 0; \
	  fi; \
	  HIGHER=$$(printf '%s\n%s\n' "$$LATEST" "$$MIN" | sort -V | tail -1); \
	  if [ "$$HIGHER" != "$$MIN" ]; then \
	    echo ""; \
	    echo "Heads up: Obsidian stable is at $$LATEST; minAppVersion is $$MIN."; \
	    echo "Make sure the build has been tested against stable, not just Catalyst."; \
	    echo ""; \
	  fi

release:
	@scripts/release.sh $(if $(DRY),--dry-run)

release-patch:
	@scripts/release.sh patch $(if $(DRY),--dry-run)

release-minor:
	@scripts/release.sh minor $(if $(DRY),--dry-run)

release-major:
	@scripts/release.sh major $(if $(DRY),--dry-run)

release-version:
	@test -n "$(VERSION)" || { echo "usage: make release-version VERSION=0.4.2" >&2; exit 64; }
	@scripts/release.sh $(VERSION) $(if $(DRY),--dry-run)
