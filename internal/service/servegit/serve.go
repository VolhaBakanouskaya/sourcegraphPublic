package servegit

import (
	"context"
	"encoding/json"
	"fmt"
	"html/template"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	pathpkg "path"
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"
	"syscall"
	"time"

	"golang.org/x/exp/slices"

	"github.com/sourcegraph/log"
	"github.com/sourcegraph/sourcegraph/internal/fastwalk"
	"github.com/sourcegraph/sourcegraph/lib/errors"
	"github.com/sourcegraph/sourcegraph/lib/gitservice"
)

type Serve struct {
	Addr   string
	Root   string
	Logger log.Logger
}

func (s *Serve) Start() error {
	ln, err := net.Listen("tcp", s.Addr)
	if err != nil {
		return errors.Wrap(err, "listen")
	}

	// Update Addr to what listener actually used.
	s.Addr = ln.Addr().String()

	s.Logger.Info("serving git repositories", log.String("url", "http://"+s.Addr), log.String("root", s.Root))

	srv := &http.Server{Handler: s.handler()}

	// We have opened the listener, now start serving connections in the
	// background.
	go func() {
		if err := srv.Serve(ln); err == http.ErrServerClosed {
			s.Logger.Info("http serve closed")
		} else {
			s.Logger.Error("http serve failed", log.Error(err))
		}
	}()

	// Also listen for shutdown signals in the background. We don't need
	// graceful shutdown since this only runs in app and the only clients of
	// the server will also be shutdown at the same time.
	go func() {
		c := make(chan os.Signal, 1)
		signal.Notify(c, syscall.SIGINT, syscall.SIGHUP, syscall.SIGTERM)
		<-c
		if err := srv.Close(); err != nil {
			s.Logger.Error("failed to Close http serve", log.Error(err))
		}
	}()

	return nil
}

var indexHTML = template.Must(template.New("").Parse(`<html>
<head><title>src serve-git</title></head>
<body>
<h2>src serve-git</h2>
<pre>
{{.Explain}}
<ul>{{range .Links}}
<li><a href="{{.}}">{{.}}</a></li>
{{- end}}
</ul>
</pre>
</body>
</html>`))

type Repo struct {
	Name      string
	URI       string
	ClonePath string
}

func (s *Serve) handler() http.Handler {
	mux := &http.ServeMux{}

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		err := indexHTML.Execute(w, map[string]interface{}{
			"Explain": explainAddr(s.Addr),
			"Links": []string{
				"/v1/list-repos",
				"/repos/",
			},
		})
		if err != nil {
			s.Logger.Debug("failed to return / response", log.Error(err))
		}
	})

	mux.HandleFunc("/v1/list-repos", func(w http.ResponseWriter, r *http.Request) {
		repos, err := s.Repos()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		resp := struct {
			Items []Repo
		}{
			Items: repos,
		}

		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		enc := json.NewEncoder(w)
		enc.SetIndent("", "  ")
		_ = enc.Encode(&resp)
	})

	fs := http.FileServer(http.Dir(s.Root))
	svc := &gitservice.Handler{
		Dir: func(name string) string {
			return filepath.Join(s.Root, filepath.FromSlash(name))
		},
		Trace: func(ctx context.Context, svc, repo, protocol string) func(error) {
			start := time.Now()
			return func(err error) {
				s.Logger.Debug("git service", log.String("svc", svc), log.String("protocol", protocol), log.String("repo", repo), log.Duration("duration", time.Since(start)), log.Error(err))
			}
		},
	}
	mux.Handle("/repos/", http.StripPrefix("/repos/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Use git service if git is trying to clone. Otherwise show http.FileServer for convenience
		for _, suffix := range []string{"/info/refs", "/git-upload-pack"} {
			if strings.HasSuffix(r.URL.Path, suffix) {
				svc.ServeHTTP(w, r)
				return
			}
		}
		fs.ServeHTTP(w, r)
	})))

	return http.HandlerFunc(mux.ServeHTTP)
}

// Checks if git thinks the given path is a valid .git folder for a repository
func isBareRepo(path string) bool {
	c := exec.Command("git", "--git-dir", path, "rev-parse", "--is-bare-repository")
	c.Dir = path
	out, err := c.CombinedOutput()

	if err != nil {
		return false
	}

	return string(out) != "false\n"
}

// Check if git thinks the given path is a proper git checkout
func isGitRepo(path string) bool {
	// Executing git rev-parse --git-dir in the root of a worktree returns .git
	c := exec.Command("git", "rev-parse", "--git-dir")
	c.Dir = path
	out, err := c.CombinedOutput()

	if err != nil {
		return false
	}

	return string(out) == ".git\n"
}

