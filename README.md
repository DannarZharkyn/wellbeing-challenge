# Wellbeing Challenge

A Boston University Student Wellbeing challenge platform with student and administrator interfaces.

## Live application

[Open the Wellbeing Challenge](https://wellbeing-challenge-three.vercel.app/)

Administrator dashboard: [wellbeing-challenge-three.vercel.app/admin](https://wellbeing-challenge-three.vercel.app/admin)

## Automated tests

Run the fast calculation and component tests:

```bash
npm test
```

The first time you run the full browser journey, install its local Chromium browser:

```bash
npx playwright install chromium
```

Then run the student journey in a real browser:

```bash
npm run test:e2e
```

For an interactive Playwright window that lets you watch and inspect each step:

```bash
npm run test:e2e:ui
```

The browser test uses isolated Supabase responses and does not create students or change scores in
the production database.
