import json
import os
import shutil
import time
import uuid
from typing import Optional

import google.generativeai as genai
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File,
    Form,
    status,
    BackgroundTasks,
)
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.orm import joinedload

import models
from auth import get_current_user
from database import get_db, SessionLocal
from ml_models import whisper_model

router = APIRouter()

api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)


def get_gemini_model():
    return genai.GenerativeModel("models/gemini-2.5-flash")


class QuestionResponse(BaseModel):
    id: int
    part: str
    topic: Optional[str]
    question_text: str


@router.get("/questions/generate", response_model=QuestionResponse)
def generate_question(part: str, db: Session = Depends(get_db)):
    """
    Generate a random IELTS question for part1, part2, or part3 using Gemini AI.
    """
    if part not in ["part1", "part2", "part3"]:
        raise HTTPException(
            status_code=400, detail="part must be 'part1', 'part2', or 'part3'"
        )

    model = get_gemini_model()

    prompts = {
        "part1": "Generate a single random IELTS Speaking Part 1 question. It should be a short, conversational question about familiar topics like home, work, study, hobbies, etc. Only return the question text, no introductions.",
        "part2": "Generate a random IELTS Speaking Part 2 cue card question. It should start with 'Describe a...' and include 3-4 bullet points of what to say. Only return the actual cue card text.",
        "part3": "Generate a single random IELTS Speaking Part 3 question. It should be an abstract, analytical question related to broader themes in society. Only return the question text.",
    }

    try:
        response = model.generate_content(prompts[part])
        question_text = response.text.strip()

        # Save to DB
        new_question = models.Question(
            part=part, topic="AI Generated", question_text=question_text
        )
        db.add(new_question)
        db.commit()
        db.refresh(new_question)

        return new_question
    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(
            status_code=500, detail=f"Failed to generate question: {str(e)}"
        )


@router.post("/submissions", status_code=status.HTTP_201_CREATED)
async def create_submission(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    file: UploadFile = File(...),
    question_id: Optional[int] = Form(None),
    question_text: Optional[str] = Form(None),
    part: Optional[str] = Form(None),
):
    """
    Submit an audio response to a question.
    Can pass an existing `question_id`, OR `question_text` and `part` to create a new custom question inline.
    """
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Only students can submit answers.")

    # 1. Resolve Question
    if question_id:
        question = (
            db.query(models.Question).filter(models.Question.id == question_id).first()
        )
        if not question:
            raise HTTPException(status_code=404, detail="Question not found.")
    elif question_text and part:
        if part not in ["part1", "part2", "part3"]:
            raise HTTPException(status_code=400, detail="Invalid part.")
        # Create new question from user input
        question = models.Question(
            part=part, topic="User Custom", question_text=question_text
        )
        db.add(question)
        db.commit()
        db.refresh(question)
    else:
        raise HTTPException(
            status_code=400,
            detail="Must provide either question_id, or question_text and part.",
        )

    # 2. Save Audio File
    valid_extensions = (".wav", ".mp3", ".m4a", ".webm", ".ogg", ".flac")
    if not file.filename.lower().endswith(valid_extensions):
        raise HTTPException(status_code=400, detail="Invalid audio file format")

    ext = os.path.splitext(file.filename)[1]
    filename = f"{uuid.uuid4()}{ext}"
    filepath = os.path.join("uploads", filename)

    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # 3. Create Submission record
    submission = models.Submission(
        user_id=current_user.id,
        question_id=question.id,
        audio_file_path=filepath,
        status="pending",
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)

    # 4. Trigger Background Task
    background_tasks.add_task(process_submission_background, submission.id)

    return {
        "message": "Submission received and is being processed",
        "submission_id": submission.id,
    }


