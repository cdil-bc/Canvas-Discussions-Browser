# GitHub Fork Collaboration Workflow

## 🎯 Overview

This guide covers the practical day-to-day workflow for collaborating using GitHub forks. It's designed for our Canvas Discussion Browser project where Tim owns the main repository and Kyle works from a fork.

## 🏗️ Initial Setup (One Time Only)

### For the Fork Owner (Kyle)
```bash
# Clone your fork
git clone git@github.com:fidalgok/Canvas-Discussions-Browser.git
cd Canvas-Discussions-Browser

# Add the main repository as "upstream"
git remote add upstream git@github.com:cdil-bc/Canvas-Discussions-Browser.git

# Verify remotes are set up correctly
git remote -v
# Should show:
# origin    git@github.com:fidalgok/Canvas-Discussions-Browser.git (fetch)
# origin    git@github.com:fidalgok/Canvas-Discussions-Browser.git (push)
# upstream  git@github.com:cdil-bc/Canvas-Discussions-Browser.git (fetch)
# upstream  git@github.com:cdil-bc/Canvas-Discussions-Browser.git (push)
```

### For the Main Repo Owner (Tim)
```bash
# Clone your repository
git clone git@github.com:cdil-bc/Canvas-Discussions-Browser.git
cd Canvas-Discussions-Browser

# Add Kyle's fork as a remote (for easy access to his branches)
git remote add kyle git@github.com:fidalgok/Canvas-Discussions-Browser.git

# Verify setup
git remote -v
```

## 📅 Daily Workflow

### Starting Work (Both Developers)

**1. Always Start Fresh from Main**
```bash
# Switch to main branch
git checkout main

# Fetch latest changes from main repository
git fetch upstream

# Update your local main to match upstream
git merge upstream/main

# Push updated main to your fork (Kyle only)
git push origin main
```

**2. Create Feature Branch**
```bash
# Create and switch to new feature branch
git checkout -b feature/your-feature-name

# Start coding!
```

### During Development

**Commit Early and Often**
```bash
# Stage changes
git add .

# Commit with descriptive message
git commit -m "Add student claiming button to user profile

- Implement StudentClaimStatus component
- Add Convex hooks for real-time status
- Style claim button with CSS variables"
```

**Push to Your Fork Regularly**
```bash
# Push feature branch to your fork
git push origin feature/your-feature-name
```

### Before Creating a Pull Request

**1. Sync with Latest Main (Important!)**
```bash
# Fetch latest changes
git fetch upstream

# Switch to main and update
git checkout main
git merge upstream/main

# Switch back to your feature branch
git checkout feature/your-feature-name

# Merge latest main into your feature
git merge main

# Resolve any conflicts, then push
git push origin feature/your-feature-name
```

**2. Test Everything**
- Run the application locally
- Test your feature thoroughly
- Check that existing features still work

## 📝 Pull Request Process

### Creating the PR

1. **Push final changes to your fork**
2. **Go to main repository on GitHub** (cdil-bc/Canvas-Discussions-Browser)
3. **Click "Pull Requests" → "New Pull Request"**
4. **Set up the PR correctly:**
   - Base repository: `cdil-bc/Canvas-Discussions-Browser`
   - Base branch: `main`
   - Head repository: `fidalgok/Canvas-Discussions-Browser`
   - Compare branch: `feature/your-feature-name`

### PR Description Template
```markdown
## What This PR Does
Brief description of the feature/fix

## Technical Changes
- List of files modified
- New dependencies added
- Database changes (if any)

## Testing
- [ ] Tested locally
- [ ] No breaking changes to existing features
- [ ] Documentation updated

## Screenshots (if UI changes)
[Add screenshots showing before/after]

## Questions/Concerns
Any areas you'd like specific feedback on
```

### Review Process

**For the Reviewer (Tim):**
1. **Pull the branch locally for testing:**
   ```bash
   git fetch kyle feature/branch-name
   git checkout -b test-feature kyle/feature/branch-name
   npm install  # In case of new dependencies
   npm run dev  # Test the feature
   ```

2. **Review on GitHub:**
   - Check code quality and style
   - Look for potential issues
   - Leave specific comments on lines

3. **Approval Process:**
   - ✅ **Approve**: If ready to merge
   - 🔄 **Request Changes**: If issues need fixing
   - 💬 **Comment**: For questions/suggestions

**For the PR Author (Kyle):**
1. **Address feedback promptly**
2. **Push new commits to same branch** (PR updates automatically)
3. **Respond to comments** to show you've addressed them

