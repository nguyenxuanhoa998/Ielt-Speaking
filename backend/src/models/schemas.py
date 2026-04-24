from typing import Optional

from pydantic import BaseModel, EmailStr


class UserRegister(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    role: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str
    role: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class QuestionResponse(BaseModel):
    id: int
    part: str
    topic: Optional[str]
    question_text: str


class TeacherReviewPayload(BaseModel):
    pronunciation_score: float
    adjusted_fluency: Optional[float] = None
    adjusted_lexical: Optional[float] = None
    adjusted_grammar: Optional[float] = None
    final_overall_score: Optional[float] = None
    teacher_feedback: str
