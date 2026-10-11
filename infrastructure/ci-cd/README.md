# Development continuous deployment

`GYMRide CD` runs only after `GYMRide CI` succeeds for a push to `development_server`. It
checks out and tags images with that CI run's exact commit SHA, rejects stale runs, serializes
deployments, and uses GitHub OIDC plus AWS Systems Manager. No long-lived AWS key is stored in
GitHub.

The EC2 runtime environment remains at `/opt/gymride/.env.docker`. CD never uploads or rewrites it.
The deployment overlay changes only Backend, Admin, and Partner; PostgreSQL, Redis, named volumes,
and the current environment stay in place. Uploaded images are stored in PostgreSQL by this app.

## AWS setup

Set administrator-shell values first:

```bash
export AWS_REGION=ap-south-1
export AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
export EC2_INSTANCE_ID=i-0123456789abcdef0
export CD_ROLE_NAME=GymRideGitHubDevelopmentDeploy
export EC2_ROLE_NAME=GymRideDevelopmentEC2
```

Create immutable ECR repositories:

```bash
for repo in gymride/backend gymride/admin gymride/partner; do
  aws ecr describe-repositories --region "$AWS_REGION" --repository-names "$repo" >/dev/null 2>&1 || \
    aws ecr create-repository --region "$AWS_REGION" --repository-name "$repo" \
      --image-tag-mutability IMMUTABLE --image-scanning-configuration scanOnPush=true
done
```

Create the GitHub OIDC provider once per account:

```bash
aws iam get-open-id-connect-provider --open-id-connect-provider-arn \
  "arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com" >/dev/null 2>&1 || \
aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com
```

Create `/tmp/gymride-github-trust.json` (replace `AWS_ACCOUNT_ID`) and create the role:

```json
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Federated":"arn:aws:iam::AWS_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"},"Action":"sts:AssumeRoleWithWebIdentity","Condition":{"StringEquals":{"token.actions.githubusercontent.com:aud":"sts.amazonaws.com","token.actions.githubusercontent.com:sub":"repo:surajkantrai-oss/GYM-Ride-FullStack:environment:development"}}}]}
```

```bash
sed -i.bak "s/AWS_ACCOUNT_ID/${AWS_ACCOUNT_ID}/g" /tmp/gymride-github-trust.json
aws iam create-role --role-name "$CD_ROLE_NAME" --assume-role-policy-document file:///tmp/gymride-github-trust.json
```

Create `/tmp/gymride-github-permissions.json`, substitute its placeholders, and attach it inline:

```json
{
  "Version":"2012-10-17",
  "Statement":[
    {"Effect":"Allow","Action":"ecr:GetAuthorizationToken","Resource":"*"},
    {"Effect":"Allow","Action":["ecr:BatchCheckLayerAvailability","ecr:BatchGetImage","ecr:CompleteLayerUpload","ecr:DescribeImages","ecr:GetDownloadUrlForLayer","ecr:InitiateLayerUpload","ecr:PutImage","ecr:UploadLayerPart"],"Resource":["arn:aws:ecr:AWS_REGION:AWS_ACCOUNT_ID:repository/gymride/backend","arn:aws:ecr:AWS_REGION:AWS_ACCOUNT_ID:repository/gymride/admin","arn:aws:ecr:AWS_REGION:AWS_ACCOUNT_ID:repository/gymride/partner"]},
    {"Effect":"Allow","Action":"ssm:SendCommand","Resource":["arn:aws:ssm:AWS_REGION::document/AWS-RunShellScript","arn:aws:ec2:AWS_REGION:AWS_ACCOUNT_ID:instance/EC2_INSTANCE_ID"]},
    {"Effect":"Allow","Action":["ssm:GetCommandInvocation","ssm:ListCommandInvocations"],"Resource":"*"}
  ]
}
```

```bash
sed -i.bak -e "s/AWS_REGION/${AWS_REGION}/g" -e "s/AWS_ACCOUNT_ID/${AWS_ACCOUNT_ID}/g" \
  -e "s/EC2_INSTANCE_ID/${EC2_INSTANCE_ID}/g" /tmp/gymride-github-permissions.json
aws iam put-role-policy --role-name "$CD_ROLE_NAME" --policy-name GymRideDevelopmentDeployment \
  --policy-document file:///tmp/gymride-github-permissions.json
```

Attach SSM and ECR-pull permissions to the EC2 instance role:

