from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, UploadFile, status
from sqlalchemy.orm import Session

from src.controllers import submission_controller
from src.models.db_models import User
from src.models.schemas import AssignTeacherPayload, QuestionResponse, TeacherReviewPayload
from src.services.auth_service import get_current_user
from src.utils.database import get_db

router = APIRouter()


@router.get("/teachers")
def get_teachers(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return submission_controller.get_teachers(db)


@router.get("/questions/generate", response_model=QuestionResponse)
def generate_question(part: str, db: Session = Depends(get_db)):
    return submission_controller.generate_question(part, db)


@router.post("/submissions", status_code=status.HTTP_201_CREATED)
async def create_submission(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    file: UploadFile = File(...),
    question_id: Optional[int] = Form(None),
    question_text: Optional[str] = Form(None),
    part: Optional[str] = Form(None),
    teacher_id: Optional[int] = Form(None),
):
    return await submission_controller.create_submission(
        background_tasks, db, current_user, file, question_id, question_text, part, teacher_id
    )


@router.get("/submissions")
def get_submissions(
    page: Optional[int] = None,
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return submission_controller.get_submissions(db, current_user, page, limit)


@router.get("/submissions/{submission_id}")
def get_submission_detail(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return submission_controller.get_submission_detail(submission_id, db, current_user)


@router.get("/dashboard/summary")
def get_dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return submission_controller.get_dashboard_summary(db, current_user)


@router.patch("/submissions/{submission_id}/assign-teacher", status_code=status.HTTP_200_OK)
def assign_teacher(
    submission_id: int,
    payload: AssignTeacherPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return submission_controller.assign_teacher(submission_id, payload.teacher_id, db, current_user)


@router.post("/submissions/{submission_id}/review", status_code=status.HTTP_200_OK)
def submit_teacher_review(
    submission_id: int,
    payload: TeacherReviewPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return submission_controller.submit_teacher_review(submission_id, payload, db, current_user)


@router.get("/submissions/{submission_id}/review")
def get_teacher_review(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return submission_controller.get_teacher_review(submission_id, db, current_user)
