BROKER_URL=redis://redis:6379/0
RESULT_BACKEND="${BROKER_URL}"

curr_time=$(date +%H:%M)

cat <<EOF > docker-compose.it.yml
version: '3'
services:
  redis:
    image: redis:7.0-alpine3.16
    expose:
    - 6379
  worker:
    image: ${IMAGE_NAME}
    command: celery -A tasks worker --loglevel=info
    environment:
    - BROKER_URL=${BROKER_URL}
    - RESULT_BACKEND=${RESULT_BACKEND}
    - ROLE_WORKER=1
    - TIME_VERSION=w-${curr_time}
  server:
    image: ${IMAGE_NAME}
    command: python server.py
    environment:
    - BROKER_URL=${BROKER_URL}
    - RESULT_BACKEND=${RESULT_BACKEND}
    - ROLE_SERVER=1
    - TIME_VERSION=w-${curr_time}
    ports:
    - 5000:8000
EOF
