from fastapi import APIRouter

from app.api.routes import health, providers

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(providers.router, tags=["providers"])
