# Setting up Northside BJJ on MatOS

For you, at the academy before or after training. You'll have your laptop and phone, and the coach will have a laptop.

**Time:** 30–45 minutes together, plus 10 minutes at home first.

**Site:** https://matos-pi.vercel.app

## Who ends up with what

| Person        | Role    | How they get in                                         |
| ------------- | ------- | ------------------------------------------------------- |
| Head coach    | Owner   | A link you make at home (Part 1)                        |
| Other coaches | Coach   | A link the head coach makes in the setup steps          |
| You           | Athlete | An invite, signing in with your existing MatOS password |
| Members       | Athlete | A QR code or a link                                     |

## Part 1: at home, before you go

1. **Get from the coach:** their email address, and how they spell their name.
2. **Ask them to bring, if they can:**
   - the timetable (days, times, class lengths);
   - the member list (names, emails, belts; a spreadsheet or even a WhatsApp list works);
   - the waiver text, if they have one;
   - their monthly prices.
3. **Create the academy.** In a terminal, from the project folder:

   ```
   npm run provision-gym -- --name "Northside BJJ" --owner-email COACH_EMAIL --owner-first FIRSTNAME --owner-last SURNAME --owner-belt black --timezone Europe/Dublin --app-url https://matos-pi.vercel.app
   ```

   Change the belt if needed.

4. **Save the link it prints.** Send it to yourself, because you'll need it at the academy. It works once and lasts 7 days. Treat it like a password: anyone holding it can claim the owner account.
5. **Check your own password.** Sign in at the site with your personal email. You'll need this password in Part 3. If you've forgotten it, run this and open the link:

   ```
   npm run provision-gym -- --owner-reset --owner-email YOUR_EMAIL --app-url https://matos-pi.vercel.app
   ```

**If something goes wrong:**

- **The script reports an error, or says that gym or email already exists:** don't run it again with changes. Copy the message and ask Claude first.
- **The owner link was lost or has expired:** run this for a new one:

  ```
  npm run provision-gym -- --relink --owner-email COACH_EMAIL --app-url https://matos-pi.vercel.app
  ```

## Part 2: at the academy, on the coach's laptop

Let the coach do the typing. You'll spot what's confusing, and they'll remember how it works.

### 1. Claim the account

Open the owner link on the coach's laptop. They set a password and tick the consent box. MatOS then opens the setup steps by itself.

If they stop at any point, they can sign in again later and continue. "Skip" or "Finish later" loses nothing that has been saved.

### 2. Work through the setup steps

| Step             | What to do                                                                                    | Tip                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Your academy** | Check the name, add the address and contact email, and confirm the time zone is Europe/Dublin | Check-in times depend on this zone                                       |
| **Timetable**    | Add each weekly class: name, type, day, start time, length                                    | Set Programme (Kids, Fundamentals and so on) and Coach if they know them |
| **Coaches**      | Add other coaches, then give each their link                                                  | Skip it if the head coach runs everything; they can add coaches later    |
| **Members**      | Paste the list or upload the CSV, fix anything flagged in red, then import                    | Add each person's real belt, stripes and join date                       |
| **Invites**      | Choose who to invite, then use Print sheet, or send links by WhatsApp                         | Each link is personal, works once and lasts 7 days                       |
| **Done**         | Finish                                                                                        | Lands on the Dashboard                                                   |

**About kids:** leave the email blank for a child. They appear on the roster with no login, and a coach can mark them present or they can use a kiosk. To give a parent a login, open the child's profile and add them under **Parents**.

**About payments:** MatOS won't show old months as overdue. It only counts months from now on.

### 3. Settings the head coach should check

These are under **Settings**. Do them today if you have time; none of them should hold up the rest.

- **Membership plans:** add real names and prices. Prices only pre-fill the payment form; MatOS doesn't charge anyone.
- **Waiver:** paste the waiver text and publish it. Members are then asked to sign. Have the coach read it first, because it's their legal text.
- **Promotions:** classes and months per stripe. The defaults are 30 classes or 3 months.
- **Logo:** upload the academy's logo, if they have one to hand.

Leave **Free trial link** and **Front-desk kiosk** for another day unless the coach asks for them.

## Part 3: you, on your phone

1. Have the coach add you as a member, using **your personal email**, then invite you. If you were on the roster they imported, they only need to invite you.
2. Open your invite link. It will say this email already has a MatOS account, so enter your existing password.
3. You'll land on your athlete **Home** page. If you have more than one workspace, use the switcher in the menu to change between them.

### Quick test together

Run this once while you're both there:

1. **Check in on your phone.** Check-in opens 30 minutes before a class and closes when it ends, so you need a class in that window. If there isn't one, have the coach add a temporary class for today. Afterwards, remove your check-in under Attendance and then delete the class, because a class with check-ins can't be deleted.
2. **Coach:** open **Attendance** and confirm your check-in appears.
3. **Coach:** open **Payments** and mark yourself as paid for this month.
4. **You:** refresh Home and confirm your membership shows as paid.
5. **Coach:** open the assistant button and ask "who's overdue?"
6. **Coach:** post a test announcement, check that it shows on your Home page, then take it down.

## Before you leave

- [ ] Coach can sign in by themselves on their laptop
- [ ] Coach has saved their password somewhere safe
- [ ] Printed QR sheet, or links sent to members
- [ ] Coach knows who to ask when something goes wrong (you)
- [ ] Agreed when you'll check in again, for example after one week

**What to tell members:** "Scan your QR code, set a password, and check in on your phone when you arrive at class." On a phone they can also add the site to their home screen so it opens like an app. There's no App Store app yet.

## If something goes wrong on the day

| Problem                                             | What to do                                                                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| A member forgot their password                      | Coach opens the member's profile and creates a reset link. It works once, for 1 hour                                                 |
| An invite link expired or was lost                  | Coach opens the member's profile and sends a new invite                                                                              |
| The head coach forgot their password                | You run the `--owner-reset` command from Part 1, using the coach's email                                                             |
| A member can't check in                             | Check the time: it's only open from 30 minutes before a class until it ends. Otherwise the coach marks them present under Attendance |
| Someone was imported with the wrong belt or details | Coach edits them on their profile                                                                                                    |
| A check-in went to the wrong person                 | Coach removes it under Attendance                                                                                                    |
| Anything else                                       | Write down what happened and what the screen said, and carry on. Bring it to Claude afterwards                                       |

Email isn't switched on yet, so MatOS won't email invites or password resets. Everything goes by link or QR code. `matos_email_setup.md` covers this for when you get a domain.
