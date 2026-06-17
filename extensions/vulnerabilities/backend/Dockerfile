FROM golang:1.26.4-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /vulnerabilities-backend ./cmd/

FROM alpine:3.24.1
RUN apk --no-cache add ca-certificates
COPY --from=builder /vulnerabilities-backend /usr/local/bin/vulnerabilities-backend
USER 65534:65534
ENTRYPOINT ["vulnerabilities-backend"]
