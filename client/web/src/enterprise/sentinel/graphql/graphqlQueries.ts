import { gql } from '@sourcegraph/http-client'

const vulnerabilitiesFields = gql`
    fragment VulnerabilitiesFields on VulnerabilityMatch {
        __typename
        vulnerability {
            id
            sourceID
            details
            summary
            affectedPackages {
                packageName
                language
                versionConstraint
            }
            published
            modified
            cvssScore
            severity
        }
    }
`

export const RESOLVE_SECURITY_VULNERABILITIES_QUERY = gql`
    query VulnerabilityMatches(
        $first: Int
        $after: String
        $severity: String
        $language: String
        $repositoryName: String
    ) {
        vulnerabilityMatches(
            first: $first
            after: $after
            severity: $severity
            language: $language
            repositoryName: $repositoryName
        ) {
            nodes {
                id
                ...VulnerabilitiesFields
            }
            totalCount
            pageInfo {
                hasNextPage
                endCursor
            }
        }
    }
    ${vulnerabilitiesFields}
`

const vulnerabilityMatchesGroupedByRepositoryFields = gql`
    fragment VulnerabilityMatchesCountByRepositoryFields on VulnerabilityMatchCountByRepository {
        __typename
        repositoryName
        matchCount
    }
`

export const VULNERABILITY_MATCHES_GROUPED_BY_REPOSITORY = gql`
    query VulnerabilityMatchesGroupedByRepository($first: Int, $after: String, $repositoryName: String) {
        vulnerabilityMatchesCountByRepository(first: $first, after: $after, repositoryName: $repositoryName) {
            nodes {
                id
                ...VulnerabilityMatchesCountByRepositoryFields
            }
            totalCount
            pageInfo {
                hasNextPage
                endCursor
            }
        }
    }
    ${vulnerabilityMatchesGroupedByRepositoryFields}
`
