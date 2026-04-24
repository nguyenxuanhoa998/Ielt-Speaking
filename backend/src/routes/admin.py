from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.controllers import admin_controller
from src.controllers.admin_controller import require_admin
from src.models.db_models import User
from src.utils.database import get_db

router = APIRouter()


@router.get("/stats")
def get_admin_stats(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return admin_controller.get_admin_stats(db, admin)


@router.get("/users")
def get_all_users(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return admin_controller.get_all_users(db, admin)


@router.post("/users/{user_id}/approve")
def approve_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return admin_controller.approve_user(user_id, db, admin)


@router.delete("/users/{user_id}/reject")
def reject_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return admin_controller.reject_user(user_id, db, admin)


@router.get("/analytics")
def get_analytics(
    days: int = 30,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return admin_controller.get_analytics(days, db, admin)


@router.get("/activity")
def get_activity(
    limit: int = 20,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return admin_controller.get_activity(limit, db, admin)
