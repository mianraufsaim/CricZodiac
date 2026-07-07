<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#060A1A">
  <title>CricZodiac Player App</title>
  <style>
    :root {
      --background: #060A1A;
      --navy: #0A0F2C;
      --card: #0D1530;
      --card-border: #1A2445;
      --dark-gray: #2A2F45;
      --input-bg: #141830;
      --white: #FFFFFF;
      --light-gray: #E8EAF0;
      --gray: #8892A4;
      --gold: #D4AF37;
      --cyan: #00F0FF;
      --royal-blue: #102B6F;
      --purple: #4B2AA1;
      --orange: #E67E22;
      --success: #00C851;
      --warning: #FFBB33;
      --danger: #FF4444;
      --tab-bar: #080C20;
      --shadow: 0 16px 42px rgba(0, 0, 0, 0.28);
      color-scheme: dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    * { box-sizing: border-box; }
    html, body { min-height: 100%; margin: 0; }
    body {
      background:
        radial-gradient(circle at 20% -10%, rgba(16, 43, 111, 0.42), transparent 32rem),
        linear-gradient(180deg, var(--background), var(--navy));
      color: var(--white);
      -webkit-font-smoothing: antialiased;
      text-rendering: geometricPrecision;
    }

    button, input, select { font: inherit; }
    button { cursor: pointer; }
    button:disabled { cursor: default; opacity: 0.62; }
    input, select { min-width: 0; }

    .app-shell {
      width: min(100%, 460px);
      min-height: 100dvh;
      margin: 0 auto;
      background: linear-gradient(180deg, rgba(6, 10, 26, 0.97), rgba(10, 15, 44, 0.97));
      position: relative;
      overflow-x: hidden;
    }

    .screen {
      min-height: 100dvh;
      display: none;
      padding: calc(env(safe-area-inset-top, 0px) + 18px) 16px calc(env(safe-area-inset-bottom, 0px) + 34px);
    }

    .screen.active { display: block; }
    .login-screen { align-items: center; justify-content: center; }
    .login-screen.active { display: flex; }

    .login-wrap { width: 100%; max-width: 390px; }
    .net-row {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
      margin-bottom: 8px;
      color: var(--success);
      font-size: 11px;
      font-weight: 800;
    }

    .net-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--success);
      box-shadow: 0 0 18px rgba(0, 200, 81, 0.65);
    }

    .brand { text-align: center; margin-bottom: 32px; }
    .brand-mark {
      width: 118px;
      height: 118px;
      margin: 0 auto 14px;
      border-radius: 32px;
      display: grid;
      place-items: center;
      color: var(--white);
      background:
        linear-gradient(135deg, rgba(0, 240, 255, 0.22), rgba(16, 43, 111, 0.95)),
        var(--royal-blue);
      border: 1px solid rgba(212, 175, 55, 0.48);
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.32);
      font-size: 58px;
      font-weight: 950;
      font-style: italic;
    }
    .brand-title { margin: 0; font-size: 18px; font-weight: 950; letter-spacing: 1.5px; }
    .brand-subtitle { margin: 4px 0 0; color: var(--gray); font-size: 14px; }

    .login-card, .card, .section-card, .profile-card, .history-card, .leader-card, .empty-card {
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      box-shadow: var(--shadow);
    }

    .login-card { border-radius: 20px; padding: 24px; }
    .card-heading { margin: 0 0 24px; font-size: 20px; font-weight: 800; }

    .field {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 52px;
      margin-bottom: 16px;
      padding: 0 12px;
      background: var(--dark-gray);
      border: 1px solid transparent;
      border-radius: 12px;
      transition: border-color 160ms ease, box-shadow 160ms ease;
    }
    .field:focus-within {
      border-color: rgba(212, 175, 55, 0.72);
      box-shadow: 0 0 0 4px rgba(212, 175, 55, 0.12);
    }
    .field-icon { width: 22px; text-align: center; color: var(--gray); font-size: 17px; flex: 0 0 22px; }
    .field input {
      width: 100%;
      height: 50px;
      color: var(--white);
      background: transparent;
      border: 0;
      outline: 0;
      font-size: 15px;
    }
    .field input::placeholder { color: var(--gray); }

    .icon-button {
      width: 38px;
      height: 38px;
      border: 0;
      border-radius: 10px;
      display: grid;
      place-items: center;
      color: var(--gray);
      background: transparent;
      flex: 0 0 38px;
    }

    .primary-btn, .gold-btn {
      width: 100%;
      min-height: 52px;
      border: 0;
      border-radius: 12px;
      background: linear-gradient(135deg, var(--gold), #B8942A);
      color: var(--navy);
      font-weight: 950;
      letter-spacing: 1.6px;
      font-size: 15px;
    }
    .primary-btn { margin-top: 8px; }

    .error-box, .success-box {
      display: none;
      margin: 0 0 14px;
      padding: 12px 13px;
      border-radius: 12px;
      font-size: 13px;
      line-height: 1.4;
    }
    .error-box { border: 1px solid rgba(255, 68, 68, 0.38); background: rgba(255, 68, 68, 0.11); color: #ffb7b7; }
    .success-box { border: 1px solid rgba(0, 200, 81, 0.38); background: rgba(0, 200, 81, 0.10); color: #9df0bb; }
    .error-box.show, .success-box.show { display: block; }
    .footer-note { margin: 18px 0 0; text-align: center; color: var(--dark-gray); font-size: 11px; font-weight: 700; }

    .app-screen {
      padding: 0;
      min-height: 100dvh;
      padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 72px);
    }

    .nav-bar {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: calc(env(safe-area-inset-top, 0px) + 12px) 14px 12px;
      background: var(--card);
      border-bottom: 1px solid var(--card-border);
      position: sticky;
      top: 0;
      z-index: 12;
    }

    .nav-logo {
      width: 34px;
      height: 34px;
      border-radius: 9px;
      display: grid;
      place-items: center;
      background: linear-gradient(135deg, var(--cyan), var(--royal-blue));
      color: #fff;
      font-size: 18px;
      font-weight: 950;
      font-style: italic;
      flex: 0 0 34px;
    }

    .nav-info { min-width: 0; flex: 1; }
    .nav-name { margin: 0; color: var(--white); font-size: 15px; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .nav-subrow { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
    .nav-role { color: var(--gold); font-size: 11px; font-weight: 750; letter-spacing: 0.5px; }
    .club-badge, .meta-chip, .type-badge, .pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border-radius: 8px;
      font-size: 10px;
      font-weight: 800;
      line-height: 1;
      white-space: nowrap;
    }
    .club-badge {
      max-width: 138px;
      padding: 4px 7px;
      color: var(--gold);
      background: rgba(212, 175, 55, 0.10);
      border: 1px solid rgba(212, 175, 55, 0.28);
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .nav-action {
      width: 36px;
      height: 36px;
      border: 0;
      border-radius: 10px;
      color: var(--danger);
      background: rgba(255, 68, 68, 0.10);
      display: grid;
      place-items: center;
      font-size: 18px;
      flex: 0 0 36px;
    }

    .tab-page {
      display: none;
      padding: 14px 14px 22px;
    }
    .tab-page.active { display: block; }

    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 4px 14px;
    }
    .page-title { margin: 0; color: var(--white); font-size: 22px; font-weight: 950; }
    .page-subtitle { margin: 2px 0 0; color: var(--gray); font-size: 12px; }
    .count-badge {
      min-width: 38px;
      padding: 6px 10px;
      border-radius: 12px;
      color: var(--gold);
      background: rgba(212, 175, 55, 0.13);
      border: 1px solid rgba(212, 175, 55, 0.34);
      text-align: center;
      font-weight: 900;
    }

    .summary-row {
      display: flex;
      align-items: center;
      margin-bottom: 12px;
      padding: 14px 8px;
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 14px;
    }
    .summary-chip { flex: 1; text-align: center; min-width: 0; }
    .summary-val { display: block; font-size: 20px; font-weight: 950; line-height: 1.1; overflow-wrap: anywhere; }
    .summary-label { display: block; margin-top: 2px; color: var(--gray); font-size: 9px; font-weight: 750; letter-spacing: 0.4px; text-transform: uppercase; }
    .summary-div { width: 1px; height: 28px; background: var(--card-border); }

    .stat-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 11px 0;
      border-bottom: 1px solid rgba(26, 36, 69, 0.54);
    }
    .stat-row:last-child { border-bottom: 0; }
    .stat-left { display: flex; align-items: center; gap: 10px; color: var(--gray); font-size: 13px; min-width: 0; }
    .stat-left span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .stat-row-value { color: var(--white); font-size: 14px; font-weight: 800; text-align: right; overflow-wrap: anywhere; }

    .card { margin-bottom: 12px; overflow: hidden; }
    .card-header, .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 14px;
      border-left: 3px solid currentColor;
      border-bottom: 1px solid var(--card-border);
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 2px;
    }
    .card-body { padding: 4px 14px 8px; }
    .card-icon, .section-icon {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      display: grid;
      place-items: center;
      background: rgba(212, 175, 55, 0.12);
      font-size: 15px;
      flex: 0 0 28px;
    }

    .hero {
      margin-bottom: 12px;
      padding: 16px;
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 18px;
    }
    .hero-row { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
    .avatar {
      width: 74px;
      height: 74px;
      border-radius: 999px;
      border: 3px solid var(--gold);
      background: var(--royal-blue);
      display: grid;
      place-items: center;
      color: var(--white);
      font-size: 28px;
      font-weight: 950;
      overflow: hidden;
      flex: 0 0 74px;
    }
    .avatar.small { width: 30px; height: 30px; border-width: 0; font-size: 12px; flex-basis: 30px; }
    .avatar img { width: 100%; height: 100%; object-fit: cover; }
    .hero-info { min-width: 0; flex: 1; }
    .hero-name { margin: 0 0 7px; color: var(--white); font-size: 18px; font-weight: 950; line-height: 1.2; }
    .type-badge {
      padding: 5px 9px;
      color: var(--gold);
      background: rgba(212, 175, 55, 0.13);
      border: 1px solid rgba(212, 175, 55, 0.30);
      letter-spacing: 0.8px;
      text-transform: uppercase;
    }
    .hero-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .meta-chip { padding: 5px 7px; color: var(--gray); background: var(--dark-gray); }
    .hero .summary-row { margin: 0; background: var(--dark-gray); border: 0; box-shadow: none; }

    .section-card, .leader-card { margin-bottom: 12px; overflow: hidden; box-shadow: none; }
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      padding: 12px;
    }
    .stat-tile {
      min-height: 112px;
      padding: 14px 8px;
      border: 1px solid var(--card-border);
      border-radius: 14px;
      background: var(--dark-gray);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      text-align: center;
    }
    .stat-icon {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      display: grid;
      place-items: center;
      background: rgba(212, 175, 55, 0.10);
      font-size: 16px;
    }
    .stat-value { color: var(--white); font-size: 18px; font-weight: 950; line-height: 1.1; overflow-wrap: anywhere; }
    .stat-label { color: var(--gray); font-size: 9px; font-weight: 750; line-height: 1.25; letter-spacing: 0.3px; text-transform: uppercase; }

    .history-card {
      position: relative;
      overflow: hidden;
      margin-bottom: 12px;
      box-shadow: none;
    }
    .accent-bar { height: 3px; width: 100%; background: var(--gray); }
    .history-top { display: flex; align-items: flex-start; gap: 10px; padding: 14px; }
    .history-teams { margin: 0 0 7px; color: var(--white); font-size: 14px; font-weight: 900; line-height: 1.25; }
    .history-side { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; flex: 0 0 auto; }
    .meta-row { display: flex; flex-wrap: wrap; gap: 5px; }
    .history-result-row { display: flex; align-items: center; gap: 5px; padding: 0 14px 10px; margin-top: -4px; color: var(--gray); font-size: 11px; font-weight: 700; }
    .history-section { padding: 14px; border-top: 1px solid var(--card-border); }
    .perf-label { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; font-size: 10px; font-weight: 900; letter-spacing: 1.2px; }
    .perf-stats { display: flex; align-items: center; justify-content: space-between; gap: 5px; }
    .perf-chip { text-align: center; min-width: 38px; }
    .perf-val { color: var(--white); font-size: 15px; font-weight: 950; }
    .perf-lbl { color: var(--gray); font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
    .sep-v { width: 1px; height: 26px; background: var(--card-border); }

    .result-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border-radius: 8px;
      padding: 5px 9px;
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.6px;
      border: 1px solid rgba(136, 146, 164, 0.40);
      background: rgba(136, 146, 164, 0.12);
      color: var(--gray);
    }
    .result-won { color: var(--success); border-color: rgba(0, 200, 81, 0.40); background: rgba(0, 200, 81, 0.12); }
    .result-lost { color: var(--danger); border-color: rgba(255, 68, 68, 0.40); background: rgba(255, 68, 68, 0.12); }
    .result-tie { color: var(--warning); border-color: rgba(255, 187, 51, 0.40); background: rgba(255, 187, 51, 0.12); }

    .tab-switch {
      display: flex;
      gap: 4px;
      margin: 0 2px 12px;
      padding: 4px;
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 14px;
    }
    .tab-switch button {
      flex: 1;
      min-height: 38px;
      border: 0;
      border-radius: 11px;
      background: transparent;
      color: var(--gray);
      font-weight: 850;
      font-size: 12px;
      letter-spacing: 1px;
    }
    .tab-switch button.active { color: var(--gold); background: rgba(212, 175, 55, 0.13); }

    .leader-row {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 52px;
      padding: 10px 14px;
      border-top: 1px solid rgba(26, 36, 69, 0.54);
    }
    .leader-row:first-child { border-top: 0; }
    .rank-wrap {
      width: 26px;
      height: 26px;
      border-radius: 8px;
      display: grid;
      place-items: center;
      color: var(--gray);
      font-size: 12px;
      font-weight: 900;
      flex: 0 0 26px;
    }
    .rank-top { background: rgba(212, 175, 55, 0.14); color: var(--gold); }
    .leader-name { flex: 1; min-width: 0; color: var(--white); font-size: 13px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .leader-value { display: flex; align-items: baseline; gap: 3px; color: var(--white); font-size: 14px; font-weight: 950; }
    .leader-suffix { color: var(--gray); font-size: 10px; font-weight: 700; }
    .load-more {
      display: none;
      margin: 8px 12px 12px;
      min-height: 42px;
      border-radius: 12px;
      border: 1px solid rgba(212, 175, 55, 0.34);
      color: var(--gold);
      background: rgba(212, 175, 55, 0.09);
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0.5px;
      width: calc(100% - 24px);
    }
    .load-more.show { display: block; }

    .points-legend {
      margin-bottom: 12px;
      padding: 12px;
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 14px;
    }
    .legend-title {
      display: flex;
      align-items: center;
      gap: 7px;
      margin-bottom: 10px;
      color: var(--light-gray);
      font-size: 12px;
      font-weight: 900;
    }
    .legend-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
    }
    .legend-item {
      min-height: 58px;
      padding: 8px 4px;
      border-radius: 10px;
      background: var(--dark-gray);
      text-align: center;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 2px;
    }
    .legend-value { font-size: 16px; font-weight: 950; line-height: 1; }
    .legend-label { color: var(--gray); font-size: 9px; font-weight: 800; line-height: 1.2; }
    .rank-card { margin-bottom: 12px; overflow: hidden; box-shadow: none; }
    .rank-table-head, .rank-row {
      display: grid;
      grid-template-columns: 28px 34px minmax(0, 1fr) 58px 52px;
      align-items: center;
      gap: 6px;
      padding: 9px 12px;
    }
    .rank-table-head {
      background: var(--dark-gray);
      color: var(--gray);
      font-size: 9px;
      font-weight: 900;
      letter-spacing: 0.4px;
      text-transform: uppercase;
    }
    .rank-row {
      min-height: 48px;
      border-top: 1px solid rgba(26, 36, 69, 0.54);
    }
    .rank-position { color: var(--light-gray); font-size: 14px; font-weight: 950; }
    .rank-move {
      width: 26px;
      height: 26px;
      border-radius: 8px;
      display: grid;
      place-items: center;
      font-size: 13px;
      font-weight: 950;
    }
    .rank-move.up { color: var(--success); background: rgba(0, 200, 81, 0.12); }
    .rank-move.down { color: var(--danger); background: rgba(255, 68, 68, 0.12); }
    .rank-move.same { color: var(--gray); background: rgba(136, 146, 164, 0.10); }
    .rank-player { min-width: 0; color: var(--white); font-size: 13px; font-weight: 850; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .rank-points { color: var(--gold); font-size: 13px; font-weight: 950; text-align: right; }
    .rank-ath { color: var(--light-gray); font-size: 13px; font-weight: 850; text-align: right; }
    .rank-error {
      margin-bottom: 12px;
      padding: 12px;
      border-radius: 12px;
      border: 1px solid rgba(255, 68, 68, 0.36);
      background: rgba(255, 68, 68, 0.10);
      color: #ffb7b7;
      font-size: 12px;
      font-weight: 800;
      line-height: 1.4;
    }

    .profile-card { margin-bottom: 12px; padding: 16px; box-shadow: none; }
    .profile-card-title {
      display: flex;
      align-items: center;
      gap: 7px;
      margin-bottom: 14px;
      padding-left: 8px;
      border-left: 3px solid var(--gold);
      color: var(--gold);
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 2px;
    }
    .profile-field { margin-bottom: 14px; }
    .profile-label {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
      color: var(--gray);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.4px;
    }
    .profile-input, .profile-select, .date-input {
      width: 100%;
      height: 48px;
      border: 1px solid var(--card-border);
      border-radius: 12px;
      background: var(--dark-gray);
      color: var(--white);
      padding: 0 14px;
      outline: 0;
    }
    .profile-input[readonly] { color: var(--gray); opacity: 0.72; }
    .chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .choice-chip {
      min-height: 38px;
      border-radius: 20px;
      border: 1px solid var(--card-border);
      color: var(--gray);
      background: var(--dark-gray);
      padding: 0 14px;
      font-size: 13px;
      font-weight: 850;
    }
    .choice-chip.active { color: var(--cyan); border-color: var(--cyan); background: rgba(0, 240, 255, 0.12); }
    .style-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .style-card {
      border: 1px solid var(--card-border);
      border-radius: 12px;
      background: var(--dark-gray);
      color: var(--white);
      min-height: 68px;
      padding: 10px;
      text-align: center;
    }
    .style-card.active { border-color: var(--gold); background: rgba(212, 175, 55, 0.12); }
    .style-title { display: block; font-size: 13px; font-weight: 900; }
    .style-desc { display: block; margin-top: 4px; color: var(--gray); font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .photo-row { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
    .photo-actions { flex: 1; min-width: 0; }
    .file-input { width: 100%; color: var(--gray); font-size: 12px; }
    .save-row { display: flex; align-items: center; gap: 10px; }
    .save-row .gold-btn { flex: 1; }

    .empty-card {
      margin: 42px 4px 0;
      padding: 28px 24px;
      text-align: center;
      box-shadow: none;
    }
    .empty-icon { margin-bottom: 10px; color: var(--gray); font-size: 46px; }
    .empty-title { margin: 0; color: var(--white); font-size: 18px; font-weight: 900; }
    .empty-sub { margin: 8px 0 0; color: var(--gray); font-size: 13px; line-height: 1.45; }

    .loading {
      min-height: calc(100dvh - 150px);
      display: grid;
      place-items: center;
    }
    .spinner {
      width: 42px;
      height: 42px;
      border-radius: 999px;
      border: 4px solid rgba(212, 175, 55, 0.18);
      border-top-color: var(--gold);
      animation: spin 850ms linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .bottom-tabs {
      position: fixed;
      left: 50%;
      bottom: 0;
      transform: translateX(-50%);
      width: min(100%, 460px);
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      padding: 6px 4px calc(env(safe-area-inset-bottom, 0px) + 6px);
      background: var(--tab-bar);
      border-top: 1px solid var(--card-border);
      z-index: 20;
    }
    .bottom-tab {
      min-height: 50px;
      border: 0;
      background: transparent;
      color: var(--gray);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      font-size: 9px;
      font-weight: 700;
    }
    .bottom-tab .tab-icon { font-size: 18px; line-height: 1; }
    .bottom-tab.active { color: var(--gold); }

    .hidden { display: none !important; }
    .gold { color: var(--gold); }
    .cyan { color: var(--cyan); }
    .purple { color: var(--purple); }
    .orange { color: var(--orange); }
    .success { color: var(--success); }
    .danger { color: var(--danger); }
    .warning { color: var(--warning); }
    .white { color: var(--white); }
    .royal { color: var(--royal-blue); }
    .gray { color: var(--gray); }

    @media (min-width: 680px) {
      body { padding: 20px 0; }
      .app-shell {
        min-height: calc(100dvh - 40px);
        border: 1px solid rgba(26, 36, 69, 0.9);
        border-radius: 28px;
        box-shadow: 0 28px 80px rgba(0, 0, 0, 0.42);
        overflow: hidden;
      }
      .bottom-tabs { bottom: 20px; border-radius: 0 0 28px 28px; }
    }

    @media (max-width: 360px) {
      .stat-grid { gap: 8px; padding: 10px; }
      .stat-tile { min-height: 104px; }
      .summary-val { font-size: 18px; }
      .history-top { flex-direction: column; }
      .history-side { align-items: flex-start; }
      .style-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="app-shell">
    <section id="loginScreen" class="screen login-screen active" aria-label="Player login">
      <div class="login-wrap">
        <div class="net-row">
          <span class="net-dot" aria-hidden="true"></span>
          <span>Online</span>
        </div>

        <header class="brand">
          <div class="brand-mark" aria-hidden="true">Z</div>
          <h1 class="brand-title">CRICZODIAC</h1>
          <p class="brand-subtitle">Sign in to continue</p>
        </header>

        <form id="loginForm" class="login-card" autocomplete="off">
          <h2 class="card-heading">Welcome Back</h2>
          <p id="loginError" class="error-box" role="alert"></p>

          <label class="field" for="email">
            <span class="field-icon" aria-hidden="true">✉</span>
            <input id="email" name="email" type="email" placeholder="Email Address" autocomplete="username" autocapitalize="none" required>
          </label>

          <label class="field" for="password">
            <span class="field-icon" aria-hidden="true">🔒</span>
            <input id="password" name="password" type="password" placeholder="Password" autocomplete="current-password" required>
            <button id="togglePassword" class="icon-button" type="button" aria-label="Show password">👁</button>
          </label>

          <button id="loginButton" class="primary-btn" type="submit">SIGN IN</button>
        </form>

        <p class="footer-note">Zodiac Technologies • Indoor Cricket Manager</p>
      </div>
    </section>

    <section id="appScreen" class="screen app-screen" aria-label="Player app">
      <nav class="nav-bar">
        <div class="nav-logo" aria-hidden="true">Z</div>
        <div class="nav-info">
          <p id="navName" class="nav-name">Player</p>
          <div class="nav-subrow">
            <span id="navRole" class="nav-role">Player</span>
            <span id="clubBadge" class="club-badge hidden"></span>
          </div>
        </div>
        <span class="net-dot" aria-hidden="true"></span>
        <button id="logoutButton" class="nav-action" type="button" aria-label="Logout">↗</button>
      </nav>

      <div id="appLoading" class="loading">
        <div class="spinner" aria-label="Loading"></div>
      </div>

      <div id="noPlayerView" class="empty-card hidden">
        <div class="empty-icon">⊘</div>
        <h2 class="empty-title">No Player Profile</h2>
        <p class="empty-sub">Ask your admin to create a player profile linked to your account.</p>
      </div>

      <div id="appContent" class="hidden">
        <section id="dashboardPage" class="tab-page active" data-page="dashboard">
          <section id="dashboardSummary" class="summary-row"></section>
          <div id="dashboardCards"></div>
          <button class="card history-card" id="dashboardHistoryButton" type="button" style="width:100%; text-align:left; padding:16px; display:flex; align-items:center; gap:12px; color:var(--white);">
            <span class="card-icon cyan">◷</span>
            <span style="flex:1; font-weight:800;">View Match History</span>
            <span class="gray">›</span>
          </button>
        </section>

        <section id="statsPage" class="tab-page" data-page="stats">
          <div class="page-header">
            <div>
              <h2 class="page-title">My Stats</h2>
              <p class="page-subtitle">Completed match performance</p>
            </div>
          </div>
          <section id="statsHero" class="hero"></section>
          <section class="section-card">
            <header class="section-header gold"><span class="section-icon">🏏</span><span>BATTING</span></header>
            <div id="statsBattingGrid" class="stat-grid"></div>
          </section>
          <section class="section-card">
            <header class="section-header cyan"><span class="section-icon">🎯</span><span>BOWLING</span></header>
            <div id="statsBowlingGrid" class="stat-grid"></div>
          </section>
          <section class="section-card">
            <header class="section-header purple"><span class="section-icon">✋</span><span>FIELDING</span></header>
            <div id="statsFieldingGrid" class="stat-grid"></div>
          </section>
        </section>

        <section id="leaderboardPage" class="tab-page" data-page="leaderboard">
          <div class="page-header">
            <div>
              <h2 class="page-title">Leaderboard</h2>
              <p class="page-subtitle">Players with at least 20 completed matches</p>
            </div>
          </div>
          <div class="tab-switch" role="tablist" aria-label="Leaderboard type">
            <button id="leaderBattingTab" class="active" type="button">BATTING</button>
            <button id="leaderBowlingTab" type="button">BOWLING</button>
          </div>
          <div id="leaderMyStats"></div>
          <div id="leaderSections"></div>
        </section>

        <section id="rankingsPage" class="tab-page" data-page="rankings">
          <div class="page-header">
            <div>
              <h2 class="page-title">Rankings</h2>
              <p id="rankingsSubtitle" class="page-subtitle">Last 25 matches ranking points</p>
            </div>
          </div>
          <section class="points-legend" aria-label="Points legend">
            <div class="legend-title"><span class="gold">ⓘ</span><span>Points Legend</span></div>
            <div class="legend-grid">
              <div class="legend-item"><span class="legend-value gold">+1</span><span class="legend-label">Run</span></div>
              <div class="legend-item"><span class="legend-value cyan">+25</span><span class="legend-label">Wicket</span></div>
              <div class="legend-item"><span class="legend-value success">+5</span><span class="legend-label">Catch/Stump/RO</span></div>
              <div class="legend-item"><span class="legend-value danger">-0.5</span><span class="legend-label">Run conceded</span></div>
            </div>
          </section>
          <div id="rankingsSections"></div>
        </section>

        <section id="historyPage" class="tab-page" data-page="history">
          <div class="page-header">
            <div>
              <h2 class="page-title">Match History</h2>
              <p id="historySubtitle" class="page-subtitle">Your match timeline</p>
            </div>
            <span id="historyCount" class="count-badge hidden">0</span>
          </div>
          <div id="historyList"></div>
        </section>

        <section id="profilePage" class="tab-page" data-page="profile">
          <div class="page-header">
            <div>
              <h2 class="page-title">My Profile</h2>
              <p class="page-subtitle">Edit your player details</p>
            </div>
          </div>
          <p id="profileError" class="error-box"></p>
          <p id="profileSuccess" class="success-box"></p>
          <form id="profileForm">
            <section class="profile-card">
              <div class="profile-card-title">☻ PERSONAL INFO</div>
              <div class="photo-row">
                <div id="profileAvatar" class="avatar">?</div>
                <div class="photo-actions">
                  <label class="profile-label" for="profilePhoto">Profile Picture</label>
                  <input id="profilePhoto" class="file-input" type="file" accept="image/jpeg,image/png,image/webp">
                </div>
              </div>
              <div class="profile-field">
                <label class="profile-label" for="profileName">Full Name</label>
                <input id="profileName" class="profile-input" type="text" autocomplete="name" required>
              </div>
              <div class="profile-field">
                <label class="profile-label" for="profileEmail">Email <span class="pill meta-chip">Read only</span></label>
                <input id="profileEmail" class="profile-input" type="email" readonly>
              </div>
              <div class="profile-field">
                <label class="profile-label" for="profilePhone">Phone</label>
                <input id="profilePhone" class="profile-input" type="tel" autocomplete="tel">
              </div>
              <div class="profile-field">
                <label class="profile-label" for="profileJersey">Jersey No.</label>
                <input id="profileJersey" class="profile-input" type="number" min="0" inputmode="numeric">
              </div>
              <div class="profile-field" style="margin-bottom:0;">
                <label class="profile-label" for="profileDob">Date of Birth</label>
                <input id="profileDob" class="date-input" type="date">
              </div>
            </section>

            <section class="profile-card">
              <div class="profile-card-title">🏏 PLAYER TYPE</div>
              <div id="playerTypeChips" class="chip-row"></div>
            </section>

            <section class="profile-card">
              <div class="profile-card-title">✋ BATTING HAND</div>
              <div id="battingHandChips" class="chip-row"></div>
            </section>

            <section id="bowlingStyleCard" class="profile-card">
              <div class="profile-card-title">🎯 BOWLING STYLE</div>
              <div id="bowlingStyleGrid" class="style-grid"></div>
            </section>

            <div class="save-row">
              <button id="profileSaveButton" class="gold-btn" type="submit">SAVE</button>
            </div>
          </form>
        </section>
      </div>

      <nav class="bottom-tabs" aria-label="Player navigation">
        <button class="bottom-tab active" type="button" data-tab="dashboard"><span class="tab-icon">▦</span><span>Dashboard</span></button>
        <button class="bottom-tab" type="button" data-tab="stats"><span class="tab-icon">♜</span><span>Stats</span></button>
        <button class="bottom-tab" type="button" data-tab="leaderboard"><span class="tab-icon">🏆</span><span>Leaderboard</span></button>
        <button class="bottom-tab" type="button" data-tab="rankings"><span class="tab-icon">↕</span><span>Rankings</span></button>
        <button class="bottom-tab" type="button" data-tab="history"><span class="tab-icon">◷</span><span>History</span></button>
        <button class="bottom-tab" type="button" data-tab="profile"><span class="tab-icon">●</span><span>Profile</span></button>
      </nav>
    </section>
  </main>

  <script>
    const API = {
      login: '/api/v1/auth/login.php',
      myStats: '/api/v1/players/my-stats.php',
      matchHistory: '/api/v1/players/match-history.php',
      leaderboard: '/api/v1/players/leaderboard.php?limit=10&min_matches=20',
      rankings: '/api/v1/players/rankings.php?matches=25',
      profile: '/api/v1/users/profile.php',
      playerUpdate: '/api/v1/players/update.php',
      uploadProfile: '/api/v1/upload/profile-picture.php',
    };

    const STORE = {
      token: 'criczodiac_web_token',
      user: 'criczodiac_web_user',
    };

    const playerTypes = [
      { id: 'batsman', label: 'Batsman' },
      { id: 'bowler', label: 'Bowler' },
      { id: 'allrounder', label: 'All-rounder' },
    ];
    const battingHands = [
      { id: 'right', label: 'Right Hand' },
      { id: 'left', label: 'Left Hand' },
    ];
    const bowlingStyles = [
      { id: 'ra_fast', label: 'RA Fast', desc: 'Right Arm Fast' },
      { id: 'ra_medium', label: 'RA Medium', desc: 'Right Arm Medium Fast' },
      { id: 'ra_spin', label: 'RA Spin', desc: 'Right Arm Off Spin' },
      { id: 'leg_spin', label: 'Leg Spin', desc: 'Right Arm Leg Spin' },
      { id: 'la_fast', label: 'LA Fast', desc: 'Left Arm Fast' },
      { id: 'la_medium', label: 'LA Medium', desc: 'Left Arm Medium Fast' },
      { id: 'la_spin', label: 'LA Spin', desc: 'Left Arm Orthodox Spin' },
      { id: 'chinaman', label: 'Chinaman', desc: 'Left Arm Wrist Spin' },
      { id: 'none', label: 'Does Not Bowl', desc: 'Non-bowler' },
    ];
    const typeLabels = {
      batsman: 'Batsman',
      bowler: 'Bowler',
      allrounder: 'All-rounder',
      wicketkeeper: 'Keeper',
    };

    const state = {
      stats: null,
      history: [],
      leaderboard: null,
      rankings: null,
      rankingsError: '',
      userProfile: null,
      activeTab: 'dashboard',
      leaderTab: 'batting',
      leaderVisible: {},
      rankingsVisible: {},
      profileForm: {
        player_type: 'allrounder',
        batting_hand: 'right',
        bowling_style: '',
      },
    };

    const $ = (id) => document.getElementById(id);
    const els = {
      loginScreen: $('loginScreen'),
      appScreen: $('appScreen'),
      loginForm: $('loginForm'),
      loginButton: $('loginButton'),
      loginError: $('loginError'),
      email: $('email'),
      password: $('password'),
      togglePassword: $('togglePassword'),
      logoutButton: $('logoutButton'),
      appLoading: $('appLoading'),
      appContent: $('appContent'),
      noPlayerView: $('noPlayerView'),
      navName: $('navName'),
      navRole: $('navRole'),
      clubBadge: $('clubBadge'),
      dashboardSummary: $('dashboardSummary'),
      dashboardCards: $('dashboardCards'),
      statsHero: $('statsHero'),
      statsBattingGrid: $('statsBattingGrid'),
      statsBowlingGrid: $('statsBowlingGrid'),
      statsFieldingGrid: $('statsFieldingGrid'),
      leaderMyStats: $('leaderMyStats'),
      leaderSections: $('leaderSections'),
      leaderBattingTab: $('leaderBattingTab'),
      leaderBowlingTab: $('leaderBowlingTab'),
      rankingsSubtitle: $('rankingsSubtitle'),
      rankingsSections: $('rankingsSections'),
      historySubtitle: $('historySubtitle'),
      historyCount: $('historyCount'),
      historyList: $('historyList'),
      profileForm: $('profileForm'),
      profileError: $('profileError'),
      profileSuccess: $('profileSuccess'),
      profileAvatar: $('profileAvatar'),
      profilePhoto: $('profilePhoto'),
      profileName: $('profileName'),
      profileEmail: $('profileEmail'),
      profilePhone: $('profilePhone'),
      profileJersey: $('profileJersey'),
      profileDob: $('profileDob'),
      playerTypeChips: $('playerTypeChips'),
      battingHandChips: $('battingHandChips'),
      bowlingStyleCard: $('bowlingStyleCard'),
      bowlingStyleGrid: $('bowlingStyleGrid'),
      profileSaveButton: $('profileSaveButton'),
      dashboardHistoryButton: $('dashboardHistoryButton'),
    };

    function value(v) {
      return v === null || v === undefined || v === '' ? '—' : v;
    }

    function escapeHtml(text) {
      return String(value(text))
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
    }

    function normalizeImage(uri) {
      if (!uri) return '';
      if (/^https?:\/\//i.test(uri)) return uri;
      if (uri.startsWith('/')) return uri;
      return `/uploads/profiles/${uri}`;
    }

    function initial(name) {
      return (name || '?').trim().charAt(0).toUpperCase() || '?';
    }

    function playerType(profile) {
      return typeLabels[profile?.player_type] || profile?.player_type || 'Player';
    }

    function showLogin(message = '') {
      els.loginScreen.classList.add('active');
      els.appScreen.classList.remove('active');
      setLoginError(message);
      els.loginButton.disabled = false;
      els.loginButton.textContent = 'SIGN IN';
    }

    function showAppShell() {
      els.loginScreen.classList.remove('active');
      els.appScreen.classList.add('active');
      els.appLoading.classList.remove('hidden');
      els.appContent.classList.add('hidden');
      els.noPlayerView.classList.add('hidden');
    }

    function setLoginError(message) {
      els.loginError.textContent = message || '';
      els.loginError.classList.toggle('show', !!message);
    }

    function setProfileMessage(type, message) {
      const error = type === 'error' ? message : '';
      const success = type === 'success' ? message : '';
      els.profileError.textContent = error;
      els.profileError.classList.toggle('show', !!error);
      els.profileSuccess.textContent = success;
      els.profileSuccess.classList.toggle('show', !!success);
    }

    async function apiFetch(url, options = {}) {
      const token = localStorage.getItem(STORE.token);
      const isFormData = options.body instanceof FormData;
      const headers = {
        Accept: 'application/json',
        ...(!isFormData && options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      };
      const response = await fetch(url, { ...options, headers });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) {
        throw new Error(payload.message || 'Something went wrong. Please try again.');
      }
      return payload;
    }

    function renderAvatar(profile, sizeClass = '') {
      const image = normalizeImage(profile?.profile_pic);
      const name = profile?.full_name || profile?.name || 'Player';
      const cls = sizeClass ? `avatar ${sizeClass}` : 'avatar';
      return `<div class="${cls}">${renderAvatarContent(profile)}</div>`;
    }

    function renderAvatarContent(profile) {
      const image = normalizeImage(profile?.profile_pic);
      const name = profile?.full_name || profile?.name || 'Player';
      return image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(name)}">` : escapeHtml(initial(name));
    }

    function summaryRow(items) {
      return items.map((item, index) => `
        ${index > 0 ? '<div class="summary-div"></div>' : ''}
        <div class="summary-chip">
          <span class="summary-val ${item.color || 'white'}">${escapeHtml(item.value)}</span>
          <span class="summary-label">${escapeHtml(item.label)}</span>
        </div>
      `).join('');
    }

    function statRow(icon, label, val, color = 'white') {
      return `
        <div class="stat-row">
          <div class="stat-left"><span class="${color}">${icon}</span><span>${escapeHtml(label)}</span></div>
          <div class="stat-row-value ${color}">${escapeHtml(val)}</div>
        </div>
      `;
    }

    function statTile(icon, label, val, color = 'white') {
      return `
        <article class="stat-tile">
          <div class="stat-icon ${color}">${icon}</div>
          <div class="stat-value">${escapeHtml(val)}</div>
          <div class="stat-label">${escapeHtml(label)}</div>
        </article>
      `;
    }

    function card(icon, title, color, body) {
      return `
        <section class="card">
          <header class="card-header ${color}"><span class="card-icon">${icon}</span><span>${escapeHtml(title)}</span></header>
          <div class="card-body">${body}</div>
        </section>
      `;
    }

    function updateNav(profile) {
      const user = JSON.parse(localStorage.getItem(STORE.user) || '{}');
      const name = profile?.full_name || user.name || 'Player';
      els.navName.textContent = name;
      els.navRole.textContent = playerType(profile);
      if (profile?.club_name || user.club_name) {
        els.clubBadge.textContent = `🏆 ${profile?.club_name || user.club_name}`;
        els.clubBadge.classList.remove('hidden');
      } else {
        els.clubBadge.classList.add('hidden');
      }
    }

    function renderDashboard() {
      const data = state.stats;
      const profile = data.profile || {};
      const bat = data.batting || {};
      const bowl = data.bowling || {};
      const field = data.fielding || {};

      els.dashboardSummary.innerHTML = summaryRow([
        { label: 'Matches', value: bat.total_matches, color: 'white' },
        { label: 'Runs', value: bat.total_runs, color: 'gold' },
        { label: 'Wickets', value: bowl.total_wickets, color: 'cyan' },
        { label: 'Avg', value: bat.batting_average, color: 'orange' },
      ]);

      els.dashboardCards.innerHTML = [
        card('🏏', 'BATTING', 'gold', [
          statRow('📅', 'Matches', bat.total_matches, 'white'),
          statRow('#', 'Total Runs', bat.total_runs, 'gold'),
          statRow('🏆', 'Highest Score', bat.highest_score, 'gold'),
          statRow('↗', 'Batting Average', bat.batting_average, 'gold'),
          statRow('⏱', 'Strike Rate', bat.strike_rate, 'white'),
          statRow('🎯', 'Balls Faced', bat.total_balls, 'white'),
          statRow('4', 'Fours', bat.total_fours, 'royal'),
          statRow('6', 'Sixes', bat.total_sixes, 'purple'),
          statRow('🥈', 'Half Centuries', bat.fifties, 'cyan'),
          statRow('🥇', 'Centuries', bat.hundreds, 'gold'),
          statRow('✓', 'Not Outs', bat.not_outs, 'success'),
          statRow('0', 'Ducks', bat.ducks, 'danger'),
        ].join('')),
        card('🎯', 'BOWLING', 'cyan', [
          statRow('🎯', 'Wickets', bowl.total_wickets, 'cyan'),
          statRow('◷', 'Overs Bowled', bowl.total_overs, 'white'),
          statRow('⏱', 'Economy Rate', bowl.economy_rate, 'cyan'),
          statRow('★', 'Best Bowling', bowl.best_bowling, 'gold'),
          statRow('↑', 'Runs Conceded', bowl.total_runs_conceded, 'orange'),
          statRow('🛡', 'Maidens', bowl.total_maidens, 'success'),
          statRow('🏏', 'Innings Bowled', bowl.bowling_innings, 'white'),
        ].join('')),
        card('✋', 'FIELDING', 'purple', [
          statRow('✋', 'Catches', field.catches, 'purple'),
          statRow('🏃', 'Run Outs', field.run_outs, 'orange'),
          statRow('⚡', 'Stumpings', field.stumpings, 'gold'),
        ].join('')),
      ].join('');
    }

    function renderStats() {
      const data = state.stats;
      const profile = data.profile || {};
      const bat = data.batting || {};
      const bowl = data.bowling || {};
      const field = data.fielding || {};
      const meta = [
        profile.jersey_number ? `👕 #${profile.jersey_number}` : '',
        profile.club_name ? `🏆 ${profile.club_name}` : '',
        profile.batting_hand ? `✋ ${profile.batting_hand}-hand` : '',
        profile.bowling_style ? `🎯 ${profile.bowling_style}` : '',
      ].filter(Boolean);

      els.statsHero.innerHTML = `
        <div class="hero-row">
          ${renderAvatar(profile)}
          <div class="hero-info">
            <h2 class="hero-name">${escapeHtml(profile.full_name || 'Player')}</h2>
            <span class="type-badge">${escapeHtml(playerType(profile))}</span>
            <div class="hero-meta">${meta.map(m => `<span class="meta-chip">${escapeHtml(m)}</span>`).join('')}</div>
          </div>
        </div>
        <section class="summary-row">${summaryRow([
          { label: 'Matches', value: bat.total_matches, color: 'white' },
          { label: 'Runs', value: bat.total_runs, color: 'gold' },
          { label: 'Wickets', value: bowl.total_wickets, color: 'cyan' },
          { label: 'Avg', value: bat.batting_average, color: 'orange' },
        ])}</section>
      `;

      els.statsBattingGrid.innerHTML = [
        statTile('📅', 'Matches', bat.total_matches, 'gold'),
        statTile('#', 'Total Runs', bat.total_runs, 'gold'),
        statTile('🏆', 'Highest', bat.highest_score, 'gold'),
        statTile('↗', 'Average', bat.batting_average, 'gold'),
        statTile('⏱', 'Strike Rate', bat.strike_rate, 'gold'),
        statTile('🎯', 'Balls Faced', bat.total_balls, 'gold'),
        statTile('4', 'Fours', bat.total_fours, 'royal'),
        statTile('6', 'Sixes', bat.total_sixes, 'purple'),
        statTile('🥈', '50s', bat.fifties, 'cyan'),
        statTile('🥇', '100s', bat.hundreds, 'gold'),
        statTile('✓', 'Not Outs', bat.not_outs, 'success'),
        statTile('0', 'Ducks', bat.ducks, 'danger'),
      ].join('');
      els.statsBowlingGrid.innerHTML = [
        statTile('🎯', 'Wickets', bowl.total_wickets, 'cyan'),
        statTile('◷', 'Overs', bowl.total_overs, 'cyan'),
        statTile('⏱', 'Economy', bowl.economy_rate, 'cyan'),
        statTile('★', 'Best Figures', bowl.best_bowling, 'gold'),
        statTile('↑', 'Runs Given', bowl.total_runs_conceded, 'orange'),
        statTile('🛡', 'Maidens', bowl.total_maidens, 'success'),
        statTile('🏏', 'Innings', bowl.bowling_innings, 'cyan'),
      ].join('');
      els.statsFieldingGrid.innerHTML = [
        statTile('✋', 'Catches', field.catches, 'purple'),
        statTile('🏃', 'Run Outs', field.run_outs, 'orange'),
        statTile('⚡', 'Stumpings', field.stumpings, 'gold'),
      ].join('');
    }

    function resultClass(result) {
      const r = String(result || '').toUpperCase();
      if (r === 'WON') return 'result-won';
      if (r === 'LOST') return 'result-lost';
      if (r === 'TIE' || r === 'DRAW') return 'result-tie';
      return '';
    }

    function formatDate(raw) {
      if (!raw) return '';
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return raw;
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function perfChip(label, val, color = 'white') {
      return `<div class="perf-chip"><div class="perf-val ${color}">${escapeHtml(val)}</div><div class="perf-lbl">${escapeHtml(label)}</div></div>`;
    }

    function renderHistory() {
      const matches = state.history || [];
      els.historySubtitle.textContent = matches.length ? `${matches.length} match${matches.length === 1 ? '' : 'es'} played` : 'Your match timeline';
      els.historyCount.textContent = matches.length;
      els.historyCount.classList.toggle('hidden', matches.length === 0);

      if (!matches.length) {
        els.historyList.innerHTML = '<div class="empty-card"><div class="empty-icon">🏏</div><h2 class="empty-title">No Match History</h2><p class="empty-sub">Completed matches you played will appear here</p></div>';
        return;
      }

      els.historyList.innerHTML = matches.map(item => {
        const bat = item.batting;
        const bowl = item.bowling;
        const res = String(item.result || 'N/A').toUpperCase();
        const accent = res === 'WON' ? 'var(--success)' : res === 'LOST' ? 'var(--danger)' : 'var(--gray)';
        return `
          <article class="history-card">
            <div class="accent-bar" style="background:${accent}"></div>
            <div class="history-top">
              <div style="flex:1; min-width:0;">
                <p class="history-teams">${escapeHtml(item.team_a)} <span class="gray">vs</span> ${escapeHtml(item.team_b)}</p>
                <div class="meta-row">
                  ${item.series_name ? `<span class="meta-chip gold">🏆 ${escapeHtml(item.series_name)}</span>` : ''}
                  ${item.overs ? `<span class="meta-chip cyan">◷ ${escapeHtml(item.overs)} Overs</span>` : ''}
                  ${item.venue ? `<span class="meta-chip">⌖ ${escapeHtml(item.venue)}</span>` : ''}
                </div>
              </div>
              <div class="history-side">
                <span class="result-badge ${resultClass(res)}">${escapeHtml(res)}</span>
                <span class="gray" style="font-size:10px;">${escapeHtml(formatDate(item.match_date))}</span>
              </div>
            </div>
            ${item.result_text ? `<div class="history-result-row ${res === 'WON' ? 'success' : res === 'LOST' ? 'danger' : 'gray'}">● <span>${escapeHtml(item.result_text)}</span></div>` : ''}
            ${bat ? `
              <section class="history-section">
                <div class="perf-label gold">🏏 BATTING <span class="pill ${Number(bat.is_out) === 1 ? 'danger' : 'success'}">${Number(bat.is_out) === 1 ? escapeHtml(String(bat.dismissal_type || 'Out').replace('_', ' ')) : 'Not Out'}</span></div>
                <div class="perf-stats">
                  ${perfChip('Runs', bat.runs_scored, 'gold')}<div class="sep-v"></div>
                  ${perfChip('Balls', bat.balls_faced)}<div class="sep-v"></div>
                  ${perfChip('SR', bat.strike_rate)}<div class="sep-v"></div>
                  ${perfChip('4s', bat.fours, 'royal')}<div class="sep-v"></div>
                  ${perfChip('6s', bat.sixes, 'purple')}
                </div>
              </section>
            ` : '<section class="history-section"><span class="gray" style="font-size:12px; font-style:italic;">Did not bat</span></section>'}
            ${bowl ? `
              <section class="history-section">
                <div class="perf-label cyan">🎯 BOWLING</div>
                <div class="perf-stats">
                  ${perfChip('W/R', `${bowl.wickets}/${bowl.runs_conceded}`, 'cyan')}<div class="sep-v"></div>
                  ${perfChip('Overs', bowl.overs_bowled)}<div class="sep-v"></div>
                  ${perfChip('Econ', bowl.economy, 'cyan')}<div class="sep-v"></div>
                  ${perfChip('Maidens', bowl.maidens, 'success')}
                </div>
              </section>
            ` : ''}
          </article>
        `;
      }).join('');
    }

    function leaderRow(item, index, valueKey, suffix = '') {
      const top = index < 3;
      return `
        <div class="leader-row">
          <div class="rank-wrap ${top ? 'rank-top' : ''}">${top ? ['♛', '◉', '◎'][index] : index + 1}</div>
          ${renderAvatar({ full_name: item.full_name, profile_pic: item.profile_pic }, 'small')}
          <div class="leader-name">${escapeHtml(item.full_name)}</div>
          <div class="leader-value ${top ? 'gold' : ''}"><span>${escapeHtml(item[valueKey])}</span>${suffix ? `<span class="leader-suffix">${escapeHtml(suffix)}</span>` : ''}</div>
        </div>
      `;
    }

    function leaderSection(key, icon, title, color, rows, valueKey, suffix = '') {
      const visible = state.leaderVisible[key] || 5;
      const shown = (rows || []).slice(0, visible);
      return `
        <section class="leader-card">
          <header class="section-header ${color}"><span class="section-icon">${icon}</span><span>${escapeHtml(title)}</span></header>
          ${shown.length ? shown.map((item, idx) => leaderRow(item, idx, valueKey, suffix)).join('') : '<div class="empty-card" style="margin:0; border:0; border-radius:0; box-shadow:none;"><p class="empty-sub">No data yet</p></div>'}
          <button class="load-more ${(rows || []).length > shown.length && visible < 10 ? 'show' : ''}" type="button" data-load-section="${escapeHtml(key)}">Load More</button>
        </section>
      `;
    }

    function renderLeaderboard() {
      const data = state.leaderboard || {};
      const bat = data.batting || {};
      const bowl = data.bowling || {};
      els.leaderMyStats.innerHTML = data.my_stats ? `
        <section class="summary-row" style="border-color:rgba(212,175,55,0.34);">
          ${summaryRow([
            { label: 'Runs', value: data.my_stats.total_runs, color: 'gold' },
            { label: 'Sixes', value: data.my_stats.total_sixes, color: 'purple' },
            { label: 'Avg', value: data.my_stats.avg_score, color: 'orange' },
            { label: 'SR', value: data.my_stats.strike_rate, color: 'white' },
          ])}
        </section>
      ` : '';

      els.leaderSections.innerHTML = state.leaderTab === 'batting'
        ? [
          leaderSection('batting.top_averages', '↗', 'Top Averages', 'gold', bat.top_averages, 'average'),
          leaderSection('batting.top_scores', '🏃', 'Top Run Scorers', 'cyan', bat.top_scores, 'total_runs', 'runs'),
          leaderSection('batting.highest_score', '★', 'Highest Score', 'orange', bat.highest_score, 'best_score'),
          leaderSection('batting.most_sixes', '6', 'Most Sixes', 'purple', bat.most_sixes, 'total_sixes', 'x6'),
          leaderSection('batting.most_fours', '4', 'Most Fours', 'royal', bat.most_fours, 'total_fours', 'x4'),
        ].join('')
        : [
          leaderSection('bowling.top_wickets', '🎯', 'Top Wicket Takers', 'gold', bowl.top_wickets, 'total_wickets', 'wkts'),
          leaderSection('bowling.best_economy', '⏱', 'Best Economy', 'success', bowl.best_economy, 'economy'),
          leaderSection('bowling.worst_economy', '↑', 'Highest Economy', 'danger', bowl.worst_economy, 'economy'),
          leaderSection('bowling.most_runs_conceded', '🔥', 'Most Runs Conceded', 'orange', bowl.most_runs_conceded, 'runs_conceded', 'rc'),
        ].join('');

      els.leaderBattingTab.classList.toggle('active', state.leaderTab === 'batting');
      els.leaderBowlingTab.classList.toggle('active', state.leaderTab === 'bowling');
    }

    function formatRankPoints(raw) {
      const number = Number(raw || 0);
      return Number.isInteger(number) ? String(number) : number.toFixed(1);
    }

    function rankMovement(movement) {
      if (movement === 'down') return { cls: 'down', icon: '↓' };
      if (movement === 'up') return { cls: 'up', icon: '↑' };
      return { cls: 'same', icon: '−' };
    }

    function rankRow(item) {
      const move = rankMovement(item.movement);
      return `
        <div class="rank-row">
          <div class="rank-position">${escapeHtml(item.standing)}</div>
          <div class="rank-move ${move.cls}" aria-label="${escapeHtml(move.cls)}">${move.icon}</div>
          <div class="rank-player">${escapeHtml(item.full_name)}</div>
          <div class="rank-points">${escapeHtml(formatRankPoints(item.points))}</div>
          <div class="rank-ath">${escapeHtml(formatRankPoints(item.ath))}</div>
        </div>
      `;
    }

    function rankingSection(key, icon, title, color, rows) {
      const visible = state.rankingsVisible[key] || 5;
      const shown = (rows || []).slice(0, visible);
      return `
        <section class="leader-card rank-card">
          <header class="section-header ${color}"><span class="section-icon">${icon}</span><span>${escapeHtml(title)}</span></header>
          <div class="rank-table-head">
            <span>#</span><span>Move</span><span>Name</span><span style="text-align:right;">Points</span><span style="text-align:right;">ATH</span>
          </div>
          ${shown.length ? shown.map(rankRow).join('') : '<div class="empty-card" style="margin:0; border:0; border-radius:0; box-shadow:none;"><p class="empty-sub">No ranking data yet</p></div>'}
          <button class="load-more ${(rows || []).length > shown.length ? 'show' : ''}" type="button" data-ranking-section="${escapeHtml(key)}">View More</button>
        </section>
      `;
    }

    function renderRankings() {
      const data = state.rankings || {};
      const matchCount = data.meta?.currentMatchCount || 25;
      els.rankingsSubtitle.textContent = `Last ${matchCount} matches ranking points`;
      els.rankingsSections.innerHTML = [
        state.rankingsError ? `<div class="rank-error">Rankings API: ${escapeHtml(state.rankingsError)}</div>` : '',
        rankingSection('batting', '🏏', 'Batting', 'gold', data.batting),
        rankingSection('bowling', '🎯', 'Bowling', 'cyan', data.bowling),
        rankingSection('allRounder', '★', 'All-rounder', 'success', data.allRounder),
      ].join('');
    }

    function renderChoiceChips(container, options, activeValue, onSelectName) {
      container.innerHTML = options.map(opt => `
        <button class="choice-chip ${opt.id === activeValue ? 'active' : ''}" type="button" data-${onSelectName}="${escapeHtml(opt.id)}">${escapeHtml(opt.label)}</button>
      `).join('');
    }

    function supportsBowlingStyle() {
      return ['bowler', 'allrounder'].includes(state.profileForm.player_type);
    }

    function renderProfile() {
      const data = state.stats || {};
      const profile = data.profile || {};
      const userProfile = state.userProfile || {};
      const form = state.profileForm;
      const name = userProfile.name || profile.full_name || '';

      els.profileAvatar.innerHTML = renderAvatarContent({ full_name: name, profile_pic: profile.profile_pic });
      els.profileName.value = name;
      els.profileEmail.value = userProfile.email || '';
      els.profilePhone.value = userProfile.phone || '';
      els.profileJersey.value = profile.jersey_number || '';
      els.profileDob.value = profile.date_of_birth || '';

      renderChoiceChips(els.playerTypeChips, playerTypes, form.player_type, 'player-type');
      renderChoiceChips(els.battingHandChips, battingHands, form.batting_hand, 'batting-hand');
      els.bowlingStyleCard.classList.toggle('hidden', !supportsBowlingStyle());
      els.bowlingStyleGrid.innerHTML = bowlingStyles.map(style => `
        <button class="style-card ${style.id === form.bowling_style ? 'active' : ''}" type="button" data-bowling-style="${escapeHtml(style.id)}">
          <span class="style-title">${escapeHtml(style.label)}</span>
          <span class="style-desc">${escapeHtml(style.desc)}</span>
        </button>
      `).join('');
    }

    function renderAll() {
      if (!state.stats?.has_player) {
        const user = JSON.parse(localStorage.getItem(STORE.user) || '{}');
        els.navName.textContent = user.name || 'Player';
        els.navRole.textContent = user.role || 'Player';
        els.appLoading.classList.add('hidden');
        els.appContent.classList.add('hidden');
        els.noPlayerView.classList.remove('hidden');
        return;
      }

      updateNav(state.stats.profile);
      renderDashboard();
      renderStats();
      renderHistory();
      renderLeaderboard();
      renderRankings();
      renderProfile();
      setActiveTab(state.activeTab);
      els.appLoading.classList.add('hidden');
      els.noPlayerView.classList.add('hidden');
      els.appContent.classList.remove('hidden');
    }

    function setActiveTab(tabName) {
      state.activeTab = tabName;
      document.querySelectorAll('.tab-page').forEach(page => {
        page.classList.toggle('active', page.dataset.page === tabName);
      });
      document.querySelectorAll('.bottom-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
      });
      window.scrollTo({ top: 0, behavior: 'instant' });
    }

    async function loadApp() {
      showAppShell();
      try {
        const [stats, history, leaderboard, rankings, profile] = await Promise.all([
          apiFetch(API.myStats),
          apiFetch(API.matchHistory).catch(() => ({ matches: [] })),
          apiFetch(API.leaderboard).catch(() => ({})),
          apiFetch(API.rankings).catch(error => ({ __error: error.message || 'Unable to load rankings.' })),
          apiFetch(API.profile).catch(() => ({ profile: null })),
        ]);
        state.stats = stats;
        state.history = history.matches || [];
        state.leaderboard = leaderboard;
        state.rankingsError = rankings.__error || '';
        state.rankings = rankings.__error ? null : rankings;
        state.userProfile = profile.profile || null;
        const p = stats.profile || {};
        state.profileForm = {
          player_type: p.player_type || 'allrounder',
          batting_hand: p.batting_hand || 'right',
          bowling_style: p.player_type === 'batsman' ? '' : p.bowling_style || '',
        };
        renderAll();
      } catch (error) {
        localStorage.removeItem(STORE.token);
        showLogin(error.message || 'Please sign in again.');
      }
    }

    async function saveProfile(event) {
      event.preventDefault();
      setProfileMessage('', '');
      const name = els.profileName.value.trim();
      if (!name) {
        setProfileMessage('error', 'Name is required.');
        return;
      }
      els.profileSaveButton.disabled = true;
      els.profileSaveButton.textContent = 'SAVING...';
      try {
        const profile = state.stats?.profile || {};
        const file = els.profilePhoto.files?.[0];
        if (file && profile.id) {
          const fd = new FormData();
          fd.append('profile_pic', file);
          fd.append('player_id', String(profile.id));
          await apiFetch(API.uploadProfile, { method: 'POST', body: fd });
        }
        await apiFetch(API.profile, {
          method: 'POST',
          body: JSON.stringify({
            name,
            phone: els.profilePhone.value.trim() || undefined,
          }),
        });
        if (profile.id) {
          await apiFetch(API.playerUpdate, {
            method: 'POST',
            body: JSON.stringify({
              player_type: state.profileForm.player_type,
              batting_hand: state.profileForm.batting_hand,
              bowling_style: supportsBowlingStyle() ? state.profileForm.bowling_style || null : null,
              jersey_number: els.profileJersey.value || null,
              date_of_birth: els.profileDob.value || null,
            }),
          });
        }
        els.profilePhoto.value = '';
        setProfileMessage('success', 'Profile updated successfully.');
        await loadApp();
        setActiveTab('profile');
      } catch (error) {
        setProfileMessage('error', error.message || 'Failed to save profile.');
      } finally {
        els.profileSaveButton.disabled = false;
        els.profileSaveButton.textContent = 'SAVE';
      }
    }

    els.loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      setLoginError('');
      els.loginButton.disabled = true;
      els.loginButton.textContent = 'Signing In...';
      try {
        const payload = await apiFetch(API.login, {
          method: 'POST',
          body: JSON.stringify({
            email: els.email.value.trim(),
            password: els.password.value,
          }),
        });
        localStorage.setItem(STORE.token, payload.token);
        localStorage.setItem(STORE.user, JSON.stringify(payload.user || {}));
        state.activeTab = 'dashboard';
        await loadApp();
      } catch (error) {
        setLoginError(error.message);
      } finally {
        els.loginButton.disabled = false;
        els.loginButton.textContent = 'SIGN IN';
      }
    });

    els.togglePassword.addEventListener('click', () => {
      const showing = els.password.type === 'text';
      els.password.type = showing ? 'password' : 'text';
      els.togglePassword.textContent = showing ? '👁' : '🙈';
      els.togglePassword.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    });

    els.logoutButton.addEventListener('click', () => {
      localStorage.removeItem(STORE.token);
      localStorage.removeItem(STORE.user);
      els.password.value = '';
      state.stats = null;
      state.history = [];
      state.leaderboard = null;
      state.rankings = null;
      state.rankingsError = '';
      state.rankingsVisible = {};
      state.activeTab = 'dashboard';
      showLogin();
    });

    document.querySelectorAll('.bottom-tab').forEach(tab => {
      tab.addEventListener('click', () => setActiveTab(tab.dataset.tab));
    });

    els.dashboardHistoryButton.addEventListener('click', () => setActiveTab('history'));

    els.leaderBattingTab.addEventListener('click', () => {
      state.leaderTab = 'batting';
      renderLeaderboard();
    });
    els.leaderBowlingTab.addEventListener('click', () => {
      state.leaderTab = 'bowling';
      renderLeaderboard();
    });

    els.leaderSections.addEventListener('click', (event) => {
      const button = event.target.closest('[data-load-section]');
      if (!button) return;
      const key = button.dataset.loadSection;
      state.leaderVisible[key] = Math.min(10, (state.leaderVisible[key] || 5) + 5);
      renderLeaderboard();
    });

    els.rankingsSections.addEventListener('click', (event) => {
      const button = event.target.closest('[data-ranking-section]');
      if (!button) return;
      const key = button.dataset.rankingSection;
      state.rankingsVisible[key] = (state.rankingsVisible[key] || 5) + 5;
      renderRankings();
    });

    els.playerTypeChips.addEventListener('click', (event) => {
      const button = event.target.closest('[data-player-type]');
      if (!button) return;
      state.profileForm.player_type = button.dataset.playerType;
      if (state.profileForm.player_type === 'batsman') state.profileForm.bowling_style = '';
      renderProfile();
    });
    els.battingHandChips.addEventListener('click', (event) => {
      const button = event.target.closest('[data-batting-hand]');
      if (!button) return;
      state.profileForm.batting_hand = button.dataset.battingHand;
      renderProfile();
    });
    els.bowlingStyleGrid.addEventListener('click', (event) => {
      const button = event.target.closest('[data-bowling-style]');
      if (!button) return;
      state.profileForm.bowling_style = state.profileForm.bowling_style === button.dataset.bowlingStyle ? '' : button.dataset.bowlingStyle;
      renderProfile();
    });
    els.profileForm.addEventListener('submit', saveProfile);

    if (localStorage.getItem(STORE.token)) {
      loadApp();
    } else {
      showLogin();
    }
  </script>
</body>
</html>