// Repos returns a slice of all the git repositories it finds.
func (s *Serve) Repos() ([]Repo, error) {
	root, err := filepath.EvalSymlinks(s.Root)
	if err != nil {
		s.Logger.Warn("ignoring error searching", log.String("path", root), log.Error(err))
		return nil, nil
	}

	root = filepath.Clean(root)

	var (
		repoC           = make(chan Repo, 4) // 4 is the same buffer size used in fastwalk
		reposRootIsRepo bool
		walkErr         error
	)
	go func() {
		defer close(repoC)
		reposRootIsRepo, walkErr = s.Walk(root, repoC)
	}()

	var repos []Repo
	for r := range repoC {
		repos = append(repos, r)
	}

	if walkErr != nil {
		return nil, walkErr
	}

	// walk is not deterministic due to concurrency, so introduce determinism
	// by sorting the results.
	slices.SortFunc(repos, func(a, b Repo) bool {
		return a.Name < b.Name
	})

	if !reposRootIsRepo {
		return repos, nil
	}

	// Update all names to be relative to the parent of reposRoot. This is to
	// give a better name than "." for repos root
	abs, err := filepath.Abs(root)
	if err != nil {
		return nil, errors.Errorf("failed to get the absolute path of reposRoot: %w", err)
	}
	rootName := filepath.Base(abs)
	for i := range repos {
		repos[i].Name = pathpkg.Join(rootName, repos[i].Name)
	}

	return repos, nil
}

// Walk is the core repos finding routine. This is only exported for use in
// app-discover-repos, normally you should use Repos instead which does
// additional work.
func (s *Serve) Walk(root string, repoC chan<- Repo) (bool, error) {
	var reposRootIsRepo atomic.Bool

	ignore := mkIgnoreSubPath(root)

	// We use fastwalk since it is much faster. Notes for people used to
	// filepath.WalkDir:
	//
	//   - func is called concurrently
	//   - you can return fastwalk.ErrSkipFiles to avoid calling func on
	//     files (so will only get dirs)
	//   - filepath.SkipDir has the same meaning
	err := fastwalk.Walk(root, func(path string, typ os.FileMode) error {
		if !typ.IsDir() {
			return fastwalk.ErrSkipFiles
		}

		subpath, err := filepath.Rel(root, path)
		if err != nil {
			// According to WalkFunc docs, path is always filepath.Join(root,
			// subpath). So Rel should always work.
			return errors.Wrapf(err, "filepath.Walk returned %s which is not relative to %s", path, root)
		}

		if ignore(subpath) {
			s.Logger.Debug("ignoring path", log.String("path", path))
			return filepath.SkipDir
		}

		// Check whether a particular directory is a repository or not.
		//
		// Valid paths are either bare repositories or git worktrees.
		isBare := isBareRepo(path)
		isGit := isGitRepo(path)

		if !isGit && !isBare {
			s.Logger.Debug("not a repository root", log.String("path", path))
			return fastwalk.ErrSkipFiles
		}

		name := filepath.ToSlash(subpath)
		if name == "." {
			reposRootIsRepo.Store(true)
		}

		cloneURI := pathpkg.Join("/repos", name)
		clonePath := cloneURI

		// Regular git repos won't clone without the full path to the .git directory.
		if isGit {
			clonePath += "/.git"
		}

		repoC <- Repo{
			Name:      name,
			URI:       cloneURI,
			ClonePath: clonePath,
		}

		// At this point we know the directory is either a git repo or a bare git repo,
		// we don't need to recurse further to save time.
		// TODO: Look into whether it is useful to support git submodules
		return filepath.SkipDir
	})

	return reposRootIsRepo.Load(), err
}

// mkIgnoreSubPath which acts on subpaths to root. It returns true if the
// subpath should be ignored.
func mkIgnoreSubPath(root string) func(string) bool {
	// A list of dirs which cause us trouble and are unlikely to contain
	// repos.
	ignoredSubPaths := ignoredPaths(root)

	// Heuristics on dirs which probably don't have useful source.
	ignoredSuffix := []string{
		// no point going into go mod dir.
		"/pkg/mod",

		// Source code should not be here.
		"/bin",

		// Downloaded code so ignore repos in it since it can be large.
		"/node_modules",
	}

	return func(subpath string) bool {
		// Previously we recursed into bare repositories which is why this check was here.
		// Now we use this as a sanity check to make sure we didn't somehow stumble into a .git dir.
		base := filepath.Base(subpath)
		if base == ".git" {
			return true
		}

		// skip hidden dirs
		if strings.HasPrefix(base, ".") && base != "." {
			return true
		}

		if slices.Contains(ignoredSubPaths, subpath) {
			return true
		}

		for _, suffix := range ignoredSuffix {
			if strings.HasSuffix(subpath, suffix) {
				return true
			}
		}

		return false
	}
}

// ignoredPaths returns paths relative to root which should be ignored.
//
// In particular this function returns the locations on Mac which trigger
// permission dialogs. If a user wanted to explore those directories they need
// to ensure root is the directory.
func ignoredPaths(root string) []string {
	if runtime.GOOS != "darwin" {
		return nil
	}

	// For simplicity we only trigger this code path if root is a homedir,
	// which is the most common mistake made. Note: Mac can be case
	// insensitive on the FS.
	if !strings.EqualFold("/Users", filepath.Dir(filepath.Clean(root))) {
		return nil
	}

	// Hard to find an actual list. This is based on error messages mentioned
	// in the Entitlement documentation followed by trial and error.
	// https://developer.apple.com/documentation/bundleresources/information_property_list/nsdocumentsfolderusagedescription
	return []string{
		"Applications",
		"Desktop",
		"Documents",
		"Downloads",
		"Library",
		"Movies",
		"Music",
		"Pictures",
		"Public",
	}
}

func explainAddr(addr string) string {
	return fmt.Sprintf(`Serving the repositories at http://%s.

See https://docs.sourcegraph.com/admin/external_service/src_serve_git for
instructions to configure in Sourcegraph.
`, addr)
}