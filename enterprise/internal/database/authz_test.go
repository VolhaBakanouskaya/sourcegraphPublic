package database

import (
	"context"
	"fmt"
	"testing"

	"github.com/sourcegraph/log/logtest"
	"github.com/stretchr/testify/require"

	"github.com/sourcegraph/sourcegraph/cmd/frontend/globals"
	"github.com/sourcegraph/sourcegraph/internal/api"
	"github.com/sourcegraph/sourcegraph/internal/authz"
	"github.com/sourcegraph/sourcegraph/internal/database"
	"github.com/sourcegraph/sourcegraph/internal/database/dbtest"
	"github.com/sourcegraph/sourcegraph/internal/extsvc"
	"github.com/sourcegraph/sourcegraph/internal/types"
	"github.com/sourcegraph/sourcegraph/schema"
)

func TestAuthzStore_GrantPendingPermissions(t *testing.T) {
	logger := logtest.Scoped(t)
	db := database.NewDB(logger, dbtest.NewDB(logger, t))
	ctx := context.Background()

	// Create repos needed
	for _, repoID := range []api.RepoID{1, 2, 3} {
		err := db.Repos().Create(ctx, &types.Repo{
			ID:   repoID,
			Name: api.RepoName(fmt.Sprintf("repo-%d", repoID)),
		})
		require.NoError(t, err)
	}

	// Create user with initially verified email
	user, err := db.Users().Create(ctx, database.NewUser{
		Email:           "alice@example.com",
		Username:        "alice",
		EmailIsVerified: true,
	})
	if err != nil {
		t.Fatal(err)
	}

	code := "verify-code"

	// Add and verify the second email
	err = db.UserEmails().Add(ctx, user.ID, "alice2@example.com", &code)
	if err != nil {
		t.Fatal(err)
	}
	err = db.UserEmails().SetVerified(ctx, user.ID, "alice2@example.com", true)
	if err != nil {
		t.Fatal(err)
	}

	// Add third email and leave as unverified
	err = db.UserEmails().Add(ctx, user.ID, "alice3@example.com", &code)
	if err != nil {
		t.Fatal(err)
	}

	// Add two external accounts
	err = db.UserExternalAccounts().AssociateUserAndSave(ctx, user.ID,
		extsvc.AccountSpec{
			ServiceType: "gitlab",
			ServiceID:   "https://gitlab.com/",
			AccountID:   "alice_gitlab",
		},
		extsvc.AccountData{},
	)
	if err != nil {
		t.Fatal(err)
	}
	err = db.UserExternalAccounts().AssociateUserAndSave(ctx, user.ID,
		extsvc.AccountSpec{
			ServiceType: "github",
			ServiceID:   "https://github.com/",
			AccountID:   "alice_github",
		},
		extsvc.AccountData{},
	)
	if err != nil {
		t.Fatal(err)
	}

	s := NewAuthzStore(logger, db, clock).(*authzStore)

	// Each update corresponds to a SetRepoPendingPermssions call
	type update struct {
		accounts *extsvc.Accounts
		repoID   int32
	}
	tests := []struct {
		name          string
		config        *schema.PermissionsUserMapping
		args          *database.GrantPendingPermissionsArgs
		updates       []update
		expectRepoIDs []int
	}{
		{
			name: "grant by emails",
			config: &schema.PermissionsUserMapping{
				BindID: "email",
			},
			args: &database.GrantPendingPermissionsArgs{
				UserID: user.ID,
				Perm:   authz.Read,
				Type:   authz.PermRepos,
			},
			updates: []update{
				{
					accounts: &extsvc.Accounts{
						ServiceType: authz.SourcegraphServiceType,
						ServiceID:   authz.SourcegraphServiceID,
						AccountIDs:  []string{"alice@example.com"},
					},
					repoID: 1,
				}, {
					accounts: &extsvc.Accounts{
						ServiceType: authz.SourcegraphServiceType,
						ServiceID:   authz.SourcegraphServiceID,
						AccountIDs:  []string{"alice2@example.com"},
					},
					repoID: 2,
				}, {
					accounts: &extsvc.Accounts{
						ServiceType: authz.SourcegraphServiceType,
						ServiceID:   authz.SourcegraphServiceID,
						AccountIDs:  []string{"alice3@example.com"},
					},
					repoID: 3,
				},
			},
			expectRepoIDs: []int{1, 2},
		},
		{
			name: "grant by username",
			config: &schema.PermissionsUserMapping{
				BindID: "username",
			},
			args: &database.GrantPendingPermissionsArgs{
				UserID: user.ID,
				Perm:   authz.Read,
				Type:   authz.PermRepos,
			},
			updates: []update{
				{
					accounts: &extsvc.Accounts{
						ServiceType: authz.SourcegraphServiceType,
						ServiceID:   authz.SourcegraphServiceID,
						AccountIDs:  []string{"alice"},
					},
					repoID: 1,
				}, {
					accounts: &extsvc.Accounts{
						ServiceType: authz.SourcegraphServiceType,
						ServiceID:   authz.SourcegraphServiceID,
						AccountIDs:  []string{"bob"},
					},
					repoID: 2,
				},
			},
			expectRepoIDs: []int{1},
		},
		{
			name: "grant by external accounts",
			config: &schema.PermissionsUserMapping{
				BindID: "username",
			},
			args: &database.GrantPendingPermissionsArgs{
				UserID: user.ID,
				Perm:   authz.Read,
				Type:   authz.PermRepos,
			},
			updates: []update{
				{
					accounts: &extsvc.Accounts{
						ServiceType: "github",
						ServiceID:   "https://github.com/",
						AccountIDs:  []string{"alice_github"},
					},
					repoID: 1,
				}, {
					accounts: &extsvc.Accounts{
						ServiceType: "gitlab",
						ServiceID:   "https://gitlab.com/",
						AccountIDs:  []string{"alice_gitlab"},
					},
					repoID: 2,
				}, {
					accounts: &extsvc.Accounts{
						ServiceType: "bitbucketServer",
						ServiceID:   "https://bitbucketServer.com/",
						AccountIDs:  []string{"alice_bitbucketServer"},
					},
					repoID: 3,
				},
			},
			expectRepoIDs: []int{1, 2},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			defer cleanupPermsTables(t, s.store.(*permsStore))

			globals.SetPermissionsUserMapping(test.config)

			for _, update := range test.updates {
				err := s.store.SetRepoPendingPermissions(ctx, update.accounts, &authz.RepoPermissions{
					RepoID: update.repoID,
					Perm:   authz.Read,
				})
				if err != nil {
					t.Fatal(err)
				}
			}
			err := s.GrantPendingPermissions(ctx, test.args)
			if err != nil {
				t.Fatal(err)
			}

			p := &authz.UserPermissions{
				UserID: user.ID,
				Perm:   authz.Read,
				Type:   authz.PermRepos,
			}
			err = s.store.LoadUserPermissions(ctx, p)
			if err != nil {
				t.Fatal(err)
			}

			equal(t, "p.IDs", test.expectRepoIDs, mapsetToArray(p.IDs))
		})
	}
}

