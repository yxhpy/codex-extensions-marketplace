#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
docker build -f tests/docker/Dockerfile -t task-gate-clean-test .
docker run --rm task-gate-clean-test
