# ─── Stage 1: Dependency Builder ──────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /app

# Install build essentials for C-extensions (Shapely / GEOS / OR-Tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgeos-dev \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy pyproject.toml
COPY apps/matching/pyproject.toml ./

# Install pip and wheel
RUN pip install --no-cache-dir --upgrade pip setuptools wheel
RUN pip install --no-cache-dir \
    fastapi>=0.110.0 \
    uvicorn[standard]>=0.28.0 \
    pydantic>=2.6.0 \
    shapely>=2.0.0 \
    structlog>=24.1.0 \
    opentelemetry-api>=1.24.0 \
    opentelemetry-sdk>=1.24.0 \
    opentelemetry-instrumentation-fastapi>=0.45b0 \
    sentry-sdk>=2.0.0 \
    httpx>=0.27.0

# ─── Stage 2: Hardened Production Runner ───────────────────────────────────────
FROM python:3.12-slim AS runner

WORKDIR /app

# Install runtime libraries for GEOS
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgeos-c1v5 \
    && rm -rf /var/lib/apt/lists/*

# Security: Create unprivileged system user and group (UID 10001)
RUN groupadd -g 10001 appgroup && \
    useradd -u 10001 -g appgroup -s /sbin/nologin -M appuser

# Copy virtual environment from builder
COPY --from=builder --chown=appuser:appgroup /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Copy application source code
COPY --chown=appuser:appgroup apps/matching/app ./app

# Run as non-root user
USER appuser

EXPOSE 8000

# Health check probe
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Application startup
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
