terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "environment" {
  type    = string
  default = "production"
}

variable "service_name" {
  type    = string
  default = "xclsv-core-platform"
}

variable "image" {
  type        = string
  description = "Container image URL, e.g. ghcr.io/org/xclsv-core-platform:sha-<commit>"
}

variable "database_url" {
  type      = string
  sensitive = true
}

variable "redis_url" {
  type      = string
  sensitive = true
}

variable "container_port" {
  type    = number
  default = 3000
}

variable "cpu" {
  type    = number
  default = 512
}

variable "memory" {
  type    = number
  default = 1024
}

variable "desired_count" {
  type    = number
  default = 2
}

variable "min_count" {
  type    = number
  default = 2
}

variable "max_count" {
  type    = number
  default = 12
}

variable "subnet_ids" {
  type = list(string)
}

variable "security_group_ids" {
  type = list(string)
}

variable "execution_role_arn" {
  type = string
}

variable "task_role_arn" {
  type = string
}

resource "aws_ecs_cluster" "backend" {
  name = "${var.service_name}-${var.environment}"
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${var.service_name}-${var.environment}"
  retention_in_days = 30
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "${var.service_name}-${var.environment}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.cpu)
  memory                   = tostring(var.memory)
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([
    {
      name      = "backend"
      image     = var.image
      essential = true
      cpu       = var.cpu
      memory    = var.memory

      portMappings = [
        {
          containerPort = var.container_port
          hostPort      = var.container_port
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "NODE_ENV", value = var.environment },
        { name = "HOST", value = "0.0.0.0" },
        { name = "PORT", value = tostring(var.container_port) },
        { name = "DB_POOL_MAX", value = "25" },
        { name = "DB_POOL_MIN", value = "2" },
        { name = "DB_POOL_IDLE_TIMEOUT_MS", value = "30000" },
        { name = "DB_POOL_CONNECTION_TIMEOUT_MS", value = "10000" },
        { name = "DB_POOL_QUERY_TIMEOUT_MS", value = "15000" },
        { name = "DB_QUERY_RETRY_ATTEMPTS", value = "3" },
        { name = "DB_QUERY_RETRY_BACKOFF_MS", value = "200" },
        { name = "LOG_LEVEL", value = "info" }
      ]

      secrets = [
        { name = "DATABASE_URL", valueFrom = var.database_url },
        { name = "REDIS_URL", valueFrom = var.redis_url }
      ]

      healthCheck = {
        command     = ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:${var.container_port}/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
        interval    = 15
        timeout     = 5
        retries     = 3
        startPeriod = 20
      }

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.backend.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "backend" {
  name            = "${var.service_name}-${var.environment}"
  cluster         = aws_ecs_cluster.backend.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = var.security_group_ids
    assign_public_ip = false
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  lifecycle {
    ignore_changes = [desired_count]
  }
}

resource "aws_appautoscaling_target" "backend" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.backend.name}/${aws_ecs_service.backend.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.min_count
  max_capacity       = var.max_count
}

resource "aws_appautoscaling_policy" "cpu_target" {
  name               = "${var.service_name}-${var.environment}-cpu-target"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.backend.resource_id
  scalable_dimension = aws_appautoscaling_target.backend.scalable_dimension
  service_namespace  = aws_appautoscaling_target.backend.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = 65
    scale_in_cooldown  = 300
    scale_out_cooldown = 120

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

resource "aws_appautoscaling_policy" "memory_target" {
  name               = "${var.service_name}-${var.environment}-memory-target"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.backend.resource_id
  scalable_dimension = aws_appautoscaling_target.backend.scalable_dimension
  service_namespace  = aws_appautoscaling_target.backend.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = 70
    scale_in_cooldown  = 300
    scale_out_cooldown = 120

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
  }
}
