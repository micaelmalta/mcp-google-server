.PHONY: build clean dev test test-watch test-coverage lint lint-fix docker-build docker-run helm-lint

MCP_DOTENV ?= ./.env

# Optionally include env file if it exists (no error if missing)
ifneq (,$(MCP_DOTENV))
ifneq ("$(wildcard $(MCP_DOTENV))","")
$(info Exporting environment variables from '$(MCP_DOTENV)')
    -include $(MCP_DOTENV)
    export
endif
endif

APPNAME=mcp-google-server
BUILD_TIME := $(shell date -Iseconds 2>/dev/null || date +%Y-%m-%dT%H:%M:%SZ)
VERSION := "$(shell git describe --exact-match --tags 2> /dev/null)"
COMMIT_SHA="$(shell git rev-parse --short HEAD)"

ECR_REPO ?= 974932714082.dkr.ecr.us-east-1.amazonaws.com/$(APPNAME)

HELM_LOCATIONS = helm/service
HELM_ENVS = dev staging prod


# Build

build:
	npm run build

clean:
	npm run clean

dev:
	npm run dev


# Testing

test:
	npm run test

test-watch:
	npm run test:watch

test-coverage:
	npm run test:coverage


# Linting

lint:
	npm run lint

lint-fix:
	npm run lint:fix


# Docker

docker-build:
	@DOCKER_BUILDKIT=1 docker build \
		--build-arg BUILD_TIME="$(BUILD_TIME)" \
		--build-arg COMMIT_SHA="$(COMMIT_SHA)" \
		--build-arg VERSION="$(VERSION)" \
		. -t $(ECR_REPO)

docker-run: docker-build
	@docker run --rm -it \
		--env-file $(MCP_DOTENV) \
		-p 3000:3000 $(ECR_REPO)


# Helm

helm-lint:
	@set -e; \
	for chart in $(HELM_LOCATIONS); do \
		helm dependency update "$$chart"; \
		for env in $(HELM_ENVS); do \
			echo "Linting $$chart for $$env environment"; \
			helm template "$$chart" -f "$$chart/values.$$env.yaml" | kubeconform \
				-summary \
				-strict \
				-schema-location default \
				-schema-location https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json; \
		done; \
	done
