output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "alb_dns_name" {
  description = "Public DNS name of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "Canonical hosted zone ID of the ALB"
  value       = aws_lb.main.zone_id
}

output "rds_endpoint" {
  description = "PostgreSQL RDS connection endpoint"
  value       = aws_db_instance.postgres.endpoint
}

output "rds_database_name" {
  description = "PostgreSQL database name"
  value       = aws_db_instance.postgres.db_name
}

output "redis_primary_endpoint" {
  description = "ElastiCache Redis primary endpoint address"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "documents_bucket_name" {
  description = "Name of the private documents S3 bucket"
  value       = aws_s3_bucket.documents.id
}

output "documents_bucket_arn" {
  description = "ARN of the private documents S3 bucket"
  value       = aws_s3_bucket.documents.arn
}

output "assets_bucket_name" {
  description = "Name of the public assets S3 bucket"
  value       = aws_s3_bucket.assets.id
}

output "ecr_repository_urls" {
  description = "Map of ECR repository URLs by service name"
  value       = { for k, v in aws_ecr_repository.services : k => v.repository_url }
}

output "ecs_execution_role_arn" {
  description = "ARN of the ECS execution IAM role"
  value       = aws_iam_role.ecs_execution.arn
}

output "ecs_task_role_arn" {
  description = "ARN of the ECS task runtime IAM role"
  value       = aws_iam_role.ecs_task.arn
}
