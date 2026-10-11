#!/usr/bin/env bash
set -Eeuo pipefail

[[ $# -eq 1 && "$1" =~ ^[0-9a-f]{40}$ ]] || { echo "Usage: $0 <40-character-git-sha>" >&2; exit 2; }
target_sha="$1"
deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
env_file="${GYMRIDE_ENV_FILE:-${deploy_dir}/.env.docker}"
compose_file="${deploy_dir}/docker-compose.deploy.yml"
backup_dir="${deploy_dir}/backups"
state_file="${deploy_dir}/.last-successful-sha"
previous_file="${deploy_dir}/.previous-successful-sha"

required=(AWS_REGION ECR_REGISTRY ECR_REPOSITORY_BACKEND ECR_REPOSITORY_ADMIN ECR_REPOSITORY_PARTNER BACKEND_HEALTH_URL ADMIN_HEALTH_URL PARTNER_HEALTH_URL)
for name in "${required[@]}"; do
  [[ -n "${!name:-}" ]] || { echo "Missing required environment variable: ${name}" >&2; exit 2; }
done
for command in aws curl docker; do command -v "$command" >/dev/null || { echo "Required command not found: ${command}" >&2; exit 2; }; done
docker compose version >/dev/null
[[ -r "$env_file" ]] || { echo "Runtime environment file not found: ${env_file}" >&2; exit 2; }
[[ -r "$compose_file" ]] || { echo "Deployment compose file not found: ${compose_file}" >&2; exit 2; }

export IMAGE_TAG="$target_sha"
export GYMRIDE_NETWORK="${GYMRIDE_NETWORK:-gymride_gymride}"
compose=(docker compose --project-name gymride --env-file "$env_file" -f "$compose_file")

health_check() {
  local name="$1" url="$2" attempt
  for attempt in $(seq 1 30); do
    if curl --silent --show-error --fail --max-time 5 "$url" >/dev/null; then echo "${name} health check passed: ${url}"; return 0; fi
    sleep 5
  done
  echo "${name} health check failed after 150 seconds: ${url}" >&2
  return 1
}

current_sha=""
[[ -r "$state_file" ]] && current_sha="$(tr -d '[:space:]' < "$state_file")"

# Keep local references to the currently running images. This makes the very first CD deployment
# recoverable even though no earlier SHA-tagged ECR deployment has been recorded yet.
local_backup_available=true
for service in backend admin partner; do
  container_id="$(docker ps -aq --filter "label=com.docker.compose.project=gymride" --filter "label=com.docker.compose.service=${service}" | head -n 1)"
  if [[ -z "$container_id" ]]; then
    local_backup_available=false
    break
  fi
  image_id="$(docker inspect --format '{{.Image}}' "$container_id")"
  docker tag "$image_id" "gymride-local-backup/${service}:previous"
done

aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"
echo "Pulling immutable images tagged ${target_sha}"
"${compose[@]}" pull migrate backend admin partner
if [[ "$current_sha" == "$target_sha" ]]; then
  echo "Commit ${target_sha} is already deployed; checking health only"
  health_check Backend "$BACKEND_HEALTH_URL"; health_check Admin "$ADMIN_HEALTH_URL"; health_check Partner "$PARTNER_HEALTH_URL"
  exit 0
fi

mkdir -p "$backup_dir" && chmod 0700 "$backup_dir"
echo "Creating a pre-migration PostgreSQL backup"
docker run --rm --network "$GYMRIDE_NETWORK" --env-file "$env_file" --env "DEPLOY_SHA=$target_sha" --volume "$backup_dir:/backups" postgres:16-alpine sh -eu -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump --host=postgres --username="${POSTGRES_USER:-gymride}" --dbname="${POSTGRES_DB:-gymride}" --format=custom --file="/backups/predeploy-${DEPLOY_SHA}.dump"'

echo "Applying committed Prisma migrations"
"${compose[@]}" run --rm migrate

rollback_on_failure() {
  status=$?
  if [[ "$status" -ne 0 && "$current_sha" =~ ^[0-9a-f]{40}$ ]]; then
    echo "Deployment failed; attempting application rollback to ${current_sha}" >&2
    "$deploy_dir/rollback.sh" "$current_sha" || echo "Automatic application rollback also failed" >&2
  elif [[ "$status" -ne 0 && "$local_backup_available" == true ]]; then
    echo "Deployment failed; restoring the pre-CD local application images" >&2
    if env ECR_REGISTRY=gymride-local-backup \
      ECR_REPOSITORY_BACKEND=backend \
      ECR_REPOSITORY_ADMIN=admin \
      ECR_REPOSITORY_PARTNER=partner \
      IMAGE_TAG=previous \
      "${compose[@]}" up -d --no-deps backend admin partner \
      && health_check Backend "$BACKEND_HEALTH_URL" \
      && health_check Admin "$ADMIN_HEALTH_URL" \
      && health_check Partner "$PARTNER_HEALTH_URL"; then
      echo "Pre-CD application images restored" >&2
    else
      echo "Automatic local-image rollback also failed" >&2
    fi
  elif [[ "$status" -ne 0 ]]; then
    echo "Deployment failed and no prior application images are available for automatic rollback" >&2
  fi
  exit "$status"
}
trap rollback_on_failure ERR

echo "Starting Backend, Admin and Partner without recreating PostgreSQL or Redis"
"${compose[@]}" up -d --no-deps backend admin partner
health_check Backend "$BACKEND_HEALTH_URL"
health_check Admin "$ADMIN_HEALTH_URL"
health_check Partner "$PARTNER_HEALTH_URL"
trap - ERR
[[ "$current_sha" =~ ^[0-9a-f]{40}$ ]] && printf '%s\n' "$current_sha" > "$previous_file"
printf '%s\n' "$target_sha" > "$state_file"
echo "Deployment succeeded: ${target_sha}"
