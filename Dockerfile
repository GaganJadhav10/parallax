# Parallax API server — multi-stage build.
#
# The SQLite driver is modernc.org/sqlite (pure Go), so CGO stays off and the
# result is a single static binary that runs on a scratch-like base image.

FROM golang:1.26-alpine AS build

WORKDIR /src

# Dependencies first so edits to the source do not invalidate the module cache.
COPY go.mod go.sum ./
RUN go mod download

COPY . .

ARG VERSION=docker
RUN CGO_ENABLED=0 GOOS=linux go build \
    -trimpath \
    -ldflags="-s -w -X github.com/GaganJadhav10/parallax/internal/buildinfo.Version=${VERSION}" \
    -o /out/parallax .

# distroless has no shell, so the writable data directory is staged here.
RUN mkdir -p /out/data

# ---------------------------------------------------------------------------

FROM gcr.io/distroless/static-debian12:nonroot

# Certificate Transparency logs and every other provider are queried over HTTPS,
# so the image needs a CA bundle — distroless/static ships one.
COPY --from=build /out/parallax /usr/local/bin/parallax

# Writable location for the SQLite database. Mount a volume here to keep scan
# history across restarts; without one the data is lost when the container dies.
COPY --from=build --chown=nonroot:nonroot /out/data /data
WORKDIR /data
ENV PARALLAX_DB=/data/parallax.db \
    PARALLAX_HOST=0.0.0.0 \
    PARALLAX_PORT=8080

EXPOSE 8080
USER nonroot:nonroot

ENTRYPOINT ["/usr/local/bin/parallax"]
CMD ["serve"]
