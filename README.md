# My Paisa

A personal money dashboard that runs on your own computer. No Docker, no database server, no accounts, and no internet connection needed once it's running.

## What it includes

- **Overview:** income, spending, investments and what's left each month, with a spending breakdown, budget progress and insights.
- **Transactions:** add and delete income, spending and investments by category.
- **Budgets:** monthly limits per category, with warnings at 80% and when you go over.
- **Loan:** outstanding balance, progress, payments, a 12-month projected schedule, and a prepayment simulator.
- **Goals:** savings goals with progress and updates.
- **Settings:** salary, EMI, loan details and interest rate.
- **Backup:** download all your data as one file, and restore from it.

## Setup on Windows (one time)

1. Install **Node.js LTS** from https://nodejs.org. Accept the default options.
2. Unzip this folder anywhere, for example `Documents\my-paisa`.
3. Double-click **start-windows.bat**. A terminal window stays open while the app runs.
4. Open **http://127.0.0.1:3000** in your browser.
5. The first time, create a password of at least 8 characters.

There's nothing to install with npm. The app uses only tools built into Node.js.

## Daily use

- Run **start-windows.bat** and open http://127.0.0.1:3000.
- Close the terminal window (or press Ctrl+C in it) to stop the app.
- Sign out with the **Sign out** button when you're done on a shared computer.

## Where your data is

All data is saved in `data\paisa.json` inside the project folder.

- **Back it up:** use **Settings → Download backup**, or copy the `data` folder somewhere safe.
- **Restore:** use **Settings → Restore from file**. This replaces your current data.
- **Start over:** stop the app and delete the `data` folder.

Keep in mind that `paisa.json` is a plain, unencrypted file. The password protects the app in your browser, but anyone with access to your Windows account can open the file directly. Use Windows account protection and BitLocker if that matters to you.

## Settings for your numbers

Open the **Settings** tab and enter your take-home salary, monthly EMI, original loan amount, principal paid so far, and interest rate. The loan balance, time left, schedule and simulator all use these values. Enter the interest rate from your loan statement; if you leave it at 0, the calculations ignore interest.

## Known limitations

- **Single user.** One password, one set of data.
- **Changing the password isn't supported yet.** To reset, stop the app, delete the `data` folder and set a new password. This also deletes your data.
- **Sessions reset when the app restarts.** You'll need to sign in again.
- **The loan schedule is a projection.** It uses the balance, EMI and rate you entered, so it can differ from your bank's figures. Check against your loan statement.
- **No bank or UPI import.** Transactions are entered by hand.
- **Tested on Windows 11 with Node.js only** (no Docker). Other operating systems should work, but haven't been tested.

## Install from GitHub

If you have Git installed, you can get the project with:

```
git clone https://github.com/YOUR-USERNAME/my-paisa.git
cd my-paisa
```

Or download the ZIP from the repository page with **Code → Download ZIP**, then extract it. Then follow **Setup on Windows** above.

## License

My Paisa is free software released under the **GNU Affero General Public License v3.0** (AGPL-3.0). See the [LICENSE](LICENSE) file for the full text.

In short, you may use, study, share, and change this software. If you distribute a modified version, or run a modified version as a service that other people use over a network, you must make its source code available to those users under the same license.

## Files

- `server.js`: the server, password login, and data storage.
- `public/index.html`: the dashboard.
- `start-windows.bat`: Windows launcher.
- `package.json`: lets you run `npm start` on any system with Node.js.
- `data/`: created automatically on first save. Never committed to Git.
- `LICENSE`: the AGPL-3.0 license text.
