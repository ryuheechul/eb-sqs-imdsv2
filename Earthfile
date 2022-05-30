VERSION 0.6
FROM python:3.7.13-alpine3.16
WORKDIR /celery-imdsv2

common:
  RUN apk add --no-cache gcc musl-dev curl-dev
  COPY requirements.txt .
  RUN pip install -r requirements.txt

dev:
  FROM +common
  COPY tasks.py server.py ./

push:
  FROM +dev
  ARG IMAGE_NAME

  SAVE IMAGE --push $IMAGE_NAME:latest

# use this (via CLI) instead of +push above in order to push multi-platform image
multi-build:
  # `linux/arm/v7` would not work with AWS graviton processors as it will look for arm/v8 and error
  BUILD --platform=linux/arm64 --platform=linux/amd64 +push

tester:
  # use deno to test http endpoints since deno image comes with everything that I need to test
  # https://deno.land/manual/testing
  FROM denoland/deno:1.22.0
  ENV FULL_URL_TO_TEST=http://localhost:5000

  COPY deps.ts .
  # https://medium.com/deno-the-complete-reference/running-deno-in-docker-35756ffff66d
  RUN deno cache deps.ts
  COPY test.ts .
  ENTRYPOINT ["deno"]
  CMD ["test", "--allow-env", "--allow-net", "test.ts"]

integration-test:
  FROM earthly/dind:alpine
  WORKDIR int-test

  ARG IMAGE_NAME=handler:latest

  COPY gen-docker-compose-earthly-yml.sh .
  RUN ./gen-docker-compose-earthly-yml.sh

  WITH DOCKER --compose docker-compose.earthly.yml \
    --load $IMAGE_NAME=+dev --load tester:latest=+tester
    RUN sleep 1 && docker run --network=host tester
  END

cdk:
  FROM node:16-bullseye-slim
  WORKDIR /opt/app

  RUN npm i -g aws-cdk

  ENTRYPOINT ["cdk"]

package-docker-for-eb:
  FROM alpine:3.16
  ARG IMAGE_NAME
  ARG ROLLBAR_TOKEN

  WORKDIR /for-source-bundle

  RUN apk add --no-cache zip

  # these files need to be in this build container for them to be zipped together as well as files getting written below
  COPY tasks.py server.py requirements.txt ./

  # delete them only if not building it on demand
  RUN test -n "${IMAGE_NAME}" && rm tasks.py server.py requirements.txt || true

  COPY gen-docker-files.sh .
  RUN ./gen-docker-files.sh \
    && rm ./gen-docker-files.sh \
    && zip -r docker-bundle.zip .

  SAVE ARTIFACT docker-bundle.zip docker-bundle.zip

# to debug zipping from +package-docker-for-eb
debug-zip:
  LOCALLY
  COPY --dir +package-docker-for-eb/docker-bundle.zip ./source-bundle/

# inspired by https://github.com/earthly/earthly/issues/1221#issuecomment-925390672
hack-aws-config:
  LOCALLY
  RUN mkdir -p ./.hack-tmp
  RUN cp -r ~/.aws ./.hack-tmp/aws
  SAVE ARTIFACT ./.hack-tmp/aws aws
  RUN rm -rf ./.hack-tmp

npm-cache:
  FROM node:16-bullseye-slim
  WORKDIR /build-node-modules

  COPY cdk/eb-sqs-imdsv2/package.json cdk/eb-sqs-imdsv2/package-lock.json ./

  RUN npm install

  SAVE ARTIFACT node_modules node_modules

deploy-prep:
  FROM earthly/dind:alpine
  WORKDIR /workdir

  COPY --dir +hack-aws-config/aws /root/.aws
  COPY --dir +package-docker-for-eb/docker-bundle.zip ./source-bundle/
  COPY docker-compose.cdk.yml .
  COPY --dir cdk ./
  COPY --dir +npm-cache/node_modules ./cdk/eb-sqs-imdsv2/

deploy-prep-w-identity:
  FROM +deploy-prep

  # currently amazon/aws-cli is only being used for printing to show which identity is being used
  WITH DOCKER --pull amazon/aws-cli:2.7.2
    RUN --no-cache \
      docker-compose -f docker-compose.cdk.yml run --rm aws sts get-caller-identity
  END

diff:
  FROM +deploy-prep-w-identity

  WITH DOCKER --load earthly_cdk:latest=+cdk
    RUN --no-cache \
      docker-compose -f docker-compose.cdk.yml run --rm cdk diff
  END

deploy:
  FROM +deploy-prep-w-identity

  WITH DOCKER --load earthly_cdk:latest=+cdk
    RUN docker-compose -f docker-compose.cdk.yml run --entrypoint npm --rm cdk -- install
  END

  WITH DOCKER --load earthly_cdk:latest=+cdk
    RUN --no-cache \
      docker-compose -f docker-compose.cdk.yml run --rm \
      cdk deploy --require-approval=never --outputs-file=../outputs.json
  END

  RUN cat cdk/outputs.json | jq -r '"http://"+.[].endpointUrl' > endpoint-url.txt

  # run tests against the deployed EB
  WITH DOCKER --load tester:latest=+tester
    RUN --no-cache docker run --network=host -e FULL_URL_TO_TEST=$(cat endpoint-url.txt) tester
  END

destroy:
  FROM +deploy-prep-w-identity

  WITH DOCKER --load earthly_cdk:latest=+cdk
    RUN --no-cache \
      docker-compose -f docker-compose.cdk.yml run --rm cdk destroy --force
  END
