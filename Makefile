# this should be sufficient to test everything on the machine
.PHONY: integration-test
integration-test:
	earthly --allow-privileged +integration-test

# everything below here are helper commands for debugging

.PHONY: install-requirement-on-local
install-requirement-on-local:
	pip install -r requirements.txt

.PHONY: dev
dev:
	earthly -i +dev

.PHONY: up
up:
	docker-compose up
