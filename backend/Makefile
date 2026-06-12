.PHONY: migrate-up migrate-down migrate-create migrate-status \
        build build-server build-simulator \
        test test-worker test-server \
        swagger lint

DATABASE_URL ?= postgres://cardimed:password@localhost:5432/cardimed?sslmode=disable

# Migration commands
migrate-up:
	goose -dir migrations postgres "$(DATABASE_URL)" up

migrate-down:
	goose -dir migrations postgres "$(DATABASE_URL)" down

migrate-create:
	goose -dir migrations create $(name) sql

migrate-status:
	goose -dir migrations postgres "$(DATABASE_URL)" status

# Swagger docs generation
swagger:
	swag init -g cmd/api-server/main.go --parseDependency --parseInternal --output docs

# Build commands
build: swagger build-server build-simulator

build-server:
	CGO_ENABLED=0 go build -o bin/api-server ./cmd/api-server/

build-simulator:
	CGO_ENABLED=0 go build -o bin/mqtt-simulator ./cmd/mqtt-simulator/

# Test commands
test:
	go test ./... -v -race -coverprofile=coverage.out

test-worker:
	go test ./internal/mqtt/ ./internal/store/ -v -race

test-server:
	go test ./internal/auth/ ./internal/handlers/ -v -race

# Lint
lint:
	golangci-lint run ./...