func TestAuthzStore_AuthorizedRepos(t *testing.T) {
	logger := logtest.Scoped(t)
	db := database.NewDB(logger, dbtest.NewDB(logger, t))
	ctx := context.Background()

	s := NewAuthzStore(logger, db, clock).(*authzStore)

	// create users and repos
	for _, userID := range []int32{1, 2} {
		db.Users().Create(ctx, database.NewUser{
			Username: fmt.Sprintf("user-%d", userID),
		})
	}
	for _, repoID := range []api.RepoID{1, 2, 3, 4} {
		db.Repos().Create(ctx, &types.Repo{
			ID:   repoID,
			Name: api.RepoName(fmt.Sprintf("repo-%d", repoID)),
		})
	}

	type update struct {
		repoID  int32
		userIDs []int32
	}
	tests := []struct {
		name        string
		args        *database.AuthorizedReposArgs
		updates     []update
		expectRepos []*types.Repo
	}{
		{
			name: "no repos",
			args: &database.AuthorizedReposArgs{},
		},
		{
			name: "has permissions for user=1",
			args: &database.AuthorizedReposArgs{
				Repos: []*types.Repo{
					{ID: 1},
					{ID: 2},
					{ID: 4},
				},
				UserID: 1,
				Perm:   authz.Read,
				Type:   authz.PermRepos,
			},
			updates: []update{
				{
					repoID:  1,
					userIDs: []int32{1},
				}, {
					repoID:  2,
					userIDs: []int32{1},
				}, {
					repoID:  3,
					userIDs: []int32{1},
				},
			},
			expectRepos: []*types.Repo{
				{ID: 1},
				{ID: 2},
			},
		},
		{
			name: "no permissions for user=2",
			args: &database.AuthorizedReposArgs{
				Repos: []*types.Repo{
					{ID: 1},
					{ID: 2},
				},
				UserID: 2,
				Perm:   authz.Read,
				Type:   authz.PermRepos,
			},
			updates: []update{
				{
					repoID:  1,
					userIDs: []int32{1},
				},
			},
			expectRepos: []*types.Repo{},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Cleanup(func() {
				cleanupPermsTables(t, s.store.(*permsStore))
			})

			for _, update := range test.updates {
				userIDs := make([]authz.UserIDWithExternalAccountID, len(update.userIDs))
				for i, userID := range update.userIDs {
					userIDs[i] = authz.UserIDWithExternalAccountID{
						UserID: userID,
					}
				}
				if err := s.store.SetRepoPerms(ctx, update.repoID, userIDs); err != nil {
					t.Fatal(err)
				}
				_, err := s.store.SetRepoPermissions(ctx, &authz.RepoPermissions{
					RepoID:  update.repoID,
					Perm:    authz.Read,
					UserIDs: toMapset(update.userIDs...),
				})
				if err != nil {
					t.Fatal(err)
				}
			}

			repos, err := s.AuthorizedRepos(ctx, test.args)
			if err != nil {
				t.Fatal(err)
			}

			equal(t, "repos", test.expectRepos, repos)
		})
	}
}