## 🚨 Avoiding Common Problems

### Problem: "My main branch is behind"
**Solution:**
```bash
git checkout main
git fetch upstream
git merge upstream/main
git push origin main  # Kyle only
```

### Problem: "I have merge conflicts"
**Prevention:**
- Always sync with upstream main before starting work
- Keep feature branches short-lived (1-2 weeks max)
- Communicate about overlapping work areas

**Resolution:**
```bash
# If conflicts during merge
git status  # Shows conflicted files
# Edit files to resolve conflicts
git add .
git commit -m "Resolve merge conflicts"
```

### Problem: "I accidentally committed to main"
**Solution:**
```bash
# Create feature branch from current state
git checkout -b feature/fix-main-commits

# Reset main to upstream
git checkout main
git reset --hard upstream/main
git push origin main --force-with-lease  # Kyle only
```

### Problem: "I need to change my commits"
**For unpushed commits:**
```bash
git commit --amend  # Fix last commit
git rebase -i HEAD~3  # Edit last 3 commits
```

**For pushed commits (use sparingly):**
```bash
# Make your changes
git push origin feature/branch-name --force-with-lease
```

## 📞 Communication Protocol

### When to Communicate BEFORE Starting Work
- **Large features** (more than a day of work)
- **Changes to shared files** (components, utilities, configs)
- **Database/schema changes**
- **New dependencies**

### How to Communicate
1. **GitHub Issues**: For feature requests and bug reports
   ```markdown
   Title: Add email notifications for student claims

   Description:
   When a student is claimed/completed, send email to other facilitators

   Acceptance Criteria:
   - [ ] Email sent when student claimed
   - [ ] Email sent when student completed
   - [ ] Option to disable notifications in settings
   ```

2. **Draft PRs**: For work-in-progress collaboration
   - Create PR with "[WIP]" or "[Draft]" in title
   - Use for early feedback on approach
   - Convert to ready when complete

3. **PR Comments**: For code-specific discussions
   - Ask questions about specific implementations
   - Suggest alternatives
   - Request clarification

### GitHub Features to Use

**1. Issues for Planning**
- Create issues for features before implementing
- Use labels (bug, enhancement, question)
- Assign to responsible person

**2. Project Boards (Optional)**
- Track feature progress
- Organize work by priority

**3. Branch Protection (Tim - Repo Owner)**
- Require PR reviews before merging
- Require status checks to pass
- Prevent force pushes to main

## 🔄 Regular Maintenance

### Weekly Cleanup (Both Developers)
```bash
# Delete merged feature branches
git branch -d feature/completed-feature

# Clean up remote references
git remote prune origin
git remote prune upstream
```

### Monthly Sync Check
- Ensure forks are up to date
- Clean up old branches
- Review collaboration process

## 🚀 Emergency Procedures

### If Main Gets Broken
1. **Identify the problematic commit**
2. **Create hotfix branch immediately:**
   ```bash
   git checkout main
   git checkout -b hotfix/fix-critical-issue
   # Make minimal fix
   git commit -m "Fix critical issue with X"
   ```
3. **Fast-track PR review**
4. **Deploy immediately after merge**

### If Fork Gets Out of Sync
```bash
# Nuclear option - reset fork to match upstream
git checkout main
git fetch upstream
git reset --hard upstream/main
git push origin main --force-with-lease
```

## 📋 Checklists

### Before Starting New Feature
- [ ] Is main branch up to date?
- [ ] Have I communicated about this feature?
- [ ] Do I have a clear plan?
- [ ] Is there a GitHub issue for this?

### Before Creating PR
- [ ] Is feature branch up to date with main?
- [ ] Have I tested locally?
- [ ] Are there any breaking changes?
- [ ] Have I updated documentation?
- [ ] Is the PR description complete?

### Before Merging (Reviewer)
- [ ] Does the code look good?
- [ ] Have I tested it locally?
- [ ] Are there any security concerns?
- [ ] Is documentation updated?
- [ ] Will this break anything?

---

## 🎓 Key Principles

1. **Communicate Early**: Better to over-communicate than cause conflicts
2. **Stay Synced**: Fetch from upstream daily
3. **Small PRs**: Easier to review and less likely to conflict
4. **Test Everything**: Both your changes and existing functionality
5. **Document Decisions**: Use PRs and issues to explain why, not just what

This workflow will evolve as we learn what works best for our collaboration style!