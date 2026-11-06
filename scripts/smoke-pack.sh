#!/usr/bin/env bash
# Install the packed tarball into an empty project, the way a user would, and
# check that every public entry point loads. Unit tests run against src/ and
# cannot catch packaging bugs (missing files, undeclared deps, broken exports).
#
# Usage: npm run build && scripts/smoke-pack.sh [playwright-version]
set -euo pipefail

PW_VERSION="${1:-latest}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cd "$ROOT"
TARBALL="$(npm pack --silent --pack-destination "$WORK" | tail -1)"
echo "packed $TARBALL"
tar -tzf "$WORK/$TARBALL" | grep -q '^package/dist/ci/index.js$' || {
	echo "FAIL: dist/ci/index.js (GitHub Action entry) missing from tarball"
	exit 1
}

cd "$WORK"
npm init -y >/dev/null
npm install --no-audit --no-fund "./$TARBALL" "@playwright/test@$PW_VERSION"

count="$(npm ls --all --parseable | tail -n +2 | wc -l | tr -d ' ')"
echo "installed packages (kovar + playwright): $count"

for heavy in better-sqlite3 @modelcontextprotocol/sdk @babel/parser; do
	if [ -d "node_modules/$heavy" ]; then
		echo "FAIL: optional peer $heavy was installed by default"
		exit 1
	fi
done

for entry in "" /core /reporter /next; do
	node --input-type=module -e "await import('@orlalabs/kovar$entry')"
	node -e "require('@orlalabs/kovar$entry')"
	echo "ok  @orlalabs/kovar$entry (esm + cjs)"
done

npx kovar --help >/dev/null
echo "ok  kovar --help"

if npx kovar mcp </dev/null 2>"$WORK/mcp.err"; then
	echo "FAIL: kovar mcp started without its optional peers"
	exit 1
fi
grep -q "npm install -D @modelcontextprotocol/sdk better-sqlite3" "$WORK/mcp.err" || {
	echo "FAIL: kovar mcp did not print the install hint"
	cat "$WORK/mcp.err"
	exit 1
}
echo "ok  kovar mcp prints install hint without peers"

npm install --no-audit --no-fund @modelcontextprotocol/sdk better-sqlite3 \
	@babel/parser @babel/traverse @babel/generator @babel/types >/dev/null
for entry in /mcp /vite /babel; do
	node --input-type=module -e "await import('@orlalabs/kovar$entry')"
	node -e "require('@orlalabs/kovar$entry')"
	echo "ok  @orlalabs/kovar$entry with optional peers (esm + cjs)"
done

echo "smoke-pack passed"
