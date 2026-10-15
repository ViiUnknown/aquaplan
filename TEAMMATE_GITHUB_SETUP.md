# AquaPlan – GitHub Setup for Teammates

**Repo:** https://github.com/ViiUnknown/aquaplan
**Reviewer / merger:** `ViiUnknown`

Type all commands in the **VS Code terminal** (`` Ctrl+` ``).

---

## The rules

1. **Never work on `main`.** Make a new branch for every task.
2. **Push your branch and open a pull request.**
3. **Don't merge.** ViiUnknown reviews and merges into `main`.

```
you: branch → code → commit → push → pull request
                                          │
ViiUnknown:                    review → approve → merge into main
```

---

## Part 1 – One-time setup

### Step 0 – Send your GitHub username to ViiUnknown
No account yet? Sign up at https://github.com first. ViiUnknown needs your **username** to invite you.

### Step 1 – Install Git and the GitHub CLI
Skip this if both `git --version` and `gh --version` already work.
```powershell
winget install --id Git.Git -e
winget install --id GitHub.cli -e
```
Then **close and reopen** the terminal.

### Step 2 – Log in to GitHub
```powershell
gh auth login
```
Choose these answers:
```
Where do you use GitHub?                       → GitHub.com
Preferred protocol for Git operations?         → HTTPS
Authenticate Git with your GitHub credentials? → Yes
How would you like to authenticate?            → Login with a web browser
```
Copy the code it shows, press Enter, paste the code in the browser and approve. Then run:
```powershell
gh auth setup-git
gh auth status
```
✅ You should see `Logged in to github.com account YOUR-USERNAME`.

### Step 3 – Tell Git your name and email
Use the **same email as your GitHub account**.
```powershell
git config --global user.name  "Your Name"
git config --global user.email "you@example.com"
```

### Step 4 – Accept the invite (after ViiUnknown has invited you)
```powershell
gh api user/repository_invitations --jq ".[] | {id, repo: .repository.full_name}"
```
You'll see something like:
```
{"id":123456789,"repo":"ViiUnknown/aquaplan"}
```
Accept it using **your** id number:
```powershell
gh api -X PATCH user/repository_invitations/123456789
```
Nothing shows up? ViiUnknown hasn't invited you yet. Ask them.

### Step 5 – Download the project
```powershell
cd D:\Projects            # or any folder where you keep projects
gh repo clone ViiUnknown/aquaplan
cd aquaplan
code .
```
✅ VS Code opens the AquaPlan project. Setup done!

---

## Part 2 – Every time you work on a task

```powershell
# 1. Get the newest code
git switch main
git pull

# 2. Make a new branch for your task
git switch -c feature/field-form

# 3. Write your code... then save a snapshot (do this often)
git add .
git commit -m "Add field form with validation"

# 4. Upload your branch
git push -u origin feature/field-form

# 5. Ask ViiUnknown to review it
gh pr create --fill --reviewer ViiUnknown
```

### 🛑 Stop here. Don't merge. ViiUnknown will merge it.

Check your pull request any time:
```powershell
gh pr status
```

### If ViiUnknown asks for changes
Stay on the **same branch**, fix the code, then:
```powershell
git add .
git commit -m "Fix area validation"
git push
```
The pull request updates automatically. No need to open a new one.

### After ViiUnknown merges
Start again from **step 1** with a **new** branch for your next task.

### Branch name examples
| Type of work | Example |
|---|---|
| New feature | `feature/field-form`, `feature/rice-model` |
| Bug fix | `fix/records-bug` |
| Design / CSS | `style/dashboard` |
| Documents | `docs/update-readme` |

---

## Common problems

| Problem | Fix |
|---|---|
| `protected branch` / `push declined` | You're on `main`. Run `git switch -c feature/x`, then `git push -u origin feature/x` |
| `Permission denied` / `403` | You haven't accepted the invite (Step 4), or you're logged in as the wrong account (`gh auth status`) |
| `rejected ... fetch first` | Run `git pull`, then `git push` again |
| Which branch am I on? | `git branch --show-current` |
| Changed files on `main` by mistake (not committed) | `git switch -c feature/x`. Your changes move to the new branch |
| Undo changes to a file (not committed) | `git restore FILE-NAME` |
| `CONFLICT` message | Open the file, keep the correct code, delete the `<<<<<<<`, `=======`, `>>>>>>>` lines, then `git add .`, `git commit -m "Fix conflict"`, `git push`. If stuck: `git merge --abort` and ask the team |

**Tips:** always `git pull` on `main` before making a new branch, keep each pull request small, and
tell the team before editing shared files (`index.html`, `css/styles.css`, `js/main.js`).

---

## Cheat sheet

```powershell
git status                                  # what did I change?
git switch main; git pull                   # get the newest code
git switch -c feature/NAME                  # new branch
git add .                                   # prepare changes
git commit -m "Message"                     # save snapshot
git push -u origin feature/NAME             # first upload of a branch
git push                                    # later uploads
gh pr create --fill --reviewer ViiUnknown   # ask for review
gh pr status                                # check my pull requests
```
