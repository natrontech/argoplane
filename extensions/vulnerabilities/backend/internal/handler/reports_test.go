package handler

import (
	"context"
	"errors"
	"strconv"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

// pager serves total items in pages of opts.Limit, using the item offset as
// the Continue token.
func pager(total int, calls *int) listFunc {
	return func(_ context.Context, opts metav1.ListOptions) (*unstructured.UnstructuredList, error) {
		*calls++
		start, _ := strconv.Atoi(opts.Continue)
		end := min(start+int(opts.Limit), total)
		page := &unstructured.UnstructuredList{}
		for i := start; i < end; i++ {
			page.Items = append(page.Items, unstructured.Unstructured{})
		}
		if end < total {
			page.SetContinue(strconv.Itoa(end))
		}
		return page, nil
	}
}

func TestEachReportPages(t *testing.T) {
	var calls int
	var truncated bool
	n := 0
	for _, err := range eachReport(context.Background(), pager(250, &calls), metav1.ListOptions{}, &truncated) {
		if err != nil {
			t.Fatal(err)
		}
		n++
	}
	if n != 250 || truncated || calls != 3 {
		t.Errorf("got %d items in %d calls (truncated=%v), want 250 in 3", n, calls, truncated)
	}
}

func TestEachReportCaps(t *testing.T) {
	var calls int
	var truncated bool
	n := 0
	for range eachReport(context.Background(), pager(maxReports+1, &calls), metav1.ListOptions{}, &truncated) {
		n++
	}
	if n != maxReports || !truncated {
		t.Errorf("got %d items, truncated=%v; want %d and true", n, truncated, maxReports)
	}

	// Exactly maxReports is complete, not truncated.
	truncated = false
	for range eachReport(context.Background(), pager(maxReports, &calls), metav1.ListOptions{}, &truncated) {
	}
	if truncated {
		t.Error("exactly maxReports reported as truncated")
	}
}

func TestEachReportError(t *testing.T) {
	failing := func(context.Context, metav1.ListOptions) (*unstructured.UnstructuredList, error) {
		return nil, errors.New("api down")
	}
	var truncated bool
	errs := 0
	for _, err := range eachReport(context.Background(), failing, metav1.ListOptions{}, &truncated) {
		if err != nil {
			errs++
		}
	}
	if errs != 1 {
		t.Errorf("got %d errors, want exactly one", errs)
	}
}
