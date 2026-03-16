FROM golang:1.26-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /logs-backend ./cmd/

FROM alpine:3.23
RUN apk --no-cache add ca-certificates
COPY --from=builder /logs-backend /usr/local/bin/logs-backend
USER 65534:65534
ENTRYPOINT ["logs-backend"]
