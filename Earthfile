VERSION 0.6
FROM python:3.7-alpine
WORKDIR /celery-imdsv2

common:
  RUN apk update
  RUN apk add gcc musl-dev curl-dev
  COPY requirements.txt .
  RUN pip install -r requirements.txt

dev:
  FROM +common
  COPY tasks.py server.py .
  SAVE IMAGE celery-imdsv2-dev

tester:
  FROM denoland/deno:1.22.0
  ENV FULL_URL_TO_TEST http://localhost:8000
  COPY deps.ts .
  # https://medium.com/deno-the-complete-reference/running-deno-in-docker-35756ffff66d
  RUN deno cache deps.ts
  COPY test.ts .
  ENTRYPOINT ["deno"]
  CMD ["test", "--fail-fast", "--allow-env", "--allow-net", "test.ts"]

integration-test:
  FROM earthly/dind:alpine
  COPY docker-compose.earthly.yml ./
  WITH DOCKER --compose docker-compose.earthly.yml \
    --load=+dev --load tester:latest=+tester
    RUN sleep 1 && docker run --network=host tester
  END
