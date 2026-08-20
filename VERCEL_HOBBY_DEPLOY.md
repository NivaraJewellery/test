# Vercel Hobby deployment - IMPORTANT

This package contains exactly ONE deployable Vercel API function: `api/index.js`.

When updating your GitHub repository, do NOT only copy these files over the old project. First delete the old files inside the repository's `api` folder (except nothing), then copy the new `api` folder so it contains ONLY `index.js`.

Also remove any old `server/api` folder if it exists from a previous package. Handler modules now live under `lib/handlers`, which are imported by `api/index.js` and are not API entry points.

Expected structure:

- api/
  - index.js
- lib/
  - handlers/
    - account.js
    - admin-auth.js
    - ...

Before deploying, GitHub must show only ONE `.js` file under the root `api/` folder.
