FROM python:3.13-slim

WORKDIR /work/task-gate
COPY . /work/task-gate

ENV PYTHONDONTWRITEBYTECODE=1

CMD ["python3", "-B", "scripts/clean_test.py"]
