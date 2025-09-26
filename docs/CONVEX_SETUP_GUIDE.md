# Convex Setup Guide for Canvas Discussion Browser

This guide will help you get Convex up and running both locally and in production on Vercel.

## Prerequisites

- Node.js installed
- Git repository cloned locally
- Vercel account set up

## Part 1: Local Development Setup

### Step 1: Start Local Convex Development

Run the following command in your project root:

```bash
npx convex dev
```

**What happens when you run this:**

- First time: You'll see prompts asking if you want to develop locally or create an account
- Choose to create an account (recommended for team development)
- Enter your project name when prompted
- This creates a `convex/` folder for backend functions
- Automatically generates `.env.local` with `NEXT_PUBLIC_CONVEX_URL`

**Keep this command running** while you develop! It continuously syncs your backend code.

### Step 2: Verify Your Local Setup

Check that your `.env.local` file now contains:

```
NEXT_PUBLIC_CONVEX_URL=https://your-deployment-name.convex.cloud
```

**Important:** This URL is unique to your local development environment. Each team member will have their own dev deployment URL - do NOT share this URL with teammates.

### Step 3: Test Your Local Environment

```bash
npm run dev
```

Your app should now run locally with Convex backend connected.

### Step 4: Access the Convex Dashboard

```bash
npx convex dashboard
```

This opens your deployment dashboard where you can monitor data and functions.

## Part 2: Production Deployment on Vercel

### Step 1: Generate Production Deploy Key

> [Note]: This is handled by the Convex project owner, it is required for deployment.

1. Open your Convex Dashboard (using `npx convex dashboard`)
2. Go to **Project Settings**
3. Click **Generate Production Deploy Key**
4. Copy the generated key

### Step 2: Configure Vercel Environment Variables

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add a new variable:
   - **Name**: `CONVEX_DEPLOY_KEY`
   - **Value**: Paste the deploy key from Step 1
   - **Environment**: Select **Production** only

### Step 3: Update Vercel Build Command

In your Vercel project settings:

1. Go to **Settings** → **General**
2. Find **Build & Development Settings**
3. Override the **Build Command** with:
   ```bash
   npx convex deploy --cmd 'npm run build'
   ```

### Step 4: Deploy to Production

Now when you push to your main branch, Vercel will:

1. Use the deploy key to push Convex functions to production
2. Set `NEXT_PUBLIC_CONVEX_URL` to your production Convex deployment
3. Build your app with the production Convex URL

## Part 3: Troubleshooting Common Issues

### Issue 1: "You're currently developing against your dev deployment" Error

**Error message you might see:**

```
You're currently developing against your dev deployment
opulent-fennec-744 (set in CONVEX_DEPLOYMENT)
Your prod deployment diligent-gnu-695 serves traffic at:
NEXT_PUBLIC_CONVEX_URL=https://diligent-gnu-695.convex.cloud
? Do you want to push your code to your prod deployment diligent-gnu-695 now?
```

**What this means:** You're trying to deploy to production without proper setup.

**Solution:**

1. First, complete the local setup (Part 1) if you haven't already
2. Make sure you've configured the Vercel environment variables (Part 2, Step 2)
3. Don't manually run deploy commands - let Vercel handle deployment

### Issue 2: Missing Environment Variables

**Error:** `Missing NEXT_PUBLIC_CONVEX_URL in your .env file`

**Solution:**

1. Make sure you've run `npx convex dev` at least once
2. Check that `.env.local` exists and contains `NEXT_PUBLIC_CONVEX_URL`
3. For production, ensure `CONVEX_DEPLOY_KEY` is set in Vercel

### Issue 3: Build Failures on Vercel

**Common causes:**

- Missing `CONVEX_DEPLOY_KEY` environment variable
- Incorrect build command
- Not committing the `convex/_generated/` directory

**Solution:**

1. Verify `CONVEX_DEPLOY_KEY` is set in Vercel environment variables
2. Ensure build command is: `npx convex deploy --cmd 'npm run build'`
3. Commit and push all files in `convex/_generated/` directory

### Issue 4: Fresh Database Concerns

**You mentioned the database is fresh and safe to update:**

- You can safely push your local Convex code to production
- After deployment, verify everything works by testing the application
- Monitor the Convex dashboard for any errors

## Part 4: Best Practices

### Version Control

- **Always commit** the `convex/_generated/` directory
- This allows team members to type-check code without running `npx convex dev`

### Development Workflow

1. Keep `npx convex dev` running during development
2. Make changes to Convex functions in the `convex/` folder
3. Changes sync automatically to your dev deployment
4. Use the dashboard to debug and monitor

### Team Development

- Each developer should run `npx convex dev` locally to get their own dev deployment
- The `.env.local` file should NOT be committed (it's in `.gitignore`) - each developer gets their own
- Local development URLs are personal and should not be shared between teammates
- Production deployment happens automatically through Vercel

## Quick Reference Commands

```bash
# Start local development (keep running)
npx convex dev

# Open dashboard
npx convex dashboard

# Run your app locally
npm run dev

# Manual deploy (usually not needed)
npx convex deploy --cmd 'npm run build'
```

## Need Help?

- Check the Convex Dashboard for error logs
- Verify environment variables are set correctly
- Make sure both local and production deployments are working
- Contact the team if you encounter issues not covered here

## Additional Resources

For more detailed information, refer to the official Convex documentation:

- [Development Workflow](https://docs.convex.dev/understanding/workflow) - Understanding the Convex development process
- [Vercel Production Hosting](https://docs.convex.dev/production/hosting/vercel) - Complete guide for deploying to Vercel
- [Environment Variables](https://docs.convex.dev/production/environment-variables) - Managing environment variables in production

---

Remember: Run `npx convex dev` first, get local development working, then configure production deployment on Vercel!
