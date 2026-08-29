locals {
  services = ["api", "matching", "admin", "worker"]
}

# ─── ECR Repositories with Scan-On-Push ───────────────────────────────────────
resource "aws_ecr_repository" "services" {
  for_each             = toset(locals.services)
  name                 = "routeride/${each.key}"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name    = "routeride-${each.key}"
    Service = each.key
  }
}

# ─── ECR Lifecycle Policy (Expire untagged images > 14 days) ──────────────────
resource "aws_ecr_lifecycle_policy" "services" {
  for_each   = toset(locals.services)
  repository = aws_ecr_repository.services[each.key].name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images older than 14 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 14
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Keep last 30 tagged deployment images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["sha-", "v", "release-", "stage-"]
          countType     = "imageCountMoreThan"
          countNumber   = 30
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}
