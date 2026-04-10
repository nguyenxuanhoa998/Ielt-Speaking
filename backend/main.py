from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

import models
from auth import router as auth_router
from database import engine
from database import get_db

load_dotenv()

# Create database tables if they don't exist
models.Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])

from submissions import router as submissions_router

app.include_router(submissions_router, prefix="/api/v1", tags=["submissions"])

import os

os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
app.mount("/static", StaticFiles(directory="../frontend/static"), name="static")


@app.get("/")
def root():
    return FileResponse("../frontend/login.html")


@app.get("/{page_name}.html")
def get_html_page(page_name: str):
    file_path = os.path.join("../frontend", f"{page_name}.html")
    if os.path.exists(file_path):
        return FileResponse(file_path)
    return {"error": f"Không tìm thấy trang {page_name}.html"}


@app.get("/api/v1/submissions/{id}")
async def get_submission(id: int, db: Session = Depends(get_db)):
    # Bạn PHẢI có hàm này thì result.js mới lấy được dữ liệu để hiện trang
    submission = db.query(models.Submission).filter(models.Submission.id == id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Không thấy bài nộp")
    return submission


if __name__ == "__main__":
    import uvicorn

    # "main:app" có nghĩa là: file tên main.py, biến tên app
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