async def process_submission_background(submission_id: int):
    """
    Background task to transcribe audio and evaluate with AI
    """
    db = SessionLocal()
    try:
        submission = (
            db.query(models.Submission)
            .filter(models.Submission.id == submission_id)
            .first()
        )
        if not submission:
            return

        question = submission.question
        filepath = submission.audio_file_path

        # 1. Transcribe Audio
        result = whisper_model.transcribe(filepath, fp16=False)
        transcript_text = result["text"]

        submission.transcript = transcript_text
        submission.status = "transcribed"
        db.commit()

        # 2. Evaluate with AI
        model_ai = get_gemini_model()
        prompt = f"""You are a certified IELTS Speaking examiner. Be strict, objective, and consistent with official IELTS band descriptors.

Evaluate the candidate's response to the following question.

Question ({question.part}): "{question.question_text}"

Candidate's Response:
"{transcript_text}"

Scoring criteria:
- Fluency and Coherence
- Lexical Resource
- Grammatical Range and Accuracy
- Pronunciation (estimate based on text only)

Instructions:
- Give realistic band scores (0-9, allow .5 like 6.5)
- Do NOT be overly generous
- Base feedback on specific issues in the response in context of addressing the question.
- Avoid vague comments

Return ONLY valid JSON (no explanation outside JSON):

{{
  "overall_band": number,
  "fluency_coherence": {{
    "score": number,
    "strengths": string,
    "weaknesses": string
  }},
  "lexical_resource": {{
    "score": number,
    "strengths": string,
    "weaknesses": string
  }},
  "grammar": {{
    "score": number,
    "strengths": string,
    "weaknesses": string
  }},
  "pronunciation": {{
    "score": number,
    "note": "Estimated from text",
    "feedback": string
  }},
  "key_mistakes": [
    "specific mistake 1",
    "specific mistake 2"
  ],
  "improvement_suggestions": [
    "actionable suggestion 1",
    "actionable suggestion 2",
    "actionable suggestion 3"
  ]
}}"""
        print(
            f">>> [DEBUG] CALLING GEMINI API FOR EVALUATION (SUBMISSION {submission_id})"
        )

        # Retry logic for 429
        max_retries = 3
        retry_delay = 5
        response = None

        for i in range(max_retries):
            try:
                response = model_ai.generate_content(
                    prompt,
                    generation_config=genai.GenerationConfig(
                        response_mime_type="application/json",
                    ),
                )
                break
            except Exception as e:
                if "429" in str(e) and i < max_retries - 1:
                    time.sleep(retry_delay)
                    retry_delay *= 2
                else:
                    raise e

        if response:
            evaluation_result = json.loads(response.text)
            ai_eval = models.AiEvaluation(
                submission_id=submission.id,
                fluency_score=evaluation_result["fluency_coherence"]["score"],
                lexical_score=evaluation_result["lexical_resource"]["score"],
                grammar_score=evaluation_result["grammar"]["score"],
                overall_score=evaluation_result["overall_band"],
                strengths=json.dumps(
                    {
                        "fluency": evaluation_result["fluency_coherence"]["strengths"],
                        "lexical": evaluation_result["lexical_resource"]["strengths"],
                        "grammar": evaluation_result["grammar"]["strengths"],
                    }
                ),
                areas_for_improvement=json.dumps(
                    {
                        "key_mistakes": evaluation_result["key_mistakes"],
                        "suggestions": evaluation_result["improvement_suggestions"],
                    }
                ),
                raw_llm_response=evaluation_result,
            )
            db.add(ai_eval)
            submission.status = "ai_evaluated"
            db.commit()

    except Exception as e:
        import traceback

        traceback.print_exc()
        if submission:
            submission.status = "failed"
            db.commit()
    finally:
        db.close()


@router.get("/submissions")
def get_submissions(
    db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)
):
    """
    List submissions based on user role.
    Students see only theirs. Teachers/admins see all.
    """
    query = db.query(models.Submission).options(
        joinedload(models.Submission.question),
        joinedload(models.Submission.ai_evaluation),
        joinedload(models.Submission.teacher_review),
    )

    if current_user.role == "student":
        query = query.filter(models.Submission.user_id == current_user.id)

    submissions = query.order_by(models.Submission.submitted_at.desc()).all()

    results = []
    for sub in submissions:
        ai_score = sub.ai_evaluation.overall_score if sub.ai_evaluation else None
        teacher_score = (
            sub.teacher_review.final_overall_score if sub.teacher_review else None
        )
        overall_score = teacher_score if teacher_score is not None else ai_score

        results.append(
            {
                "id": sub.id,
                "question": sub.question.question_text if sub.question else None,
                "part": sub.question.part if sub.question else None,
                "status": sub.status,
                "submitted_at": sub.submitted_at,
                "score": overall_score,
                "ai_overall_score": ai_score,
                "teacher_overall_score": teacher_score,
                "audio_file_path": f"/{sub.audio_file_path}",
            }
        )

    return results


