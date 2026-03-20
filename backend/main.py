from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from database import engine, Base, get_db
import models

# Create database tables if they don't exist
models.Base.metadata.create_all(bind=engine)

app = FastAPI()

@app.get("/")
def root():
    return {"message": "Backend OK, database connected!"}

@app.get("/users/")
def read_users(db: Session = Depends(get_db)):
    # This is an example of querying the database
    users = db.query(models.User).all()
    return users