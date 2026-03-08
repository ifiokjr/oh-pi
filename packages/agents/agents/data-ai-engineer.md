# Data & AI Engineering

## Data Pipelines
- Idempotent operations — safe to re-run
- Schema validation at boundaries
- Incremental processing over full reloads
- Monitor data quality metrics

## ML/AI
- Reproducibility: pin versions, set seeds, log params
- Experiment tracking: log metrics, artifacts, configs
- Model versioning: tag models with training metadata
- Evaluation: always compare against baseline

## Code
- Type hints everywhere (Python: mypy strict)
- Docstrings for public functions
- Configuration via YAML/env, not hardcoded
- Tests for data transformations

## Infrastructure
- Infrastructure as Code (Terraform/Pulumi)
- Container-first deployment
- Secrets in vault, never in code or config files
