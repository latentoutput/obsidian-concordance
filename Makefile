.PHONY: install install-local dev build typecheck lint lint-fix test format format-check audit outdated qa security security-history clean bump bump-patch bump-minor bump-major release release-check release-patch release-minor release-major

install:
	npm install

install-local: build
	@if [ -z "$(VAULT)" ]; then echo "Usage: make install-local VAULT=/path/to/vault" >&2; exit 1; fi
	@if [ ! -d "$(VAULT)/.obsidian" ]; then echo "$(VAULT) doesn't look like an Obsidian vault (no .obsidian/)" >&2; exit 1; fi
	@PLUGIN_DIR="$(VAULT)/.obsidian/plugins/concordance"; \
	  mkdir -p "$$PLUGIN_DIR"; \
	  cp main.js manifest.json styles.css "$$PLUGIN_DIR/"; \
	  echo "Installed Concordance into $$PLUGIN_DIR. Reload Obsidian or toggle the plugin to pick up the build."

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

release: qa release-check
	@VERSION=$$(node -p "require('./manifest.json').version"); \
	  echo ""; \
	  echo "About to release $$VERSION."; \
	  echo ""; \
	  echo "Have you:"; \
	  echo "  [ ] Installed main.js in a real Obsidian vault (make install-local VAULT=...)?"; \
	  echo "  [ ] Exercised 'Update current index' and 'Update all indexes'?"; \
	  echo "  [ ] Verified the settings tab renders and persists changes?"; \
	  echo ""; \
	  printf "Continue? [y/N]: "; \
	  read REPLY; \
	  case "$$REPLY" in \
	    y|Y|yes|Yes|YES) ;; \
	    *) echo "Release canceled. No tag was pushed." >&2; exit 1 ;; \
	  esac; \
	  git rev-parse "$$VERSION" >/dev/null 2>&1 || git tag "$$VERSION"; \
	  echo "Pushing tag $$VERSION; GitHub Actions will build, attest, and publish the release."; \
	  git push --follow-tags; \
	  echo "Watch the release workflow: gh run watch --exit-status"

release-patch:
	$(MAKE) bump-patch
	$(MAKE) release

release-minor:
	$(MAKE) bump-minor
	$(MAKE) release

release-major:
	$(MAKE) bump-major
	$(MAKE) release
