# this should be sufficient to test everything on the machine
.PHONY: integration-test
integration-test:
	earthly -i --allow-privileged +integration-test

.PHONY: push
push:
	earthly --push +multi-build --IMAGE_NAME=$(IMAGE_NAME)

.PHONY: diff
diff:
	earthly -i --allow-privileged +diff

.PHONY: deploy
.ONESHELL:
deploy:
	@export EARTHLY_BUILD_ARGS="ROLLBAR_TOKEN=$(ROLLBAR_TOKEN)"
	earthly -i --allow-privileged +deploy

.PHONY: deploy-via-registry
.ONESHELL:
deploy-via-registry: push
	@export EARTHLY_BUILD_ARGS="ROLLBAR_TOKEN=$(ROLLBAR_TOKEN),IMAGE_NAME=$(IMAGE_NAME)"
	earthly -i --allow-privileged +deploy

.PHONY: destroy
destroy:
	earthly --allow-privileged +destroy

.PHONY: clean-deploy
clean-deploy: destroy deploy

## everything below here are helper commands for debugging

.PHONY: install-requirement-on-local
install-requirement-on-local:
	pip install -r requirements.txt

.PHONY: cdk
cdk:
	earthly -i +cdk

.PHONY: dev
dev:
	earthly -i +dev

.PHONY: debug-gen-docker-files
debug-gen-docker-files:
	earthly -i +eb-container-def
