# ─── 1. App Secrets ───────────────────────────────────────────────────────────
resource "aws_secretsmanager_secret" "app_secrets" {
  name                    = "routeride/${var.environment}/app-secrets"
  description             = "Application secrets for RouteRide (JWT, Stripe, Mapbox, Sentry)"
  recovery_window_in_days = var.environment == "production" ? 30 : 0

  tags = {
    Name = "routeride-${var.environment}-app-secrets"
  }
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

resource "aws_secretsmanager_secret_version" "app_secrets" {
  secret_id = aws_secretsmanager_secret.app_secrets.id

  secret_string = jsonencode({
    NODE_ENV               = var.environment
    JWT_SECRET             = random_password.jwt_secret.result
    JWT_ACCESS_TTL_SECONDS = "900"
    JWT_REFRESH_TTL_SECONDS = "2592000"
    STRIPE_SECRET_KEY      = "dummy_stripe_secret_key"
    STRIPE_WEBHOOK_SECRET  = "dummy_stripe_webhook_secret"
    DATABASE_URL           = "postgresql://${aws_db_instance.postgres.username}:${random_password.db_master.result}@${aws_db_instance.postgres.endpoint}/${aws_db_instance.postgres.db_name}?sslmode=require"
    REDIS_URL              = "rediss://:${random_password.redis_auth.result}@${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379"
  })
}
