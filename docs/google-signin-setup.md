# Google sign-in: the half that isn't code

The app side is built and merged. It does nothing until a Google OAuth
client exists and Supabase knows about it — until then the button
returns "Unsupported provider" and the climber is stuck on `/login`.

## 1. Google Cloud

1. **Google Cloud Console** → new project (or reuse one).
2. **APIs & Services → OAuth consent screen.** External. Fill in the
   app name, support email, and the `chork.app` domain.
3. **Credentials → Create credentials → OAuth client ID → Web
   application.**
4. **Authorised redirect URI** — this is Supabase's callback, *not*
   ours:

   ```
   https://<project-ref>.supabase.co/auth/v1/callback
   ```

   Get `<project-ref>` from `supabase/.temp/project-ref` or the
   Supabase dashboard URL. Google will not accept a wildcard here, and
   a mismatch fails with `redirect_uri_mismatch` at Google's end
   before Supabase is ever reached.

5. Copy the **client ID** and **client secret**.

## 2. Supabase

**Authentication → Providers → Google.** Enable it, paste the client
ID and secret, save.

**Authentication → URL Configuration.** Add both, or the callback
lands nowhere in whichever environment you forgot:

```
http://localhost:3000/auth/callback
https://chork.app/auth/callback
```

Site URL should be `https://chork.app`.

## 3. Check it

Sign in with a Google account **that has never used the app**, because
the interesting path is the first-time one:

- [ ] The button leaves for Google and comes back signed in.
- [ ] You land on **`/onboarding`**, not the Card. A fresh OAuth
      account has a profile row (the `handle_new_user` trigger) with
      `onboarded = false`, and the proxy forces the flow — if you land
      on the Card, that guard has regressed.
- [ ] The display-name field is **prefilled with your Google name**
      (migration 122).
- [ ] Your Google avatar shows. If it is missing, check
      `next.config.ts` still allows `*.googleusercontent.com` —
      `next/image` REFUSES an unlisted host rather than falling back
      to unoptimised, so the avatar disappears entirely.
- [ ] Tap Google, then hit **back** before completing. The button
      should be tappable again, not stuck on "Taking you to Google…".
- [ ] Sign in again with the same Google account: straight to the
      Card, no second onboarding.

## Notes

- **Nothing here weakens email + password.** The two are alternatives
  on the same screen; existing accounts are untouched.
- An email account and a Google account with the same address are
  **separate identities** unless account linking is enabled in
  Supabase. Worth deciding before launch rather than after someone
  signs up twice and wonders where their sends went.
- Apple Sign In is the same shape and needs a paid Apple developer
  account. Do it after this one works — the callback route and the
  onboarding routing are already shared, so it is mostly provider
  config again.
