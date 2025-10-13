# Email Magic Link Authentication for Development

Yes! You can **skip OAuth configuration completely in development** by using email magic link authentication. This is much simpler for local development and testing.

## How It Works

Outline's email plugin provides "magic link" authentication where users receive a sign-in link via email. In **development mode**, email functionality is automatically enabled without requiring SMTP configuration.

## Key Benefits for Development

✅ **No OAuth setup needed** - Skip the complexity of configuring Google, Slack, Azure, etc.
✅ **No SMTP server needed** - Emails are logged to console in development
✅ **Fast iteration** - Sign in without leaving your terminal
✅ **Automatic activation** - Enabled by default when `NODE_ENV=development`

## Requirements

The email magic link authentication requires:

1. **Development environment**: `NODE_ENV=development`
2. **SMTP_FROM_EMAIL configured**: Just set any valid email format
3. **Guest sign-in enabled**: On by default for new teams

That's it! No SMTP server, no OAuth credentials needed.

## Configuration

### Minimal .env for Development with Email Auth

```bash
NODE_ENV=development
URL=http://local.outline.dev:3030
PORT=3030

SECRET_KEY=your_generated_secret_key
UTILS_SECRET=your_generated_utils_secret

DATABASE_URL=postgres://outline:outline@localhost:5432/outline
REDIS_URL=redis://localhost:6379

# Email authentication - just needs a valid email format
SMTP_FROM_EMAIL=outline@local.outline.dev

# File storage - uses local ./data directory
FILE_STORAGE=local
FILE_STORAGE_LOCAL_ROOT_DIR=./data
```

### How EMAIL_ENABLED Works

From `server/env.ts:393-394`:
```typescript
public EMAIL_ENABLED =
  !!(this.SMTP_HOST || this.SMTP_SERVICE) || this.isDevelopment;
```

**Translation**: Email authentication is enabled if:
- You have `SMTP_HOST` configured, OR
- You have `SMTP_SERVICE` configured, OR
- **You're in development mode** ✨

This means in development (`NODE_ENV=development`), you automatically get email authentication without any SMTP configuration!

## How to Sign In During Development

### Step 1: Start Your Application
```bash
./scripts/start.sh
```

### Step 2: Access the Sign-In Page
Navigate to: `http://local.outline.dev:3030`

### Step 3: Enter Your Email
You'll see an "Email sign-in" option. Enter any email address.

### Step 4: Check Console Logs
Instead of sending real emails, Outline logs the magic link to your console output:

```
[INFO] Email: Sign-in link requested
[DEBUG] Magic link: http://local.outline.dev:3030/auth/email.callback?token=abc123...
[DEBUG] Or use code: 123456 at http://local.outline.dev:3030/auth/email.callback?email=user@example.com
```

### Step 5: Use the Link or Code
**Option A - Magic Link (Recommended)**:
- Copy the full URL from console
- Paste into browser
- You're signed in!

**Option B - Verification Code**:
- Copy the 6-digit code from console
- Enter it on the sign-in page
- You're signed in!

## Understanding the Flow

### Backend: plugins/email/server/auth/email.ts

The email authentication flow:

1. **Request magic link** (`POST /auth/email`):
   - User enters email address
   - System checks if user exists in team
   - Generates JWT token + 6-digit OTP code
   - In production: Sends email via SMTP
   - In development: Logs to console ✨

2. **Verify and sign in** (`GET /auth/email.callback`):
   - User clicks link with token or enters code
   - Token/code is validated
   - User session is created
   - Redirects to app

### How It's Enabled

From `server/models/Team.ts:213-215`:
```typescript
get emailSigninEnabled(): boolean {
  return this.guestSignin && env.EMAIL_ENABLED;
}
```

**Requirements**:
- `guestSignin` must be `true` (default for new teams)
- `EMAIL_ENABLED` must be `true` (automatic in development!)

## First-Time User Setup

When you first sign in with an email address that doesn't exist:

1. **Create the team first**:
   - You'll need at least one OAuth provider configured, OR
   - Use the database to create a team and user manually

2. **Or create via API/Database**:
```sql
-- Connect to PostgreSQL
docker exec -it outline-postgres psql -U outline -d outline

-- Create a team
INSERT INTO teams (id, name, subdomain, "guestSignin", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'My Team',
  'myteam',
  true,
  NOW(),
  NOW()
);

-- Create a user
INSERT INTO users (id, email, name, "teamId", "isAdmin", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'admin@example.com',
  'Admin User',
  (SELECT id FROM teams WHERE subdomain = 'myteam'),
  true,
  NOW(),
  NOW()
);
```

3. **Then sign in with email magic link**

## Development Workflow

### Typical Daily Development

```bash
# 1. Start infrastructure (if not running)
docker-compose start

# 2. Start Outline with watch mode
./scripts/start.sh watch

# 3. Open browser to http://local.outline.dev:3030

# 4. Sign in:
#    - Enter: admin@example.com
#    - Check console for magic link
#    - Copy and paste link into browser
#    - Done!
```

### Testing Different Users

```bash
# Each time you need to sign in as a different user:
# 1. Enter the email address
# 2. Check console for the new magic link
# 3. Use the link

# No need to configure multiple OAuth accounts!
```

## Console Output Example

When you request a magic link in development, you'll see:

