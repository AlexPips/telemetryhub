# API Server Dockerfile
FROM golang:1.26-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o api-server ./cmd/api-server/

FROM alpine:3.21
RUN apk --no-cache add ca-certificates tzdata
COPY --from=builder /app/api-server /usr/local/bin/
COPY migrations/ /app/migrations/
WORKDIR /app
EXPOSE 8080
USER nobody
ENTRYPOINT ["api-server"]