func TestAuthzStore_RevokeUserPermissions(t *testing.T) {
	logger := logtest.Scoped(t)
	db := NewEnterpriseDB(database.NewDB(logger, dbtest.NewDB(logger, t)))
	ctx := context.Background()

	s := NewAuthzStore(logger, db, clock).(*authzStore)

	user, err := db.Users().Create(ctx, database.NewUser{Username: "alice"})
	if err != nil {
		t.Fatal(err)
	}

	repo := &types.Repo{ID: 1, Name: "github.com/sourcegraph/sourcegraph"}
	if err := db.Repos().Create(ctx, repo); err != nil {
		t.Fatal(err)
	}

	// Set both effective and pending permissions for a user
	if err = s.store.SetUserExternalAccountPerms(ctx, authz.UserIDWithExternalAccountID{UserID: user.ID}, []int32{int32(repo.ID)}); err != nil {
		t.Fatal(err)
	}
	if _, err = s.store.SetRepoPermissions(ctx, &authz.RepoPermissions{
		RepoID:  int32(repo.ID),
		Perm:    authz.Read,
		UserIDs: toMapset(user.ID),
	}); err != nil {
		t.Fatal(err)
	}

	accounts := &extsvc.Accounts{
		ServiceType: authz.SourcegraphServiceType,
		ServiceID:   authz.SourcegraphServiceID,
		AccountIDs:  []string{"alice", "alice@example.com"},
	}
	if err := s.store.SetRepoPendingPermissions(ctx, accounts, &authz.RepoPermissions{
		RepoID: int32(repo.ID),
		Perm:   authz.Read,
	}); err != nil {
		t.Fatal(err)
	}

	if err := db.SubRepoPerms().Upsert(
		ctx, user.ID, repo.ID, authz.SubRepoPermissions{Paths: []string{"**"}},
	); err != nil {
		t.Fatal(err)
	}

	// Revoke all of them
	if err := s.RevokeUserPermissions(ctx, &database.RevokeUserPermissionsArgs{
		UserID:   user.ID,
		Accounts: []*extsvc.Accounts{accounts},
	}); err != nil {
		t.Fatal(err)
	}

	// The user should not have any permissions now
	err = s.store.LoadUserPermissions(ctx, &authz.UserPermissions{
		UserID: user.ID,
		Perm:   authz.Read,
		Type:   authz.PermRepos,
	})
	if err != authz.ErrPermsNotFound {
		t.Fatalf("err: want %q but got %v", authz.ErrPermsNotFound, err)
	}

	srpMap, err := db.SubRepoPerms().GetByUser(ctx, user.ID)
	if err != nil {
		t.Fatal(err)
	}

	if numPerms := len(srpMap); numPerms != 0 {
		t.Fatalf("expected no sub-repo perms, got %d", numPerms)
	}

	for _, bindID := range accounts.AccountIDs {
		err = s.store.LoadUserPendingPermissions(ctx, &authz.UserPendingPermissions{
			ServiceType: accounts.ServiceType,
			ServiceID:   accounts.ServiceID,
			BindID:      bindID,
			Perm:        authz.Read,
			Type:        authz.PermRepos,
		})
		if err != authz.ErrPermsNotFound {
			t.Fatalf("[%s] err: want %q but got %v", bindID, authz.ErrPermsNotFound, err)
		}
	}
}
