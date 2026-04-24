from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from src.controllers import auth_controller
from src.models.db_models import User
from src.models.schemas import TokenResponse, UserLogin, UserRegister
from src.services.auth_service import get_current_user
from src.utils.database import get_db

router = APIRouter()


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(user_data: UserRegister, db: Session = Depends(get_db)):
    return auth_controller.register(user_data, db)


@router.post("/login", response_model=TokenResponse)
def login(user_data: UserLogin, db: Session = Depends(get_db)):
    return auth_controller.login(user_data, db)


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    return auth_controller.get_me(current_user)
