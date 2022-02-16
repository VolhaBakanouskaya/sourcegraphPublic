package job

import "testing"

func TestMembership(t *testing.T) {
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("Please add a case statement for your job (%v)", r)
		}
	}()

	for _, j := range allJobs {
		Sexp(j)
		PrettyMermaid(j)
		PrettyJSON(j)
	}
}
