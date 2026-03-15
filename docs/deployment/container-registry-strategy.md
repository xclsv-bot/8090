# Container Registry Strategy (GHCR)

## Registry
- **Registry:** GitHub Container Registry (`ghcr.io`)
- **Repository image:** `ghcr.io/<org>/xclsv-core-platform`
- **Visibility:** Private for production; public only if required by deployment target

## Build and Publish
- Build from root `Dockerfile` on merge to `main`.
- Push immutable and mutable tags:
  - Immutable: `sha-<git-sha>`
  - Release: `v<semver>`
  - Mutable: `latest` (for non-production convenience only)

## Tagging Rules
- Production deploys should reference immutable `sha-*` or release tags.
- Never deploy production from `latest`.
- Keep rollback window by retaining at least last 30 successful images.

## Security Controls
- Enable dependency and image scanning (GitHub Advanced Security/Trivy/Grype).
- Block deployment on critical vulnerabilities unless approved exception.
- Sign images (Sigstore Cosign) and verify signatures in CI/CD before deploy.
- Use short-lived OIDC tokens instead of long-lived registry PATs where possible.

## Lifecycle Policy
- Keep all release tags.
- Keep last 100 `sha-*` tags.
- Prune unreferenced `latest`-only images older than 30 days.

## Example Image References
- `ghcr.io/<org>/xclsv-core-platform:sha-1a2b3c4`
- `ghcr.io/<org>/xclsv-core-platform:v1.4.2`
