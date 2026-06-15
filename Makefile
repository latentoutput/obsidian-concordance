.PHONY: install dev build typecheck lint lint-fix test format format-check markdownlint audit outdated qa security security-history clean bump bump-patch bump-minor bump-major release release-patch release-minor release-major

install:
	npm install

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

markdownlint:
	npm run lint:md

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

release: qa
	@VERSION=$$(node -p "require('./manifest.json').version"); \
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
