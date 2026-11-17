#!/usr/bin/env bash
# Local Docker for bootstrap.sh (E003): Postgres for the integration and e2e tests runs in one container (`pnpm db:up`).
# The runtime is Colima (open source, no GUI, a small VM) with Homebrew's docker CLI. A machine where `docker info`
# already answers (Docker Desktop, OrbStack, Colima) is left alone. Bash 3.2 compatible.
#
#   ensure_docker   returns 0 when Docker answers, after setting it up if needed; otherwise says why on stderr, returns 1
#
# DOCKER_WAIT_SECONDS (default 90) bounds the wait for Docker after Colima starts at login.

docker_ready() { docker info >/dev/null 2>&1; }

# `docker compose` finds Homebrew's docker-compose plugin through cliPluginsExtraDirs in ~/.docker/config.json; every
# other key stays, and the directory is added once.
docker_plugin_dir() {
  local dir="$1" config="$HOME/.docker/config.json" tmp
  docker compose version >/dev/null 2>&1 && return 0
  command -v jq >/dev/null || { echo "jq not found: cannot edit $config (brew install jq)" >&2; return 1; }
  mkdir -p "$HOME/.docker" || return 1
  [ -s "$config" ] || echo '{}' >"$config"
  tmp="$(mktemp "$config.XXXXXX")" || return 1
  if jq --arg dir "$dir" '.cliPluginsExtraDirs = ((.cliPluginsExtraDirs // []) | if index($dir) then . else . + [$dir] end)' "$config" >"$tmp"; then
    mv "$tmp" "$config"
  else
    rm -f "$tmp"
    echo "could not add $dir to cliPluginsExtraDirs in $config (is it valid JSON?)" >&2
    return 1
  fi
}

ensure_docker() {
  local wait="${DOCKER_WAIT_SECONDS:-90}" started
  docker_ready && return 0
  command -v brew >/dev/null || { echo "Docker is not running and Homebrew is missing: install Homebrew (https://brew.sh), then run scripts/bootstrap.sh" >&2; return 1; }
  brew install colima docker docker-compose \
    || { echo "could not run: brew install colima docker docker-compose" >&2; return 1; }
  docker_plugin_dir "$(brew --prefix)/lib/docker/cli-plugins" || return 1
  # The first start writes the profile (~/.colima/default/colima.yaml) with small limits; the login service (a launchd
  # agent that keeps `colima start -f` alive) then starts it. With a profile there, whatever was changed in it (more
  # memory) stays: only the service starts.
  if [ ! -f "$HOME/.colima/default/colima.yaml" ]; then
    colima start --cpu 2 --memory 4 --disk 30 --vm-type vz --mount-type virtiofs \
      || { echo "could not run: colima start" >&2; return 1; }
    colima stop || { echo "could not run: colima stop" >&2; return 1; }
  fi
  brew services start colima || { echo "could not run: brew services start colima" >&2; return 1; }
  started=$SECONDS
  until docker_ready; do
    if [ $((SECONDS - started)) -ge "$wait" ]; then
      echo "Docker did not start within $wait seconds: check colima status, then brew services start colima" >&2
      return 1
    fi
    sleep 1
  done
}
