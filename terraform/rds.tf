# RDS PostgreSQL instance (for production)
resource "aws_db_subnet_group" "postgres" {
  count      = var.environment == "dev" ? 0 : 1
  name       = "${var.cluster_name}-db-subnet-group"
  subnet_ids = module.vpc.private_subnets

  tags = merge(
    {
      Name = "${var.cluster_name}-db-subnet-group"
    },
    var.additional_tags
  )
}

resource "aws_db_parameter_group" "postgres" {
  count  = var.environment == "dev" ? 0 : 1
  family = "postgres14"
  name   = "${var.cluster_name}-db-params"

  parameter {
    name  = "log_statement"
    value = "all"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  tags = var.additional_tags
}

resource "aws_security_group" "rds" {
  count       = var.environment == "dev" ? 0 : 1
  name        = "${var.cluster_name}-rds-sg"
  description = "Security group for RDS PostgreSQL"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
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
      Name = "${var.cluster_name}-rds-sg"
    },
    var.additional_tags
  )
}

resource "aws_db_instance" "postgres" {
  count = var.environment == "dev" ? 0 : 1

  identifier     = "${var.cluster_name}-postgres"
  engine         = "postgres"
  engine_version = "14.9"
  instance_class = var.rds_instance_class

  allocated_storage     = var.rds_allocated_storage
  max_allocated_storage = var.rds_allocated_storage * 2
  storage_encrypted     = var.enable_encryption
  storage_type          = "gp3"

  db_name  = "arctos"
  username = "arctos_user"
  password = random_password.db_password[0].result

  vpc_security_group_ids = [aws_security_group.rds[0].id]
  db_subnet_group_name   = aws_db_subnet_group.postgres[0].name
  parameter_group_name   = aws_db_parameter_group.postgres[0].name

  backup_retention_period = var.backup_retention_days
  backup_window          = "03:00-04:00"
  maintenance_window     = "Sun:04:00-Sun:05:00"

  skip_final_snapshot = var.environment == "dev"
  deletion_protection = var.environment == "prod"

  enabled_cloudwatch_logs_exports = var.enable_monitoring ? ["postgresql", "upgrade"] : []

  tags = merge(
    {
      Name = "${var.cluster_name}-postgres"
    },
    var.additional_tags
  )
}

resource "random_password" "db_password" {
  count   = var.environment == "dev" ? 0 : 1
  length  = 16
  special = true
}

# Store database password in AWS Secrets Manager
resource "aws_secretsmanager_secret" "db_password" {
  count                   = var.environment == "dev" ? 0 : 1
  name                    = "${var.cluster_name}/database/password"
  description             = "Database password for Arctos Robot Controller"
  recovery_window_in_days = 7

  tags = var.additional_tags
}

resource "aws_secretsmanager_secret_version" "db_password" {
  count         = var.environment == "dev" ? 0 : 1
  secret_id     = aws_secretsmanager_secret.db_password[0].id
  secret_string = jsonencode({
    username = aws_db_instance.postgres[0].username
    password = random_password.db_password[0].result
    endpoint = aws_db_instance.postgres[0].endpoint
    port     = aws_db_instance.postgres[0].port
    dbname   = aws_db_instance.postgres[0].db_name
  })
}