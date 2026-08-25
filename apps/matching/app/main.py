"""RouteRide Matching Service — FastAPI application root."""
from fastapi import FastAPI

app = FastAPI(
    title="RouteRide Matching Service",
    description="Route-matching microservice for the RouteRide platform",
    version="0.1.0",
)


@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness probe endpoint."""
    return {"status": "ok"}
