# ElastiCache Redis Cluster
resource "aws_elasticache_subnet_group" "redis" {
  name       = "${var.cluster_name}-redis-subnet-group"
  subnet_ids = module.vpc.private_subnets

  tags = merge(
    {
      Name = "${var.cluster_name}-redis-subnet-group"
    },
    var.additional_tags
  )
}

resource "aws_security_group" "redis" {
  name        = "${var.cluster_name}-redis-sg"
  description = "Security group for ElastiCache Redis"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.eks_additional.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(
    {
      Name = "${var.cluster_name}-redis-sg"
    },
    var.additional_tags
  )
}

resource "aws_elasticache_parameter_group" "redis" {
  family = "redis7.x"
  name   = "${var.cluster_name}-redis-params"

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  tags = var.additional_tags
}

resource "aws_elasticache_replication_group" "redis" {
  description          = "Redis cluster for Arctos Robot Controller"
  replication_group_id = "${var.cluster_name}-redis"

  node_type               = var.redis_node_type
  port                    = 6379
  parameter_group_name    = aws_elasticache_parameter_group.redis.name
  num_cache_clusters      = var.redis_num_cache_nodes
  engine_version          = "7.0"

  subnet_group_name  = aws_elasticache_subnet_group.redis.name
  security_group_ids = [aws_security_group.redis.id]

  at_rest_encryption_enabled = var.enable_encryption
  transit_encryption_enabled = var.enable_encryption
  auth_token                 = var.enable_encryption ? random_password.redis_auth_token.result : null

  automatic_failover_enabled = var.redis_num_cache_nodes > 1
  multi_az_enabled          = var.redis_num_cache_nodes > 1

  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_slow.name
    destination_type = "cloudwatch-logs"
    log_format       = "text"
    log_type         = "slow-log"
  }

  tags = merge(
    {
      Name = "${var.cluster_name}-redis"
    },
    var.additional_tags
  )
}

resource "random_password" "redis_auth_token" {
  length  = 32
  special = false
}

# Store Redis auth token in AWS Secrets Manager
resource "aws_secretsmanager_secret" "redis_auth_token" {
  count                   = var.enable_encryption ? 1 : 0
  name                    = "${var.cluster_name}/redis/auth-token"
  description             = "Redis auth token for Arctos Robot Controller"
  recovery_window_in_days = 7

  tags = var.additional_tags
}

resource "aws_secretsmanager_secret_version" "redis_auth_token" {
  count         = var.enable_encryption ? 1 : 0
  secret_id     = aws_secretsmanager_secret.redis_auth_token[0].id
  secret_string = jsonencode({
    auth_token = random_password.redis_auth_token.result
    endpoint   = aws_elasticache_replication_group.redis.configuration_endpoint_address
    port       = aws_elasticache_replication_group.redis.port
  })
}

# CloudWatch log group for Redis slow logs
resource "aws_cloudwatch_log_group" "redis_slow" {
  name              = "/aws/elasticache/${var.cluster_name}-redis/slow-log"
  retention_in_days = var.log_retention_days

  tags = var.additional_tags
}