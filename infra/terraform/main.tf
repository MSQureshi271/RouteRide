terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  backend "s3" {
    bucket         = "routeride-terraform-state-staging"
    key            = "staging/terraform.tfstate"
    region         = "ap-south-1"
    dynamodb_table = "routeride-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "RouteRide"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}