@router.get("/submissions/{submission_id}")
def get_submission_detail(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Get the full details of a specific submission.
    """
    submission = (
        db.query(models.Submission)
        .options(
            joinedload(models.Submission.question),
            joinedload(models.Submission.ai_evaluation),
            joinedload(models.Submission.user),
        )
        .filter(models.Submission.id == submission_id)
        .first()
    )

    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    if current_user.role == "student" and submission.user_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="Not authorized to view this submission"
        )

    return {
        "id": submission.id,
        "student_name": submission.user.full_name,
        "question": {
            "part": submission.question.part,
            "text": submission.question.question_text,
        },
        "audio_url": f"/{submission.audio_file_path}",
        "transcript": submission.transcript,
        "status": submission.status,
        "submitted_at": submission.submitted_at,
        "ai_evaluation": submission.ai_evaluation.raw_llm_response
        if submission.ai_evaluation
        else None,
    }


@router.get("/dashboard/summary")
def get_dashboard_summary(
    db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)
):
    """
    Get summary stats for the student dashboard.
    """
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Not authorized")

    submissions = (
        db.query(models.Submission)
        .options(
            joinedload(models.Submission.ai_evaluation),
            joinedload(models.Submission.teacher_review),
        )
        .filter(models.Submission.user_id == current_user.id)
        .all()
    )

    total_submissions = len(submissions)

    pending_statuses = ["pending", "transcribed", "ai_evaluated"]
    pending_review = sum(
        1 for s in submissions if s.status in pending_statuses and not s.teacher_review
    )
    reviewed = sum(
        1 for s in submissions if s.status == "completed" or s.teacher_review
    )

    # avg overall band
    scores = []
    for sub in submissions:
        if sub.teacher_review and sub.teacher_review.final_overall_score is not None:
            scores.append(float(sub.teacher_review.final_overall_score))
        elif sub.ai_evaluation and sub.ai_evaluation.overall_score is not None:
            scores.append(float(sub.ai_evaluation.overall_score))

    avg_overall_band = round(sum(scores) / len(scores), 1) if scores else 0.0

    return {
        "total_submissions": total_submissions,
        "avg_overall_band": avg_overall_band,
        "pending_review": pending_review,
        "reviewed": reviewed,
    }


class TeacherReviewPayload(BaseModel):
    pronunciation_score: float
    adjusted_fluency: Optional[float] = None
    adjusted_lexical: Optional[float] = None
    adjusted_grammar: Optional[float] = None
    final_overall_score: Optional[float] = None
    teacher_feedback: str


@router.post("/submissions/{submission_id}/review", status_code=status.HTTP_200_OK)
def submit_teacher_review(
    submission_id: int,
    payload: TeacherReviewPayload,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Teacher submits or updates a manual review for a submission.
    Requires: teacher role. Validates: pronunciation required, feedback >= 20 chars.
    """
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can submit reviews.")

    submission = (
        db.query(models.Submission)
        .filter(models.Submission.id == submission_id)
        .first()
    )
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found.")

    # Validate
    if not (0 <= payload.pronunciation_score <= 9):
        raise HTTPException(status_code=400, detail="Score must be between 0.0 and 9.0")
    if len(payload.teacher_feedback.strip()) < 20:
        raise HTTPException(
            status_code=400, detail="Review must be at least 20 characters."
        )

    # Compute final overall score if not explicitly provided
    ai_eval = submission.ai_evaluation
    fluency = payload.adjusted_fluency or (
        float(ai_eval.fluency_score) if ai_eval and ai_eval.fluency_score else None
    )
    lexical = payload.adjusted_lexical or (
        float(ai_eval.lexical_score) if ai_eval and ai_eval.lexical_score else None
    )
    grammar = payload.adjusted_grammar or (
        float(ai_eval.grammar_score) if ai_eval and ai_eval.grammar_score else None
    )

    scores = [
        s
        for s in [payload.pronunciation_score, fluency, lexical, grammar]
        if s is not None
    ]
    computed_overall = round(sum(scores) / len(scores) * 2) / 2 if scores else None

    final_score = payload.final_overall_score or computed_overall

    # Upsert: update if exists, create if not
    existing = (
        db.query(models.TeacherReview)
        .filter(
            models.TeacherReview.submission_id == submission_id,
            models.TeacherReview.teacher_id == current_user.id,
        )
        .first()
    )

    if existing:
        existing.pronunciation_score = payload.pronunciation_score
        existing.adjusted_fluency = payload.adjusted_fluency
        existing.adjusted_lexical = payload.adjusted_lexical
        existing.adjusted_grammar = payload.adjusted_grammar
        existing.final_overall_score = final_score
        existing.teacher_feedback = payload.teacher_feedback
    else:
        review = models.TeacherReview(
            submission_id=submission_id,
            teacher_id=current_user.id,
            pronunciation_score=payload.pronunciation_score,
            adjusted_fluency=payload.adjusted_fluency,
            adjusted_lexical=payload.adjusted_lexical,
            adjusted_grammar=payload.adjusted_grammar,
            final_overall_score=final_score,
            teacher_feedback=payload.teacher_feedback,
        )
        db.add(review)

    # Update submission status to completed
    submission.status = "completed"
    db.commit()

    return {
        "message": "Review submitted successfully",
        "final_overall_score": final_score,
    }


@router.get("/submissions/{submission_id}/review")
def get_teacher_review(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Get the teacher review for a submission (if it exists).
    """
    if current_user.role not in ["teacher", "admin"]:
        raise HTTPException(status_code=403, detail="Not authorized.")

    review = (
        db.query(models.TeacherReview)
        .filter(models.TeacherReview.submission_id == submission_id)
        .first()
    )

    if not review:
        return None

    return {
        "id": review.id,
        "pronunciation_score": float(review.pronunciation_score)
        if review.pronunciation_score
        else None,
        "adjusted_fluency": float(review.adjusted_fluency)
        if review.adjusted_fluency
        else None,
        "adjusted_lexical": float(review.adjusted_lexical)
        if review.adjusted_lexical
        else None,
        "adjusted_grammar": float(review.adjusted_grammar)
        if review.adjusted_grammar
        else None,
        "final_overall_score": float(review.final_overall_score)
        if review.final_overall_score
        else None,
        "teacher_feedback": review.teacher_feedback,
        "reviewed_at": review.reviewed_at,
    }
