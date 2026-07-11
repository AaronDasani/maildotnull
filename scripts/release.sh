#!/usr/bin/env bash
# Tag a new release and push it — this triggers .github/workflows/release.yml,
# which builds the Docker image and pushes it to Docker Hub.
#
# Usage: scripts/release.sh 1.2.0
set -euo pipefail

VERSION="${1:?usage: scripts/release.sh <version>   e.g. scripts/release.sh 1.2.0}"
VERSION="${VERSION#v}"
TAG="v$VERSION"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: working tree is not clean — commit or stash first" >&2
  exit 1
fi

git tag -a "$TAG" -m "Release $TAG"
git push origin "$TAG"
echo "Pushed $TAG — release workflow is running: check the repo's Actions tab."
