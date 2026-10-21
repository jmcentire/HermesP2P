FROM python:3.11-slim@sha256:0a236bf8f0b6013383df04d1cd02cb0abe5fbfa1a7012141d7ff9202b7cb30a6

WORKDIR /app

COPY requirements-runtime.txt .
RUN pip install --no-cache-dir -r requirements-runtime.txt

COPY main.py .
COPY static ./static
COPY templates ./templates
COPY public ./public
ARG HP2P_RELEASE=development
ENV HP2P_RELEASE=$HP2P_RELEASE

EXPOSE 8080

CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "1", "--threads", "128", "--timeout", "0", "main:app"]