```bash
aws iam attach-role-policy --role-name "$EC2_ROLE_NAME" \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
cat >/tmp/gymride-ec2-ecr.json <<JSON
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"ecr:GetAuthorizationToken","Resource":"*"},{"Effect":"Allow","Action":["ecr:BatchCheckLayerAvailability","ecr:BatchGetImage","ecr:GetDownloadUrlForLayer"],"Resource":"arn:aws:ecr:${AWS_REGION}:${AWS_ACCOUNT_ID}:repository/gymride/*"}]}
JSON
aws iam put-role-policy --role-name "$EC2_ROLE_NAME" --policy-name GymRideECRPull \
  --policy-document file:///tmp/gymride-ec2-ecr.json
aws ssm describe-instance-information --region "$AWS_REGION" \
  --filters "Key=InstanceIds,Values=${EC2_INSTANCE_ID}" \
  --query 'InstanceInformationList[0].PingStatus' --output text
```

The last command must return `Online`. The instance must have Docker Engine, Compose v2, AWS CLI v2,
and curl. Confirm the existing state without changing it:

```bash
sudo test -r /opt/gymride/.env.docker
sudo docker network inspect gymride_gymride >/dev/null
sudo docker compose version
aws --version
curl --version
```

The instance profile must be attached to EC2. SSM normally runs as root, which must be able to use
Docker and write `/opt/gymride`. Keep `.env.docker` root-readable only and preserve its current DB,
application secrets, payment/push configuration, and CORS values.

## GitHub environment

Create the Actions environment `development`, restrict it to `development_server`, and optionally add
required reviewers. Set environment **variables** (not secrets):

```bash
gh api --method PUT "repos/surajkantrai-oss/GYM-Ride-FullStack/environments/development" --input - <<'JSON'
{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}
JSON
gh api --method POST \
  "repos/surajkantrai-oss/GYM-Ride-FullStack/environments/development/deployment-branch-policies" \
  -f name=development_server -f type=branch
gh variable set AWS_REGION --env development --body "$AWS_REGION"
gh variable set AWS_ROLE_ARN --env development --body "arn:aws:iam::${AWS_ACCOUNT_ID}:role/${CD_ROLE_NAME}"
gh variable set ECR_REPOSITORY_BACKEND --env development --body gymride/backend
gh variable set ECR_REPOSITORY_ADMIN --env development --body gymride/admin
gh variable set ECR_REPOSITORY_PARTNER --env development --body gymride/partner
gh variable set EC2_INSTANCE_ID --env development --body "$EC2_INSTANCE_ID"
gh variable set DEPLOY_PATH --env development --body /opt/gymride
gh variable set GYMRIDE_NETWORK --env development --body gymride_gymride
gh variable set NEXT_PUBLIC_API_BASE_URL --env development --body http://3.7.19.143/api/v1
gh variable set BACKEND_HEALTH_URL --env development --body http://127.0.0.1:3000/api/v1/health
gh variable set ADMIN_HEALTH_URL --env development --body http://127.0.0.1:3001
gh variable set PARTNER_HEALTH_URL --env development --body http://127.0.0.1:3002
```

No GitHub secret is required. Runtime secrets stay only in EC2's `.env.docker`.

## Activate and test

After AWS and GitHub configuration is complete, deliberately activate CD with:

```bash
git add .github/workflows/cd.yml infrastructure/ci-cd
git commit -m "ci: add AWS development deployment pipeline"
git push origin development_server
gh run watch --exit-status
gh run list --branch development_server --limit 5
```

Then verify the externally exposed reverse-proxy routes. Ports 3000–3002 do not need to be publicly
open because CD checks them locally on EC2:

```bash
curl --fail http://3.7.19.143/api/v1/health
curl --fail --output /dev/null http://3.7.19.143
```

## Rollback

Failed health checks automatically redeploy the previously recorded application SHA. On the first
CD run, the script locally tags the three pre-CD container images and can restore those instead.
Prisma migrations are not reversed automatically; migrations must remain backward-compatible. A
custom PostgreSQL dump is saved as `/opt/gymride/backups/predeploy-<sha>.dump` before migration.

For a manual application rollback, select a known-good SHA still retained in all three ECR
repositories and dispatch the rollback job:

```bash
export ROLLBACK_SHA=0123456789abcdef0123456789abcdef01234567
gh workflow run cd.yml --ref development_server -f rollback_sha="$ROLLBACK_SHA"
gh run watch --exit-status
```

This calls `/opt/gymride/rollback.sh` through SSM and verifies all three local health endpoints.
Database restore is a separate destructive incident-recovery operation and is intentionally never
automatic.
