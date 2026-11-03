# Build on the runner's own platform and let Go cross-compile: building the
# arm64 image under QEMU emulation took up to 14 min per backend.
FROM --platform=$BUILDPLATFORM golang:1.27.3-alpine AS builder
ARG TARGETOS TARGETARCH
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -o /metrics-backend ./cmd/

FROM alpine:3.24.3
RUN apk --no-cache add ca-certificates
COPY --from=builder /metrics-backend /usr/local/bin/metrics-backend
USER 65534:65534
ENTRYPOINT ["metrics-backend"]
