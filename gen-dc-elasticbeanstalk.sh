# it is to mimic +dev from ./Earthfile
# this is meant to be called inside ./Earthfile to package for Elasticbeanstalk

# also having a seperate file instead embedding this into ./Earthfile via heredoc
# because this, https://github.com/earthly/earthly/issues/582 is not resolved on Earthly yet

curr_time=$(date +%H:%M)

# just retern whatever makes it easy to distinguish between versons of code for debugging
common_env_vars="- TIME_VERSION=w-${curr_time}
    - BROKER_URL=\${BROKER_URL}
    - SQS_QUEUE_URL=\${SQS_QUEUE_URL}
    - REGION=\${REGION}
    - ROLLBAR_TOKEN=${ROLLBAR_TOKEN}
    - RESULT_BACKEND=redis://redis:6379/0"

# because building on demand is possible and that allows us to avoid using registry (one less "external" resource/dependency to manage - good fit for a testing/verifying code like this)
# https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/single-container-docker-configuration.html#:~:text=json%20v3%20file-,Building%20custom%20images%20with%20a%20Dockerfile,-You%20need%20to
image_or_build="build:
      context: ."

test -n "${IMAGE_NAME}" && image_or_build="image: ${IMAGE_NAME}"

cat <<EOF > docker-compose.yml
version: '3'
services:
  # test first with redis until we move on to sqs
  redis:
    image: redis:7.0-alpine3.16
    expose:
    - 6379
  worker:
    ${image_or_build}
    command: celery -A tasks worker --loglevel=info
    environment:
    ${common_env_vars}
    - ROLE_WORKER=1
  server:
    ${image_or_build}
    command: python server.py
    environment:
    ${common_env_vars}
    - ROLE_SERVER=1
    ports:
    - 80:8000
EOF

if test -z "${IMAGE_NAME}"; then
  cat <<EOF > Dockerfile
FROM python:3.7.13-alpine3.16
WORKDIR /celery-imdsv2

RUN apk add --no-cache gcc musl-dev curl-dev

COPY requirements.txt .
RUN pip install -r requirements.txt

# https://stackoverflow.com/a/69877970
COPY tasks.py server.py ./

EOF
fi
