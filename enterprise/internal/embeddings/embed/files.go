package embed

import (
	"path/filepath"

	"strings"

	"github.com/sourcegraph/sourcegraph/enterprise/internal/paths"
	"github.com/sourcegraph/sourcegraph/internal/byteutils"
)

const MIN_EMBEDDABLE_FILE_SIZE = 32
const MAX_LINE_LENGTH = 2048

var autogeneratedFileHeaders = []string{"autogenerated file", "lockfile", "generated by", "do not edit"}

var textFileExtensions = map[string]struct{}{
	"md":       {},
	"markdown": {},
	"rst":      {},
	"txt":      {},
}

var defaultExcludedFilePathPatterns = []string{
	"*.sql",
	"*.svg",
	"*.json",
	"*.yml",
	"*.yaml",
	"__fixtures__/",
	"node_modules/",
	"testdata/",
	"mocks/",
	"vendor/",
}

func GetDefaultExcludedFilePathPatterns() []*paths.GlobPattern {
	return CompileGlobPatterns(defaultExcludedFilePathPatterns)
}

func CompileGlobPatterns(patterns []string) []*paths.GlobPattern {
	globPatterns := make([]*paths.GlobPattern, 0, len(patterns))
	for _, pattern := range patterns {
		globPattern, err := paths.Compile(pattern)
		if err != nil {
			continue
		}
		globPatterns = append(globPatterns, globPattern)
	}
	return globPatterns
}

func IsExcludedFilePath(filePath string, excludedFilePathPatterns []*paths.GlobPattern) bool {
	for _, excludedFilePathPattern := range excludedFilePathPatterns {
		if excludedFilePathPattern.Match(filePath) {
			return true
		}
	}
	return false
}

func IsEmbeddableFileContent(content string) bool {
	if len(strings.TrimSpace(content)) < MIN_EMBEDDABLE_FILE_SIZE {
		return false
	}

	fileHeader := strings.ToLower(strings.Join(strings.SplitN(content, "\n", 5), "\n"))
	for _, header := range autogeneratedFileHeaders {
		if strings.Contains(fileHeader, header) {
			return false
		}
	}

	lr := byteutils.NewLineReader([]byte(content))
	for lr.Scan() {
		if len(lr.Line()) > MAX_LINE_LENGTH {
			return false
		}
	}

	return true
}

func IsValidTextFile(fileName string) bool {
	ext := strings.TrimPrefix(filepath.Ext(fileName), ".")
	_, ok := textFileExtensions[strings.ToLower(ext)]
	if ok {
		return true
	}
	basename := strings.ToLower(filepath.Base(fileName))
	return strings.HasPrefix(basename, "license")
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
