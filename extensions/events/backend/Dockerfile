FROM golang:1.26-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /events-backend ./cmd/

FROM alpine:3.23
RUN apk --no-cache add ca-certificates
COPY --from=builder /events-backend /usr/local/bin/events-backend
USER 65534:65534
ENTRYPOINT ["events-backend"]
