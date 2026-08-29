# ─── Redis Subnet Group ───────────────────────────────────────────────────────
resource "aws_elasticache_subnet_group" "main" {
  name        = "routeride-${var.environment}-redis-subnet-group"
  subnet_ids  = aws_subnet.redis[*].id
  description = "Subnet group for RouteRide Redis cluster"

  tags = {
    Name = "routeride-${var.environment}-redis-subnet-group"
  }
}

# ─── Redis Security Group ─────────────────────────────────────────────────────
resource "aws_security_group" "redis" {
  name        = "routeride-${var.environment}-redis-sg"
  description = "Controls access to ElastiCache Redis"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Redis access from ECS App Tasks"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "routeride-${var.environment}-redis-sg"
  }
}

# ─── Redis Parameter Group ────────────────────────────────────────────────────
resource "aws_elasticache_parameter_group" "redis7" {
  name        = "routeride-${var.environment}-redis7-params"
  family      = "redis7"
  description = "Redis 7 parameter group with eviction and maxmemory policy"

  parameter {
    name  = "maxmemory-policy"
    value = "volatile-lru"
  }

  tags = {
    Name = "routeride-${var.environment}-redis7-params"
  }
}

# ─── Redis Auth Token ─────────────────────────────────────────────────────────
resource "random_password" "redis_auth" {
  length  = 32
  special = false
}

# ─── ElastiCache Redis 7 Replication Group ────────────────────────────────────
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id          = "routeride-${var.environment}-redis"
  description                   = "RouteRide Redis 7 replication group for cache, rate-limiting and pub/sub"
  node_type                     = var.redis_node_type
  port                          = 6379
  parameter_group_name          = aws_elasticache_parameter_group.redis7.name
  subnet_group_name             = aws_elasticache_subnet_group.main.name
  security_group_ids            = [aws_security_group.redis.id]
  automatic_failover_enabled    = true
  multi_az_enabled              = true
  num_cache_clusters            = 2
  at_rest_encryption_enabled    = true
  transit_encryption_enabled   = true
  auth_token                    = random_password.redis_auth.result
  apply_immediately             = true
  maintenance_window            = "sun:05:00-sun:06:00"
  snapshot_retention_limit      = 7
  snapshot_window               = "04:00-05:00"

  tags = {
    Name = "routeride-${var.environment}-redis"
  }
}
