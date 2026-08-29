# ─── AWS WAF v2 Web ACL ───────────────────────────────────────────────────────
resource "aws_wafv2_web_acl" "main" {
  name        = "routeride-${var.environment}-web-acl"
  description = "WAF protection for RouteRide ALB (Common rules, SQLi, bad inputs, rate limiting)"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  # 1. AWS Managed Common Rule Set
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 10

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "routeride-${var.environment}-waf-common"
      sampled_requests_enabled   = true
    }
  }

  # 2. AWS Managed Known Bad Inputs Rule Set
  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 20

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "routeride-${var.environment}-waf-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  # 3. Rate-Limiting Rule (Block IPs exceeding 2000 requests per 5 minutes at WAF layer)
  rule {
    name     = "RateLimit2000Per5Min"
    priority = 30

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "routeride-${var.environment}-waf-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "routeride-${var.environment}-waf-main"
    sampled_requests_enabled   = true
  }

  tags = {
    Name = "routeride-${var.environment}-waf"
  }
}

# ─── Associate WAF with ALB ───────────────────────────────────────────────────
resource "aws_wafv2_web_acl_association" "alb_assoc" {
  resource_arn = aws_lb.main.arn
  web_acl_arn  = aws_wafv2_web_acl.main.arn
}
