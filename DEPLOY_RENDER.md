# Deploy ChatFlow on Render

## 1. Create accounts
- Sign in to `https://render.com` with GitHub.

## 2. Create the PostgreSQL database
- In Render, create a new PostgreSQL database.
- Use the free plan if this is just for demo/interview use.
- After it is ready, copy these values from the database dashboard:
  - `Host`
  - `Port`
  - `Database`
  - `User`
  - `Password`

## 3. Deploy the backend
- Create a new Web Service from `https://github.com/ADITYA-CODE-SOURCE/chatflow`.
- Settings:
  - `Root Directory`: `backend`
  - `Runtime`: `Docker`
  - `Plan`: `Free`
- Add these environment variables:

```text
SPRING_PROFILES_ACTIVE=prod
SPRING_DATASOURCE_URL=jdbc:postgresql://<HOST>:<PORT>/<DATABASE>
SPRING_DATASOURCE_USERNAME=<USER>
SPRING_DATASOURCE_PASSWORD=<PASSWORD>
JWT_SECRET=<long-random-secret-at-least-32-chars>
FRONTEND_URL=https://<your-frontend-name>.onrender.com
ALLOWED_ORIGINS=https://<your-frontend-name>.onrender.com,http://localhost:5173,http://localhost:3000
PORT=8080
```

- Deploy the service and wait for the first successful build.
- Copy the backend URL, for example `https://chatflow-backend.onrender.com`.

## 4. Deploy the frontend
- Create a new Static Site from the same GitHub repository.
- Settings:
  - `Root Directory`: `frontend`
  - `Build Command`: `npm install && npm run build`
  - `Publish Directory`: `dist`
- Add this environment variable:

```text
VITE_API_BASE_URL=https://<your-backend-name>.onrender.com
```

- Deploy the site.
- Copy the frontend URL, for example `https://chatflow-frontend.onrender.com`.

## 5. Update backend frontend URL
- Open the backend service settings.
- Set these values to the real frontend URL if you used placeholders before:

```text
FRONTEND_URL=https://<your-frontend-name>.onrender.com
ALLOWED_ORIGINS=https://<your-frontend-name>.onrender.com,http://localhost:5173,http://localhost:3000
```

- Redeploy the backend once after updating them.

## 6. Test the live app
- Open the frontend URL.
- Register two users.
- Test:
  - login/register
  - direct chat
  - create group
  - invite link join
  - image upload
  - typing and presence

## Notes
- Render free web services sleep after inactivity, so the first load can take 30-60 seconds.
- Render free Postgres is for demo use and can expire depending on the current free-plan policy.
- Uploaded images are stored on ephemeral disk in production, so they can disappear after a restart.
- The frontend includes a SPA rewrite via `frontend/public/_redirects`, so `/app` and `/join/:inviteCode` work on refresh.
