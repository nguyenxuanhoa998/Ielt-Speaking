import whisper

# Load the local Whisper model (we use 'base' for a good balance of speed and accuracy during development)
# This module prevents circular imports.
whisper_model = whisper.load_model("base")
