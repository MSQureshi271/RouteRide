# ─── ALB Security Group ───────────────────────────────────────────────────────
resource "aws_security_group" "alb" {
  name        = "routeride-${var.environment}-alb-sg"
  description = "Controls inbound web traffic to RouteRide ALB"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTP ingress"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS ingress"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "routeride-${var.environment}-alb-sg"
  }
}

# ─── ECS Tasks Security Group ─────────────────────────────────────────────────
resource "aws_security_group" "ecs_tasks" {
  name        = "routeride-${var.environment}-ecs-tasks-sg"
  description = "Controls traffic between ALB, microservices, and databases"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Inbound traffic from ALB to API (3000)"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    description     = "Inbound traffic from ALB to Admin (3001)"
    from_port       = 3001
    to_port         = 3001
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    description = "Service-to-service matching mesh (8000)"
    from_port   = 8000
    to_port     = 8000
    protocol    = "tcp"
    self        = true
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "routeride-${var.environment}-ecs-tasks-sg"
  }
}

# ─── Application Load Balancer ────────────────────────────────────────────────
resource "aws_lb" "main" {
  name               = "routeride-${var.environment}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  enable_deletion_protection = var.environment == "production" ? true : false
  drop_invalid_header_fields = true

  tags = {
    Name = "routeride-${var.environment}-alb"
  }
}

# ─── Target Group: API ────────────────────────────────────────────────────────
resource "aws_lb_target_group" "api" {
  name                 = "routeride-${var.environment}-api-tg"
  port                 = 3000
  protocol             = "HTTP"
  vpc_id               = aws_vpc.main.id
  target_type          = "ip"
  deregistration_delay = 30

  health_check {
    enabled             = true
    path                = "/health"
    protocol            = "HTTP"
    port                = "traffic-port"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200"
  }

  tags = {
    Name    = "routeride-${var.environment}-api-tg"
    Service = "api"
  }
}

# ─── Target Group: Admin Panel ────────────────────────────────────────────────
resource "aws_lb_target_group" "admin" {
  name                 = "routeride-${var.environment}-admin-tg"
  port                 = 3001
  protocol             = "HTTP"
  vpc_id               = aws_vpc.main.id
  target_type          = "ip"
  deregistration_delay = 30

  health_check {
    enabled             = true
    path                = "/api/health"
    protocol            = "HTTP"
    port                = "traffic-port"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200"
  }

  tags = {
    Name    = "routeride-${var.environment}-admin-tg"
    Service = "admin"
  }
}

# ─── HTTP Listener (Redirect to HTTPS or Default API routing) ─────────────────
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}
