# ─── KMS Key for Documents S3 Encryption ─────────────────────────────────────
resource "aws_kms_key" "s3_docs" {
  description             = "KMS key for RouteRide documents bucket SSE-KMS encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name = "routeride-${var.environment}-s3-docs-kms"
  }
}

resource "aws_kms_alias" "s3_docs" {
  name          = "alias/routeride-${var.environment}-s3-docs"
  target_key_id = aws_kms_key.s3_docs.key_id
}

# ─── 1. Documents S3 Bucket (Private, SSE-KMS, Versioned) ─────────────────────
resource "aws_s3_bucket" "documents" {
  bucket        = "routeride-documents-${var.environment}"
  force_destroy = var.environment == "production" ? false : true

  tags = {
    Name        = "routeride-documents-${var.environment}"
    DataPrivacy = "SensitivePII"
  }
}

resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.s3_docs.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "documents" {
  bucket = aws_s3_bucket.documents.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Bucket policy: Deny all non-HTTPS transport and enforce TLS 1.2+
resource "aws_s3_bucket_policy" "documents_deny_insecure" {
  bucket = aws_s3_bucket.documents.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyNonSSLRequests"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.documents.arn,
          "${aws_s3_bucket.documents.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      },
      {
        Sid       = "DenyIncorrectEncryptionHeader"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.documents.arn}/*"
        Condition = {
          StringNotEquals = {
            "s3:x-amz-server-side-encryption" = "aws:kms"
          }
        }
      }
    ]
  })
}

# ─── 2. Assets S3 Bucket (CloudFront Origin) ──────────────────────────────────
resource "aws_s3_bucket" "assets" {
  bucket        = "routeride-assets-${var.environment}"
  force_destroy = var.environment == "production" ? false : true

  tags = {
    Name = "routeride-assets-${var.environment}"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket = aws_s3_bucket.assets.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# CloudFront Origin Access Control (OAC)
resource "aws_cloudfront_origin_access_control" "assets_oac" {
  name                              = "routeride-${var.environment}-assets-oac"
  description                       = "OAC for RouteRide public static assets"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Assets bucket policy: Allow read only via CloudFront OAC
resource "aws_s3_bucket_policy" "assets_cloudfront" {
  bucket = aws_s3_bucket.assets.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontServicePrincipalReadOnly"
        Effect    = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.assets.arn}/*"
      },
      {
        Sid       = "DenyNonSSLRequests"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.assets.arn,
          "${aws_s3_bucket.assets.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}
