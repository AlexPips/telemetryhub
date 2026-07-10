.PHONY: docker-build docker-up docker-down \
        build test build-server build-simulator \
        migrate-up migrate-down migrate-create migrate-status

# ─── Docker commands ───────────────────────────────────────────────────────────

docker-build:
	docker compose build

docker-up:
	docker compose up -d

docker-down:
	docker compose down -v

# ─── Forwarding targets (delegate to backend/) ─────────────────────────────────

build test build-server build-simulator \
migrate-up migrate-down migrate-create migrate-status \
swagger lint test-worker test-server:
	$(MAKE) -C backend $@
