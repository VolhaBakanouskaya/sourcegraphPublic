package lsifstore

import (
	"context"
	"testing"

	"github.com/google/go-cmp/cmp"
	"github.com/keegancsmith/sqlf"
	"github.com/sourcegraph/log"
	"github.com/sourcegraph/log/logtest"

	codeintelshared "github.com/sourcegraph/sourcegraph/internal/codeintel/shared"
	"github.com/sourcegraph/sourcegraph/internal/database/basestore"
	"github.com/sourcegraph/sourcegraph/internal/database/dbtest"
	"github.com/sourcegraph/sourcegraph/internal/observation"
)

func TestDeleteLsifDataByUploadIds(t *testing.T) {
	logger := logtest.ScopedWith(t, logtest.LoggerOptions{
		Level: log.LevelError,
	})
	codeIntelDB := codeintelshared.NewCodeIntelDB(dbtest.NewDB(logger, t))
	store := New(codeIntelDB, &observation.TestContext)

	for i := 0; i < 5; i++ {
		query := sqlf.Sprintf("INSERT INTO lsif_data_metadata (dump_id, num_result_chunks) VALUES (%s, 0)", i+1)

		if _, err := codeIntelDB.ExecContext(context.Background(), query.Query(sqlf.PostgresBindVar), query.Args()...); err != nil {
			t.Fatalf("unexpected error inserting repo: %s", err)
		}
	}

	if err := store.DeleteLsifDataByUploadIds(context.Background(), 2, 4); err != nil {
		t.Fatalf("unexpected error clearing bundle data: %s", err)
	}

	dumpIDs, err := basestore.ScanInts(codeIntelDB.QueryContext(context.Background(), "SELECT dump_id FROM lsif_data_metadata"))
	if err != nil {
		t.Fatalf("Unexpected error querying dump identifiers: %s", err)
	}

	if diff := cmp.Diff([]int{1, 3, 5}, dumpIDs); diff != "" {
		t.Errorf("unexpected dump identifiers (-want +got):\n%s", diff)
	}
}