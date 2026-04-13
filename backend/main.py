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
from admin import router as admin_router

app.include_router(submissions_router, prefix="/api/v1", tags=["submissions"])
app.include_router(admin_router, prefix="/api/v1/admin", tags=["admin"])

import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "../frontend")
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")

os.makedirs(UPLOADS_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
app.mount("/static", StaticFiles(directory=os.path.join(FRONTEND_DIR, "static")), name="static")


@app.get("/")
def root():
    return FileResponse(os.path.join(FRONTEND_DIR, "login.html"))


@app.get("/{page_name}.html")
def get_html_page(page_name: str):
    file_path = os.path.join(FRONTEND_DIR, f"{page_name}.html")
    if os.path.exists(file_path):
        return FileResponse(file_path)
    return {"error": f"Không tìm thấy trang {page_name}.html"}



if __name__ == "__main__":
    import uvicorn

    # "main:app" có nghĩa là: file tên main.py, biến tên app
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
