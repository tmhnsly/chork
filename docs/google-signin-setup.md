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

### Verified — 2026-08-19

The first-time path has been run for real, in production, by a Google
account that had never used the app (`tomhinsley@me.com`, 2026-08-18
22:01 UTC), and the evidence is in the database rather than in
anyone's memory:

- `auth.users.raw_app_meta_data.providers = ["google"]`, one `google`
  identity, no password — the account came in through the button.
- `profiles.avatar_url` is a `lh3.googleusercontent.com` URL and the
  profile's name was prefilled from Google's `full_name` and then
  edited in onboarding — migration 122 did its job.
- `onboarded = true` with a gym set — the proxy's onboarding gate ran
  and the flow completed; a first-time OAuth user cannot reach the
  Card without it.
- The Google avatar renders on `/u/tom` on chork.app — the
  `*.googleusercontent.com` entry in `next.config.ts` is right.
- **Returning:** tapping the button again on chork.app landed straight
  on the Card in ~20s with no second onboarding (09:38 UTC the next
  morning). Google skipped its account chooser because the browser's
  one Google session had already consented; expect the chooser the
  first time.

And the part that can be checked without a human signing in is now a
test: `e2e/google.spec.ts` clicks the button and asserts that Supabase
answers `/auth/v1/authorize?provider=google` with a 302 to
`accounts.google.com` carrying a `.apps.googleusercontent.com` client
id, Supabase's own callback as `redirect_uri`, and our
`/auth/callback?next=` as the return address. Runs in CI on every push
against the live project, so a provider switched off or a client id
pasted wrong fails the build, not launch day.

### Still human

- [ ] **Publishing status in Google Cloud.** If the consent screen is
      in *Testing*, only listed test users get through — everyone
      else is turned away at Google's door with "Access blocked" — and
      nothing above can see that, because the owner is always a test
      user. Check <https://console.cloud.google.com/auth/audience>
      says *In production*, or sign in once with a Google account that
      is neither the project owner nor on the test-user list.
- [ ] **Redirect allow-list.** Supabase validates `redirect_to`
      server-side and silently substitutes the Site URL for an
      unlisted origin; the validated value is only observable when
      Supabase sends the climber back. Signing in from **localhost**
      and landing on `localhost:3000/auth/callback` (not bounced to
      chork.app) is the check. The 2026-08-18 signup was most likely
      made from the dev server — the client id went into `.env.local`
      that day — but nothing recorded where, so count it once, and
      again whenever the list is edited.
- [ ] Tap Google, then hit **back** before completing. The button
      should be tappable again, not stuck on "Taking you to Google…".
      (The `pageshow` handler that does this is in `login-form.tsx`;
      Google auto-approves a consented session too fast to test it
      from a browser that has already said yes.)

## Notes

- **Email + password is untouched.** The two are alternatives on the
  same screen; existing accounts keep working.
- **Same email, two ways in → one account.** Supabase's default is
  *automatic linking*: a Google sign-in whose verified email matches an
  existing, confirmed email+password account attaches the Google
  identity to THAT user rather than creating a second one. So someone
  who signed up with a password and later taps Google with the same
  address gets their sends, not a blank profile. A *different* email
  is a different account — `hello@` and `tomhinsley@me.com` are two
  people as far as Chork knows. (Manual linking — letting a signed-in
  user attach a second identity from settings — is a separate,
  off-by-default feature; nothing in the app calls it.)
- Apple Sign In is the same shape and needs a paid Apple developer
  account. The callback route and onboarding routing are already
  shared, so it is mostly provider config again.
