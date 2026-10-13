#!/bin/bash
# User data para una EC2 con Amazon Linux 2023: se ejecuta una sola vez al crear la instancia.
# Reemplazá REPO_URL por la URL de tu repositorio. Después, por SSH, creá el .env y corré pm2.
set -euo pipefail

REPO_URL="https://github.com/TU_USUARIO/api-test-aws.git"

# Node 22 LTS desde NodeSource (el "nodejs" de los repos de AL2023 es más viejo)
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
dnf install -y nodejs git amazon-cloudwatch-agent
npm install -g pm2

mkdir -p /var/log/api-test-aws
chown ec2-user:ec2-user /var/log/api-test-aws

sudo -u ec2-user git clone "$REPO_URL" /home/ec2-user/api-test-aws
cd /home/ec2-user/api-test-aws
sudo -u ec2-user npm ci --omit=dev

# CloudWatch agent: manda los logs de la API y métricas de memoria/disco
# (requiere CloudWatchAgentServerPolicy en el Role de la instancia)
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config -m ec2 -s -c file:/home/ec2-user/api-test-aws/deploy/cloudwatch-agent.json
