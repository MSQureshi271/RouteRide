# ─── Database Subnet Group ───────────────────────────────────────────────────
resource "aws_db_subnet_group" "main" {
  name        = "routeride-${var.environment}-db-subnet-group"
  subnet_ids  = aws_subnet.database[*].id
  description = "Subnet group for RouteRide PostgreSQL RDS"

  tags = {
    Name = "routeride-${var.environment}-db-subnet-group"
  }
}

# ─── Database Security Group ──────────────────────────────────────────────────
resource "aws_security_group" "rds" {
  name        = "routeride-${var.environment}-rds-sg"
  description = "Controls access to PostgreSQL RDS"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "PostgreSQL access from ECS App Tasks"
    from_port       = 5432
    to_port         = 5432
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
    Name = "routeride-${var.environment}-rds-sg"
  }
}

# ─── DB Parameter Group (PostGIS Support) ─────────────────────────────────────
resource "aws_db_parameter_group" "postgres16" {
  name        = "routeride-${var.environment}-pg16-params"
  family      = "postgres16"
  description = "PostgreSQL 16 parameter group with PostGIS support"

  parameter {
    name  = "rds.extensions"
    value = "uuid-ossp,postgis"
  }

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  tags = {
    Name = "routeride-${var.environment}-pg16-params"
  }
}

# ─── Random Master Password ───────────────────────────────────────────────────
resource "random_password" "db_master" {
  length  = 32
  special = false
}

# ─── RDS PostgreSQL 16 Multi-AZ Instance ──────────────────────────────────────
resource "aws_db_instance" "postgres" {
  identifier                  = "routeride-${var.environment}-db"
  engine                      = "postgres"
  engine_version              = "16.2"
  instance_class              = var.db_instance_class
  allocated_storage           = var.db_allocated_storage
  max_allocated_storage       = 100
  storage_type                = "gp3"
  storage_encrypted           = true
  multi_az                    = true
  publicly_accessible         = false
  db_subnet_group_name        = aws_db_subnet_group.main.name
  vpc_security_group_ids      = [aws_security_group.rds.id]
  parameter_group_name        = aws_db_parameter_group.postgres16.name
  db_name                     = "routeride_${var.environment}"
  username                    = "routeride_admin"
  password                    = random_password.db_master.result
  backup_retention_period     = 7
  backup_window               = "03:00-04:00"
  maintenance_window          = "Mon:04:00-Mon:05:00"
  auto_minor_version_upgrade  = true
  deletion_protection         = var.environment == "production" ? true : false
  skip_final_snapshot         = var.environment == "production" ? false : true
  final_snapshot_identifier   = "routeride-${var.environment}-db-final-snapshot"

  tags = {
    Name = "routeride-${var.environment}-postgres"
  }
}
