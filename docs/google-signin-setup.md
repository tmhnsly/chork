# Google sign-in: the half that isn't code

The app side is built. It does nothing until a Google OAuth client
exists and Supabase knows about it — until then the button returns
"Unsupported provider".

Project ref: **`cfyagiwtzrgfjtwaevlh`**. Every link below is
pre-pointed at it.

## Not this screen

Supabase's **organisation** settings has a page called **OAuth Apps**
(Settings → Connections → OAuth Apps). That is for publishing an app
that integrates with *Supabase's own API* — third-party tools that
read your projects, like the Resend and Claude Code entries listed
there. It has nothing to do with signing in to Chork, and the "client
ID" column on it is not the one we want.

Google sign-in is configured **per project**, under Authentication.

## 1. Google Cloud — create the client

⚠️ Google moved this. It used to be *APIs & Services → Credentials*;
it is now the **Google Auth Platform**, and the old path leads
somewhere that looks similar and isn't.

1. <https://console.cloud.google.com/auth/clients> — create or pick a
   project.
2. If prompted, configure the **branding / consent screen** first:
   app name, support email, and `chork.app` as the authorised domain.
   External user type.
3. **Create client** → application type **Web application**.
4. **Authorised JavaScript origins**:

   ```
   http://localhost:3000
   https://chork.app
   ```

5. **Authorised redirect URIs** — this is **Supabase's** callback, not
   ours. Google will not accept a wildcard, and a mismatch fails at
   Google's end with `redirect_uri_mismatch` before Supabase is ever
   reached:

   ```
   https://cfyagiwtzrgfjtwaevlh.supabase.co/auth/v1/callback
   ```

6. Create. Google now shows the **Client ID** and **Client secret** —
   this is the only place they exist. The secret is shown once; copy
   it now.

## 2. Supabase — paste them in

<https://supabase.com/dashboard/project/cfyagiwtzrgfjtwaevlh/auth/providers>

Find **Google** in the provider list (newer dashboards label the
section **Sign In / Providers**). Enable it, paste the Client ID and
Client Secret, save.

That page also shows the callback URL Google wants — worth comparing
against what you pasted in step 5 rather than trusting this file.

## 3. Supabase — allow our redirect back

<https://supabase.com/dashboard/project/cfyagiwtzrgfjtwaevlh/auth/url-configuration>

- **Site URL**: `https://chork.app`
- **Redirect URLs** — add both, or the callback lands nowhere in
  whichever environment you forgot:

  ```
  http://localhost:3000/auth/callback
  https://chork.app/auth/callback
  ```

## 4. Check it

Sign in with a Google account that has **never used the app** — the
first-time path is the one that can break.

- [ ] The button leaves for Google and comes back signed in.
- [ ] You land on **`/onboarding`**, not the Card. A fresh OAuth
      account has a profile row (`handle_new_user`) with
      `onboarded = false`, and the proxy forces the flow. Landing on
      the Card means that guard has regressed.
- [ ] The display-name field is **prefilled with your Google name**
      (migration 122).
- [ ] Your Google avatar shows. If not, check `next.config.ts` still
      allows `*.googleusercontent.com` — `next/image` REFUSES an
      unlisted host rather than falling back to unoptimised, so the
      avatar disappears entirely.
- [ ] Tap Google, then hit **back** before completing. The button
      should be tappable again, not stuck on "Taking you to Google…".
- [ ] Sign in again with the same account: straight to the Card, no
      second onboarding.

## Notes

- **Email + password is untouched.** The two are alternatives on the
  same screen; existing accounts keep working.
- An email account and a Google account with the same address are
  **separate identities** unless account linking is enabled in
  Supabase. Worth deciding before launch, not after someone signs up
  twice and wonders where their sends went.
- Apple Sign In is the same shape and needs a paid Apple developer
  account. The callback route and onboarding routing are already
  shared, so it is mostly provider config again.
