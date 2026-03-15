FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /backups-backend ./cmd/

FROM alpine:3.19
RUN apk --no-cache add ca-certificates
COPY --from=builder /backups-backend /usr/local/bin/backups-backend
USER 65534:65534
ENTRYPOINT ["backups-backend"]
