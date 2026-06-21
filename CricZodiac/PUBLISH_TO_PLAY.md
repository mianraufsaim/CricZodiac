# Publishing CricZodiac to the Google Play Store (first time)

Your project is now configured for a release build: it targets **API 35** (Play's
current requirement) and signs release builds from a keystore you control. Follow
these steps in order.

---

## 1. Create your upload keystore (one time — back it up!)

Run this from the `android/` folder on your Mac/PC (needs the JDK from Android Studio):

```bash
cd android
keytool -genkeypair -v \
  -keystore upload-keystore.jks \
  -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

It will ask for a keystore password, your name/org, etc. Remember the password.

> **Critical:** Back up `upload-keystore.jks` and its passwords somewhere safe
> (password manager + cloud). If you lose it you can recover via Play App Signing,
> but it's a hassle. Never commit it to git (already gitignored).

## 2. Point the build at your keystore

Copy the template and fill in your real values:

```bash
cp keystore.properties.example keystore.properties
```

Edit `android/keystore.properties`:

```
storeFile=../upload-keystore.jks
storePassword=<the keystore password you set>
keyAlias=upload
keyPassword=<the key password you set>
```

Both `keystore.properties` and `upload-keystore.jks` are gitignored.

## 3. Bump the version (for this and every future release)

In `android/app/build.gradle`, each Play upload needs a higher `versionCode`:

```
versionCode 1        // increment to 2, 3, ... on every upload
versionName "1.0"    // human-readable, e.g. "1.0.0"
```

`1` is fine for your first upload.

## 4. Build the release App Bundle (.aab)

Play requires an **AAB**, not an APK:

```bash
cd android
./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

(First run downloads Gradle 8.7 + dependencies — give it several minutes. Requires JDK 17.)

> Want to test the exact release build on your own phone first? Build an APK with
> `./gradlew assembleRelease` and install `app/build/outputs/apk/release/app-release.apk`.

---

## 5. Set up the app in Play Console

1. Go to https://play.google.com/console → **Create app**. Set name (CricZodiac),
   default language, app/game, free/paid, and accept the declarations.
2. Complete the **Dashboard → "Set up your app"** tasks:
   - **App access** (is login required? provide test credentials if so)
   - **Ads** declaration
   - **Content rating** questionnaire
   - **Target audience** and content
   - **Data safety** form — declare what data you collect. Your app uses Firebase
     Analytics and a camera, so disclose analytics/usage data and any photos.
   - **Privacy policy** URL (required because you use Analytics + camera). You'll
     need a hosted privacy policy page.
3. **Store listing**: short + full description, app icon (512×512), feature graphic
   (1024×500), and at least 2–8 phone screenshots.

## 6. The closed-testing requirement (applies to your account)

Because your developer account is a **personal account created after Nov 13, 2023**,
Google requires, before you can publish to production:

- A **closed test** running for **14 consecutive days**
- With at least **12 testers opted in** the whole time

So your first upload goes to a test track, not straight to production:

1. **Testing → Closed testing → Create track** (or use the default "Alpha").
2. Create an **email list** of your 12+ testers, or share the opt-in link.
3. **Create a new release**, upload `app-release.aab`, add release notes, review,
   and **roll out** to the closed track.
4. Have all 12+ testers accept the invite and install the app. Keep them opted in
   for 14 straight days.

## 7. Apply for production access → launch

After 14 days with 12+ testers, Play Console shows an **"Apply for production"**
button. Submit it; Google reviews (can take a few days). Once approved:

1. **Production → Create new release** → upload the AAB (or promote the tested one).
2. Choose rollout percentage and **roll out to production**.
3. First production submissions get a review (often 1–7 days). After approval the
   app goes live.

---

## Notes & gotchas

- **Play App Signing**: on first upload Google offers to manage your app signing key.
  Accept it — your `upload-keystore.jks` then becomes just the *upload* key, and Google
  re-signs with the real app key. This is the recommended, default setup.
- **Firebase**: your `google-services.json` is for `com.criczodiac`. If you enabled
  Firebase features that need a SHA-1/SHA-256 (e.g. some Auth providers, Dynamic
  Links), add your upload key's fingerprint and Play App Signing's fingerprint in
  the Firebase console. Plain Analytics doesn't require this.
- **Build toolchain note**: I upgraded the Android Gradle Plugin to 8.6.0 and Gradle
  to 8.7 (needed to compile against API 35 on RN 0.73.4). If `./gradlew bundleRelease`
  errors on the toolchain, the cleaner long-term fix is upgrading React Native — I can
  help with that.
