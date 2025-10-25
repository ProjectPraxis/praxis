
# 1. Create a virtual environment and install requirements

python3 -m venv venv
source venv/bin/activate

pip install -r requirements.txt


# 2. Install ffmpeg (for audio decoding)

macOS: brew install ffmpeg

Ubuntu: sudo apt install ffmpeg