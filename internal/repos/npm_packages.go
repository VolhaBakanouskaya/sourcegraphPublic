package repos

import (
	"context"

	"github.com/sourcegraph/sourcegraph/internal/codeintel/dependencies"
	"github.com/sourcegraph/sourcegraph/internal/conf/reposource"
	"github.com/sourcegraph/sourcegraph/internal/extsvc/npm"
	"github.com/sourcegraph/sourcegraph/internal/jsonc"
	"github.com/sourcegraph/sourcegraph/internal/types"
	"github.com/sourcegraph/sourcegraph/lib/errors"
	"github.com/sourcegraph/sourcegraph/schema"
)

// NewNpmPackagesSource returns a new DependenciesSource from the given external
// service.
func NewNpmPackagesSource(svc *types.ExternalService) (*DependenciesSource, error) {
	var c schema.NpmPackagesConnection
	if err := jsonc.Unmarshal(svc.Config, &c); err != nil {
		return nil, errors.Errorf("external service id=%d config error: %s", svc.ID, err)
	}
	return &DependenciesSource{
		svc:        svc,
		configDeps: c.Dependencies,
		scheme:     dependencies.NpmPackagesScheme,
		/* depsSvc initialized in SetDependenciesService */
		src: &npmPackagesSource{
			client: npm.NewHTTPClient(svc.URN(), c.Registry, c.Credentials),
		},
	}, nil
}

var _ dependenciesSource = &npmPackagesSource{}

type npmPackagesSource struct {
	client npm.Client
}

func (npmPackagesSource) ParseDependency(dep string) (reposource.PackageDependency, error) {
	return reposource.ParseNpmDependency(dep)
}

func (npmPackagesSource) ParseDependencyFromRepoName(repoName string) (reposource.PackageDependency, error) {
	pkg, err := reposource.ParseNpmPackageFromRepoURL(repoName)
	if err != nil {
		return nil, err
	}
	return &reposource.NpmDependency{NpmPackage: pkg}, nil
}

func (s *npmPackagesSource) Get(ctx context.Context, name, version string) (reposource.PackageDependency, error) {
	dep, err := reposource.ParseNpmDependency(name + "@" + version)
	if err != nil {
		return nil, err
	}

	info, err := s.client.GetDependencyInfo(ctx, dep)
	if err != nil {
		return nil, err
	}

	dep.PackageDescription = info.Description
	dep.TarballURL = info.Dist.TarballURL

	return dep, nil
}
