package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"time"

	"github.com/kelseyhightower/envconfig"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"

	"github.com/natrontech/argoplane/extensions/networking/backend/internal/handler"
	"github.com/natrontech/argoplane/extensions/networking/backend/internal/hubble"
)

type Config struct {
	Port                   string        `envconfig:"PORT" default:"8082"`
	LogLevel               string        `envconfig:"LOG_LEVEL" default:"info"`
	HubbleRelayURL         string        `envconfig:"HUBBLE_RELAY_URL" default:""`
	FlowBufferRetention    time.Duration `envconfig:"FLOW_BUFFER_RETENTION" default:"15m"`
	FlowBufferMaxPerNs     int           `envconfig:"FLOW_BUFFER_MAX_PER_NS" default:"5000"`
}

func main() {
	var config Config
	if err := envconfig.Process("", &config); err != nil {
		slog.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	setupLogging(config.LogLevel)

	kubeConfig, err := rest.InClusterConfig()
	if err != nil {
		slog.Error("failed to create in-cluster config", "error", err)
		os.Exit(1)
	}

	dynClient, err := dynamic.NewForConfig(kubeConfig)
	if err != nil {
		slog.Error("failed to create dynamic client", "error", err)
		os.Exit(1)
	}

	// Initialize Hubble Relay client (optional).
	var hubbleClient *hubble.Client
	if config.HubbleRelayURL != "" {
		hc, err := hubble.NewClient(config.HubbleRelayURL)
		if err != nil {
			slog.Warn("failed to create hubble client, flows will be unavailable", "error", err, "url", config.HubbleRelayURL)
		} else {
			hubbleClient = hc
			defer hubbleClient.Close()
			slog.Info("hubble relay connected", "url", config.HubbleRelayURL)
		}
	} else {
		slog.Info("hubble relay not configured, flows endpoint will return empty results")
	}

	// Create flow buffer to accumulate flows across requests.
	var flowBuffer *hubble.FlowBuffer
	if hubbleClient != nil {
		flowBuffer = hubble.NewFlowBuffer(hubbleClient, config.FlowBufferRetention, config.FlowBufferMaxPerNs)
		slog.Info("flow buffer initialized", "retention", config.FlowBufferRetention, "maxPerNs", config.FlowBufferMaxPerNs)
	}

	// Create handlers.
	policiesHandler := handler.NewPoliciesHandler(dynClient)
	endpointsHandler := handler.NewEndpointsHandler(dynClient)
	identitiesHandler := handler.NewIdentitiesHandler(dynClient)
	flowsHandler := handler.NewFlowsHandler(flowBuffer)
	serviceMapHandler := handler.NewServiceMapHandler(flowBuffer, dynClient)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/policies", policiesHandler.HandleNamespaced)
	mux.HandleFunc("GET /api/v1/clusterwide-policies", policiesHandler.HandleClusterwide)
	mux.HandleFunc("POST /api/v1/policies-with-ownership", policiesHandler.HandleWithOwnership)
	mux.HandleFunc("GET /api/v1/endpoints", endpointsHandler.Handle)
	mux.HandleFunc("GET /api/v1/identities", identitiesHandler.Handle)
	mux.HandleFunc("GET /api/v1/flows", flowsHandler.Handle)
	mux.HandleFunc("GET /api/v1/service-map", serviceMapHandler.Handle)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	server := &http.Server{
		Addr:         fmt.Sprintf(":%s", config.Port),
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt)
	defer cancel()

	go func() {
		slog.Info("starting networking backend", "port", config.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	slog.Info("shutting down")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		slog.Error("shutdown error", "error", err)
	}
}

func setupLogging(level string) {
	var logLevel slog.Level
	switch level {
	case "debug":
		logLevel = slog.LevelDebug
	case "warn":
		logLevel = slog.LevelWarn
	case "error":
		logLevel = slog.LevelError
	default:
		logLevel = slog.LevelInfo
	}
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: logLevel})))
}
