from src.utils.ml_models import whisper_model


def transcribe_audio(filepath: str) -> str:
    result = whisper_model.transcribe(filepath, fp16=False)
    return result["text"]
