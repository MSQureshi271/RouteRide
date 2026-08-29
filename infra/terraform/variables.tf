variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Deployment environment name"
  type        = string
  default     = "staging"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
  default     = ["10.0.10.0/24", "10.0.11.0/24"]
}

variable "database_subnet_cidrs" {
  description = "CIDR blocks for database private subnets"
  type        = list(string)
  default     = ["10.0.20.0/24", "10.0.21.0/24"]
}

variable "redis_subnet_cidrs" {
  description = "CIDR blocks for redis private subnets"
  type        = list(string)
  default     = ["10.0.30.0/24", "10.0.31.0/24"]
}

variable "db_instance_class" {
  description = "Instance type for PostgreSQL RDS"
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "Allocated storage in GB for RDS"
  type        = number
  default     = 20
}

variable "redis_node_type" {
  description = "Instance type for ElastiCache Redis"
  type        = string
  default     = "cache.t4g.micro"
}

variable "certificate_arn" {
  description = "ACM Certificate ARN for HTTPS ALB listener (optional in local/dry-run)"
  type        = string
  default     = ""
}
