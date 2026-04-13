from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

import models
from auth import get_current_user
from database import get_db

router = APIRouter()


def require_admin(current_user: models.User = Depends(get_current_user)):
    if current_user.role != 'admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


# ── GET /admin/stats ────────────────────────────────────────────────
@router.get("/stats")
def get_admin_stats(
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    now = datetime.utcnow()
    week_ago  = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    total_users       = db.query(models.User).count()
    total_submissions = db.query(models.Submission).count()
    students          = db.query(models.User).filter(models.User.role == 'student', models.User.is_approved == True).count()
    teachers          = db.query(models.User).filter(models.User.role == 'teacher', models.User.is_approved == True).count()
    admins            = db.query(models.User).filter(models.User.role == 'admin',   models.User.is_approved == True).count()

    teachers_pending  = db.query(models.User).filter(models.User.role == 'teacher', models.User.is_approved == False).count()
    admins_pending    = db.query(models.User).filter(models.User.role == 'admin',   models.User.is_approved == False).count()

    users_this_week   = db.query(models.User).filter(models.User.created_at >= week_ago).count()
    students_this_week= db.query(models.User).filter(models.User.role == 'student', models.User.created_at >= week_ago).count()
    submissions_month = db.query(models.Submission).filter(models.Submission.submitted_at >= month_ago).count()

    pending_reviews   = db.query(models.Submission).filter(
        models.Submission.status.in_(['pending', 'transcribed', 'ai_evaluated'])
    ).count()

    avg_band_row = db.query(func.avg(models.AiEvaluation.overall_score)).scalar()
    avg_band = float(avg_band_row) if avg_band_row else 0.0

    return {
        "total_users":          total_users,
        "total_submissions":    total_submissions,
        "students":             students,
        "teachers":             teachers,
        "admins":               admins,
        "teachers_pending":     teachers_pending,
        "admins_pending":       admins_pending,
        "users_this_week":      users_this_week,
        "students_this_week":   students_this_week,
        "submissions_this_month": submissions_month,
        "pending_reviews":      pending_reviews,
        "avg_band":             round(avg_band, 1) if avg_band else None,
        "storage_pct":          68,   # placeholder — hook in real disk usage if needed
        "api_quota_pct":        42,   # placeholder — hook in Gemini quota usage if needed
    }


# ── GET /admin/users ────────────────────────────────────────────────
@router.get("/users")
def get_all_users(
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    users = db.query(models.User).order_by(models.User.is_approved.asc(), models.User.created_at.desc()).all()
    return [
        {
            "id":          u.id,
            "full_name":   u.full_name,
            "email":       u.email,
            "role":        u.role,
            "is_approved": u.is_approved,
            "created_at":  u.created_at.isoformat() if u.created_at else None,
            "institution": "",  # extend model if you add institution field later
        }
        for u in users
    ]


# ── POST /admin/users/{user_id}/approve ─────────────────────────────
@router.post("/users/{user_id}/approve", status_code=status.HTTP_200_OK)
def approve_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.is_approved:
        raise HTTPException(status_code=400, detail="User already approved")
    user.is_approved = True
    db.commit()
    return {"message": f"User {user.full_name} approved successfully"}


# ── DELETE /admin/users/{user_id}/reject ────────────────────────────
@router.delete("/users/{user_id}/reject", status_code=status.HTTP_200_OK)
def reject_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.is_approved:
        raise HTTPException(status_code=400, detail="Cannot reject an already-approved user")
    db.delete(user)
    db.commit()
    return {"message": f"User {user.full_name} rejected and removed"}


# ── GET /admin/analytics ─────────────────────────────────────────────
@router.get("/analytics")
def get_analytics(
    days: int = 30,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    now      = datetime.utcnow()
    since    = now - timedelta(days=days)
    prev     = since - timedelta(days=days)

    # Period submissions
    period_subs = db.query(models.Submission).filter(models.Submission.submitted_at >= since).count()
    prev_subs   = db.query(models.Submission).filter(
        models.Submission.submitted_at >= prev,
        models.Submission.submitted_at <  since
    ).count()

    # Total users
    total_users  = db.query(models.User).count()
    new_users    = db.query(models.User).filter(models.User.created_at >= since).count()

    # Avg band
    avg_band_row = db.query(func.avg(models.AiEvaluation.overall_score)).scalar()
    avg_band     = float(avg_band_row) if avg_band_row else 0.0

    # Evaluation stats
    ai_only          = db.query(models.Submission).filter(models.Submission.status == 'ai_evaluated').count()
    reviewed         = db.query(models.Submission).filter(models.Submission.status == 'completed').count()
    pending_proc     = db.query(models.Submission).filter(models.Submission.status.in_(['pending', 'transcribed'])).count()
    total_sub_all    = ai_only + reviewed + pending_proc or 1
    completion_rate  = round((reviewed / total_sub_all) * 100) if total_sub_all else 0

    # Timeline — group by interval
    interval_days = 1 if days <= 7 else (3 if days <= 30 else 10)
    timeline = []
    for i in range(int(days / interval_days) - 1, -1, -1):
        seg_start = now - timedelta(days=(i + 1) * interval_days)
        seg_end   = now - timedelta(days=i * interval_days)
        count = db.query(models.Submission).filter(
            models.Submission.submitted_at >= seg_start,
            models.Submission.submitted_at <  seg_end,
        ).count()
        label = f"{seg_end.day}/{seg_end.month}" if days <= 30 else f"W{seg_end.isocalendar()[1]}"
        timeline.append({"label": label, "count": count})

    # Score distribution
    score_rows = db.query(models.AiEvaluation.overall_score).all()
    dist = {"9":0,"8":0,"7":0,"6":0,"5":0,"4":0,"<4":0}
    for (s,) in score_rows:
        if s is None: continue
        sv = float(s)
        if   sv >= 8.5: dist["9"] += 1
        elif sv >= 7.5: dist["8"] += 1
        elif sv >= 6.5: dist["7"] += 1
        elif sv >= 5.5: dist["6"] += 1
        elif sv >= 4.5: dist["5"] += 1
        elif sv >= 3.5: dist["4"] += 1
        else:           dist["<4"] += 1

    # Top performers (students with highest avg score)
    top_rows = (
        db.query(models.User, func.avg(models.AiEvaluation.overall_score).label("avg_score"), func.count(models.Submission.id).label("cnt"))
        .join(models.Submission, models.Submission.user_id == models.User.id)
        .join(models.AiEvaluation, models.AiEvaluation.submission_id == models.Submission.id)
        .filter(models.User.role == 'student')
        .group_by(models.User.id)
        .order_by(func.avg(models.AiEvaluation.overall_score).desc())
        .limit(5)
        .all()
    )
    top_performers = [
        {"name": u.full_name, "score": round(float(sc), 1), "submissions": cnt}
        for u, sc, cnt in top_rows if sc
    ]

    return {
        "total_users":          total_users,
        "period_submissions":   period_subs,
        "avg_band":             round(avg_band, 1),
        "completion_rate":      completion_rate,
        "users_trend":          new_users,
        "submissions_trend":    period_subs - prev_subs,
        "submissions_timeline": timeline,
        "score_distribution":   dist,
        "top_performers":       top_performers,
        "evaluation_stats": {
            "ai_only":           ai_only,
            "reviewed":          reviewed,
            "pending_processing": pending_proc,
        }
    }


# ── GET /admin/activity ──────────────────────────────────────────────
@router.get("/activity")
def get_activity(
    limit: int = 20,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    """Return recent submission and review activity."""
    activities = []

    # Recent submissions
    recent_subs = (
        db.query(models.Submission, models.User, models.Question)
        .join(models.User,     models.User.id     == models.Submission.user_id)
        .join(models.Question, models.Question.id == models.Submission.question_id)
        .order_by(models.Submission.submitted_at.desc())
        .limit(10)
        .all()
    )
    for sub, user, q in recent_subs:
        part = q.part.replace('part', 'Part ') if q.part else ''
        activities.append({
            "type": "blue",
            "text": f"<strong>{user.full_name}</strong> submitted a new recording ({part})",
            "time": sub.submitted_at.isoformat(),
        })

    # Recent reviews
    recent_reviews = (
        db.query(models.TeacherReview, models.User, models.Submission)
        .join(models.User,       models.User.id       == models.TeacherReview.teacher_id)
        .join(models.Submission, models.Submission.id == models.TeacherReview.submission_id)
        .order_by(models.TeacherReview.reviewed_at.desc())
        .limit(10)
        .all()
    )
    for review, teacher, sub in recent_reviews:
        student = db.query(models.User).filter(models.User.id == sub.user_id).first()
        activities.append({
            "type": "green",
            "text": f"<strong>{teacher.full_name}</strong> completed a review for <strong>{student.full_name if student else 'a student'}</strong>",
            "time": review.reviewed_at.isoformat(),
        })

    # Recent registrations (pending)
    recent_reg = (
        db.query(models.User)
        .filter(models.User.is_approved == False)
        .order_by(models.User.created_at.desc())
        .limit(5)
        .all()
    )
    for u in recent_reg:
        activities.append({
            "type": "orange",
            "text": f"New {u.role} account registered: <strong>{u.full_name}</strong> — awaiting approval",
            "time": u.created_at.isoformat(),
        })

    # Sort by time desc, limit
    activities.sort(key=lambda x: x["time"], reverse=True)
    return activities[:limit]
