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

	"github.com/natrontech/argoplane/extensions/backups/backend/internal/handler"
)

type Config struct {
	Port            string `envconfig:"PORT" default:"8081"`
	LogLevel        string `envconfig:"LOG_LEVEL" default:"info"`
	VeleroNamespace string `envconfig:"VELERO_NAMESPACE" default:"velero"`
	CACertPath      string `envconfig:"CA_CERT_PATH"`
	InsecureTLS     bool   `envconfig:"INSECURE_TLS" default:"false"`
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

	// Create handlers.
	storageHandler := handler.NewStorageHandler(dynClient, config.VeleroNamespace)
	schedulesHandler := handler.NewSchedulesHandler(dynClient, config.VeleroNamespace)
	backupsHandler := handler.NewBackupsHandler(dynClient, config.VeleroNamespace)
	restoresHandler := handler.NewRestoresHandler(dynClient, config.VeleroNamespace)
	overviewHandler := handler.NewOverviewHandler(dynClient, config.VeleroNamespace)
	logsHandler := handler.NewLogsHandler(dynClient, config.VeleroNamespace, &handler.TLSConfig{
		CACertPath:  config.CACertPath,
		InsecureTLS: config.InsecureTLS,
	})
	volumesHandler := handler.NewVolumesHandler(dynClient, config.VeleroNamespace)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/storage-locations", storageHandler.Handle)
	mux.HandleFunc("GET /api/v1/schedules", schedulesHandler.Handle)
	mux.HandleFunc("PATCH /api/v1/schedules/{name}", schedulesHandler.HandleTogglePause)
	mux.HandleFunc("GET /api/v1/backups", backupsHandler.Handle)
	mux.HandleFunc("POST /api/v1/backups", backupsHandler.HandleCreate)
	mux.HandleFunc("DELETE /api/v1/backups/{name}", backupsHandler.HandleDelete)
	mux.HandleFunc("GET /api/v1/restores", restoresHandler.Handle)
	mux.HandleFunc("POST /api/v1/restores", restoresHandler.HandleCreate)
	mux.HandleFunc("POST /api/v1/overview", overviewHandler.Handle)
	mux.HandleFunc("GET /api/v1/logs", logsHandler.Handle)
	mux.HandleFunc("GET /api/v1/pod-volume-backups", volumesHandler.HandleBackups)
	mux.HandleFunc("GET /api/v1/pod-volume-restores", volumesHandler.HandleRestores)
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
		slog.Info("starting backups backend", "port", config.Port, "veleroNamespace", config.VeleroNamespace)
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