```
[INFO] [email] Sign-in email requested for: user@example.com
[DEBUG] [mailer] Development mode: Email not sent
[DEBUG] [mailer] ====================================
[DEBUG] [mailer] From: outline@local.outline.dev
[DEBUG] [mailer] To: user@example.com
[DEBUG] [mailer] Subject: Sign in to My Team
[DEBUG] [mailer] ====================================
[DEBUG] [mailer] Magic Link:
[DEBUG] [mailer] http://local.outline.dev:3030/auth/email.callback?token=eyJhbGc...
[DEBUG] [mailer]
[DEBUG] [mailer] Or enter this code: 745291
[DEBUG] [mailer] At: http://local.outline.dev:3030/auth/email.callback?email=user@example.com
[DEBUG] [mailer] ====================================
```

## Enabling Guest Sign-In

If email sign-in doesn't appear, guest sign-in might be disabled:

### Via Database
```sql
docker exec -it outline-postgres psql -U outline -d outline

UPDATE teams SET "guestSignin" = true;
```

### Via Settings (if you can sign in with OAuth)
1. Sign in with OAuth
2. Go to Settings → Security
3. Enable "Guest sign-in"

## When to Use Production Email (SMTP)

You'll need real SMTP configuration when:
- Testing actual email delivery
- Testing email templates
- Preparing for production deployment
- Testing with external users who need real emails

### Production SMTP Setup

Add to your `.env`:

```bash
# Use a well-known service
SMTP_SERVICE=gmail
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-specific-password
SMTP_FROM_EMAIL=your-email@gmail.com

# Or use custom SMTP
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=your-username
SMTP_PASSWORD=your-password
SMTP_FROM_EMAIL=noreply@example.com
SMTP_SECURE=false
SMTP_TLS_CERTS=
```

**Well-known services supported**: Gmail, Outlook, Yahoo, SendGrid, Mailgun, etc.
See: https://community.nodemailer.com/2-0-0-beta/setup-smtp/well-known-services/

## Advantages Over OAuth for Development

| Feature | Email Magic Link | OAuth (Google/Azure/etc) |
|---------|------------------|--------------------------|
| **Setup time** | < 1 minute | 15-30 minutes |
| **External dependencies** | None | OAuth provider account |
| **Configuration** | 1 env var | 3+ env vars |
| **Works offline** | ✅ Yes | ❌ No |
| **Test multiple users** | ✅ Easy | 🟡 Need multiple accounts |
| **Console-based** | ✅ Yes | ❌ Requires browser flow |
| **Fast iteration** | ✅ Very fast | 🟡 Slower |

## Troubleshooting

### "Email sign-in is not enabled"

**Check these**:
```bash
# 1. Verify NODE_ENV
echo $NODE_ENV  # Should be "development"

# 2. Check .env file
grep NODE_ENV .env
grep SMTP_FROM_EMAIL .env

# 3. Restart application
./scripts/start.sh
```

### "No sign-in options available"

**Guest sign-in might be disabled**:
```sql
docker exec -it outline-postgres psql -U outline -d outline
SELECT "guestSignin" FROM teams;
-- If false, run:
UPDATE teams SET "guestSignin" = true;
```

### Magic link not appearing in console

**Check log level**:
```bash
# In .env, ensure:
DEBUG=*
LOG_LEVEL=debug

# Or just look for email-related output
./scripts/start.sh | grep -i email
```

### Token expired

Magic links expire after 1 hour. Just request a new one:
1. Go back to sign-in page
2. Enter email again
3. Get new magic link from console

## Comparison with .env.development

The default `.env.development` file includes:
```bash
SMTP_FROM_EMAIL=hello@example.com
```

This is all you need! In development mode:
- ✅ `EMAIL_ENABLED` is automatically `true`
- ✅ Magic links are logged to console
- ✅ No SMTP server needed
- ✅ Works completely offline

## Best Practices

### For Local Development
✅ **DO**: Use email magic links
✅ **DO**: Use `DEBUG=*` to see email logs
✅ **DO**: Test with multiple email addresses
❌ **DON'T**: Configure OAuth unless specifically testing OAuth flows
❌ **DON'T**: Set up SMTP unless testing email delivery

### For Staging/Production
✅ **DO**: Configure real SMTP server
✅ **DO**: Set up OAuth providers
✅ **DO**: Test actual email delivery
✅ **DO**: Enable guest sign-in based on your needs

## Summary

**For development, you only need**:
```bash
NODE_ENV=development
SMTP_FROM_EMAIL=anything@example.com
```

That's it! Skip OAuth, skip SMTP servers, and develop faster with email magic links logged directly to your console.

## Quick Reference

```bash
# Minimal development setup
cat > .env << EOF
NODE_ENV=development
URL=http://local.outline.dev:3030
PORT=3030
SECRET_KEY=$(openssl rand -hex 32)
UTILS_SECRET=$(openssl rand -hex 32)
DATABASE_URL=postgres://outline:outline@localhost:5432/outline
REDIS_URL=redis://localhost:6379
SMTP_FROM_EMAIL=outline@local.dev
DEBUG=*
LOG_LEVEL=debug
EOF

# Start services
./scripts/init.sh
./scripts/start.sh

# Sign in:
# 1. Go to http://local.outline.dev:3030
# 2. Enter any email
# 3. Copy magic link from console
# 4. Paste in browser
# 5. Done!
```

Happy developing! 🚀
