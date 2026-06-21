<?php
declare(strict_types=1);

header('Content-Type: text/html; charset=UTF-8');
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="CricZodiac Privacy Policy">
  <title>Privacy Policy | CricZodiac</title>
  <style>
    :root {
      color-scheme: dark;
      --ink: #f6f7fb;
      --muted: #aab2c9;
      --gold: #e3b62c;
      --gold-soft: #ffe8a0;
      --navy: #080d28;
      --panel: #111938;
      --line: rgba(255, 255, 255, .12);
    }

    * { box-sizing: border-box; }

    html { background: var(--navy); }

    body {
      margin: 0;
      color: var(--ink);
      background: radial-gradient(circle at top right, #1d2c62 0, var(--navy) 38rem);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 16px;
      line-height: 1.65;
    }

    a { color: var(--gold-soft); }
    a:hover { color: #fff0bd; }

    .page { width: min(100% - 32px, 880px); margin: 0 auto; }

    header {
      padding: 28px 0 24px;
      border-bottom: 1px solid var(--line);
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      color: var(--ink);
      font-size: 18px;
      font-weight: 800;
      letter-spacing: .08em;
      text-decoration: none;
    }

    .brand-mark {
      display: grid;
      width: 30px;
      height: 30px;
      place-items: center;
      border: 1px solid var(--gold);
      border-radius: 7px;
      color: var(--gold);
      font-size: 18px;
      line-height: 1;
    }

    main { padding: 52px 0 64px; }

    .eyebrow {
      margin: 0 0 8px;
      color: var(--gold);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: .14em;
      text-transform: uppercase;
    }

    h1, h2 { line-height: 1.2; }

    h1 {
      max-width: 640px;
      margin: 0;
      font-size: clamp(34px, 7vw, 52px);
      letter-spacing: 0;
    }

    .intro {
      max-width: 700px;
      margin: 18px 0 0;
      color: #d8dcec;
      font-size: 18px;
    }

    .updated {
      display: inline-block;
      margin-top: 18px;
      color: var(--muted);
      font-size: 14px;
    }

    .notice {
      margin: 38px 0;
      padding: 20px 22px;
      border-left: 3px solid var(--gold);
      border-radius: 0 7px 7px 0;
      background: rgba(227, 182, 44, .1);
      color: #f4edcf;
    }

    section { margin-top: 36px; }

    h2 { margin: 0 0 12px; font-size: 23px; }
    p { margin: 0 0 14px; }

    ul {
      margin: 0 0 14px;
      padding-left: 22px;
    }

    li { margin: 7px 0; }

    .data-list {
      display: grid;
      gap: 12px;
      margin-top: 18px;
    }

    .data-item {
      padding: 16px 18px;
      border: 1px solid var(--line);
      border-radius: 7px;
      background: rgba(17, 25, 56, .78);
    }

    .data-item strong { display: block; color: var(--gold-soft); }
    .data-item span { color: var(--muted); }

    footer {
      padding: 24px 0 36px;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 14px;
    }

    @media (max-width: 560px) {
      .page { width: min(100% - 28px, 880px); }
      header { padding-top: 20px; }
      main { padding-top: 40px; }
      .notice { padding: 16px; }
    }
  </style>
</head>
<body>
  <header>
    <div class="page">
      <a class="brand" href="https://cricket.zodiactech.net/" aria-label="CricZodiac home">
        <span class="brand-mark" aria-hidden="true">C</span>
        <span>CRICZODIAC</span>
      </a>
    </div>
  </header>

  <main class="page">
    <p class="eyebrow">Legal</p>
    <h1>Privacy Policy</h1>
    <p class="intro">This policy explains how CricZodiac collects, uses and protects information when you use the CricZodiac mobile application and related services.</p>
    <p class="updated">Last updated: 21 June 2026</p>

    <aside class="notice">
      CricZodiac is a cricket club and match-management application. It is operated by Zodiac Technologies. By using the app, you acknowledge the practices described in this policy.
    </aside>

    <section>
      <h2>Information We Collect</h2>
      <div class="data-list">
        <div class="data-item">
          <strong>Account and contact details</strong>
          <span>Name, email address, phone number, account role and club affiliation supplied when an account is created or updated.</span>
        </div>
        <div class="data-item">
          <strong>Cricket and club information</strong>
          <span>Teams, players, series, matches, scorecards, ball-by-ball events, awards and other records created or managed through the app.</span>
        </div>
        <div class="data-item">
          <strong>Profile image</strong>
          <span>An optional profile image is collected only when you choose to take or select one and save it to your profile.</span>
        </div>
        <div class="data-item">
          <strong>Camera and ball-tracking data</strong>
          <span>Camera access is used only after permission is granted for features such as profile photography and the AI Ball Tracking Lab. Ball-tracking camera frames are processed on the device to provide live measurements and a trajectory display; the test screen does not save deliveries to a match scorecard.</span>
        </div>
        <div class="data-item">
          <strong>Approximate location and device storage</strong>
          <span>For automatic light and dark theme selection, the app may request approximate coordinates from your IP address through a third-party IP-location service. It does not request your device's GPS location. The app also stores sign-in state, selected club, theme preference and offline cricket records on your device so it can work offline and synchronise later.</span>
        </div>
      </div>
    </section>

    <section>
      <h2>How We Use Information</h2>
      <p>We use the information above to provide and maintain CricZodiac, authenticate users, administer clubs, create and display cricket records, synchronise offline activity, provide player and match statistics, respond to support requests, and protect the security and reliability of the service.</p>
    </section>

    <section>
      <h2>How Information Is Shared</h2>
      <p>CricZodiac does not sell personal information or use it for interest-based advertising. Information is shared only as needed to operate the service:</p>
      <ul>
        <li>with authorised members of your club according to their role, such as administrators, umpires and players;</li>
        <li>with service providers that host and operate the app infrastructure;</li>
        <li>with the IP-location service used for automatic theme selection, which receives your IP address when that feature makes a request; and</li>
        <li>when required by law, to enforce our rights, or to protect users, the service or the public.</li>
      </ul>
    </section>

    <section>
      <h2>Permissions</h2>
      <p>Android asks before granting sensitive permissions. Camera permission is optional, but camera-dependent features will not work without it. You can change permissions at any time in your device settings. The app requires internet access to sign in, synchronise data and load hosted profile images.</p>
    </section>

    <section>
      <h2>Retention and Your Choices</h2>
      <p>We retain account and cricket records for as long as they are needed to provide CricZodiac, administer the relevant club and meet legal or operational requirements. You may ask your club administrator to correct account information. To request account deletion or raise a privacy question, contact us using the details below. Some records may need to be retained where they are part of a club's match history or where retention is required by law.</p>
    </section>

    <section>
      <h2>Security</h2>
      <p>We use reasonable technical and organisational safeguards designed to protect information. No online service or device storage method is completely secure, so we cannot guarantee absolute security. Please keep your device and account credentials secure.</p>
    </section>

    <section>
      <h2>Children's Privacy</h2>
      <p>CricZodiac is intended for cricket clubs and their authorised users. It is not directed to children under 13. Clubs and account administrators are responsible for ensuring they have appropriate authority to provide and manage information about players who are minors.</p>
    </section>

    <section>
      <h2>Changes to This Policy</h2>
      <p>We may update this policy when our practices or legal requirements change. We will post the revised version on this page and update the date at the top of the policy.</p>
    </section>

    <section>
      <h2>Contact Us</h2>
      <p>For privacy questions, access requests or deletion requests, email <a href="mailto:admin@zodiactech.net">admin@zodiactech.net</a>.</p>
    </section>
  </main>

  <footer>
    <div class="page">&copy; 2026 Zodiac Technologies. CricZodiac Privacy Policy.</div>
  </footer>
</body>
</html>
