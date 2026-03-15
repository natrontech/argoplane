FROM golang:1.26-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /networking-backend ./cmd/

FROM alpine:3.19
RUN apk --no-cache add ca-certificates
COPY --from=builder /networking-backend /usr/local/bin/networking-backend
USER 65534:65534
ENTRYPOINT ["networking-backend"]
