FROM golang:1.26-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /metrics-backend ./cmd/

FROM alpine:3.19
RUN apk --no-cache add ca-certificates
COPY --from=builder /metrics-backend /usr/local/bin/metrics-backend
USER 65534:65534
ENTRYPOINT ["metrics-backend"]
