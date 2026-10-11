#!/usr/bin/env bash
set -Eeuo pipefail

[[ $# -eq 1 && "$1" =~ ^[0-9a-f]{40}$ ]] || { echo "Usage: $0 <previous-40-character-git-sha>" >&2; exit 2; }
rollback_sha="$1"
deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
env_file="${GYMRIDE_ENV_FILE:-${deploy_dir}/.env.docker}"
compose_file="${deploy_dir}/docker-compose.deploy.yml"
state_file="${deploy_dir}/.last-successful-sha"
previous_file="${deploy_dir}/.previous-successful-sha"
required=(AWS_REGION ECR_REGISTRY ECR_REPOSITORY_BACKEND ECR_REPOSITORY_ADMIN ECR_REPOSITORY_PARTNER BACKEND_HEALTH_URL ADMIN_HEALTH_URL PARTNER_HEALTH_URL)
for name in "${required[@]}"; do [[ -n "${!name:-}" ]] || { echo "Missing required environment variable: ${name}" >&2; exit 2; }; done
export IMAGE_TAG="$rollback_sha"
export GYMRIDE_NETWORK="${GYMRIDE_NETWORK:-gymride_gymride}"
compose=(docker compose --project-name gymride --env-file "$env_file" -f "$compose_file")
health_check() {
  local name="$1" url="$2" attempt
  for attempt in $(seq 1 30); do
    if curl --silent --show-error --fail --max-time 5 "$url" >/dev/null; then echo "${name} health check passed: ${url}"; return 0; fi
    sleep 5
  done
  echo "${name} health check failed: ${url}" >&2; return 1
}
old_current=""; [[ -r "$state_file" ]] && old_current="$(tr -d '[:space:]' < "$state_file")"
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"
"${compose[@]}" pull backend admin partner
"${compose[@]}" up -d --no-deps backend admin partner
health_check Backend "$BACKEND_HEALTH_URL"; health_check Admin "$ADMIN_HEALTH_URL"; health_check Partner "$PARTNER_HEALTH_URL"
[[ "$old_current" =~ ^[0-9a-f]{40}$ && "$old_current" != "$rollback_sha" ]] && printf '%s\n' "$old_current" > "$previous_file"
printf '%s\n' "$rollback_sha" > "$state_file"
echo "Application rollback succeeded: ${rollback_sha}"
echo "Database migrations were not reversed; use only backward-compatible migrations."
