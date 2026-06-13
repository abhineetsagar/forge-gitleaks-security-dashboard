import subprocess
import requests
import json
import os
import getpass
import tempfile
import hashlib
import urllib.parse
import sys

# ============================================================================
# CONFIGURATION - Update these values for your organization
# ============================================================================
WEBHOOK_URL = "YOUR_FORGE_WEB_TRIGGER_URL"
WORKSPACE = "your-workspace"

# Folders to ALWAYS exclude from gitleaks scanning
DEFAULT_EXCLUDE_FOLDERS = []

# Repositories to ALWAYS skip (never clone or scan these)
DEFAULT_EXCLUDE_REPOS = []

# Map repository names to team names for dashboard grouping
# Update this with your own repository-to-team mappings
REPO_TEAM_MAP = {
    # 'repo-name': 'Team Name'
}

def clone_repository(repo_slug, username, app_password, clone_dir):
    encoded_user = urllib.parse.quote(username, safe='')
    encoded_pass = urllib.parse.quote(app_password, safe='')
    clone_url = f"https://{encoded_user}:{encoded_pass}@bitbucket.org/{WORKSPACE}/{repo_slug}.git"
    try:
        subprocess.run(
            ["git", "clone", "--depth", "1", clone_url, clone_dir],
            check=True,
            capture_output=True,
            text=True
        )
        return True
    except subprocess.CalledProcessError as e:
        print(f"Git Clone Error on {repo_slug}: {e.stderr}")
        return False

def run_gitleaks(directory, repo_name, webhook_secret, exclude_folders=None):
    """
    Runs Gitleaks on a specific directory and pushes results to the Forge dashboard.
    Uses gitleaks' native --exclude-path for folder exclusion.
    """
    report_path = os.path.join(directory, "report.json")
    
    cmd = (
        f"gitleaks detect "
        f"--source={directory} "
        f"--report-path={report_path} "
        f"--report-format=json "
        f"--no-git "
        f"--exit-code=0"
    )
    
    repo_ignore_file = os.path.join(directory, ".gitleaksignore")
    if os.path.exists(repo_ignore_file):
        cmd += f' --gitleaks-ignore-path={repo_ignore_file}'
        print(f"  Using .gitleaksignore from {repo_name}")
    
    global_ignore = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".gitleaksignore")
    if os.path.exists(global_ignore) and not os.path.exists(repo_ignore_file):
        cmd += f' --gitleaks-ignore-path={global_ignore}'
    
    print(f"Running Gitleaks on {repo_name}...")
    subprocess.run(cmd, shell=True, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    secrets = []
    try:
        with open(report_path, 'r') as f:
            report_data = json.load(f)
            for item in report_data:
                secret_value = item.get("Secret", "")
                
                # Redact the secret for safety
                redacted = secret_value
                if len(secret_value) > 4:
                    redacted = secret_value[:4] + ("*" * 12)
                else:
                    redacted = "****"
                    
                file_path = item.get("File", "")
                
                try:
                    relative_path = os.path.relpath(file_path, directory)
                except ValueError:
                    relative_path = file_path
                    
                line = item.get("StartLine", 0)
                
                link = f"https://bitbucket.org/{WORKSPACE}/{repo_name}/src/HEAD/{relative_path}#lines-{line}"
                
                fingerprint_str = f"{repo_name}:{relative_path}:{item.get('RuleID', 'Unknown')}:{redacted}"
                fingerprint = hashlib.sha256(fingerprint_str.encode()).hexdigest()
                
                secrets.append({
                    "fingerprint": fingerprint,
                    "file": relative_path,
                    "line": line,
                    "rule": item.get("RuleID", "Unknown"),
                    "redacted_secret": redacted,
                    "link": link
                })
    except FileNotFoundError:
        pass
        
    team_name = REPO_TEAM_MAP.get(repo_name, "Unassigned")
    
    payload = {
        "repo": repo_name,
        "team": team_name,
        "count": len(secrets),
        "secrets": secrets
    }
    
    headers = {
        "Authorization": f"Bearer {webhook_secret}",
        "Content-Type": "application/json"
    }
    requests.post(WEBHOOK_URL, json=payload, headers=headers)
    print(f"Sent count ({len(secrets)}) for '{repo_name}' to dashboard!")


def get_all_repositories(username, app_password):
    """
    Fetches all repositories for the workspace using the Bitbucket Cloud API.
    """
    true_username = username
    user_resp = requests.get("https://api.bitbucket.org/2.0/user", auth=(username, app_password))
    if user_resp.status_code == 200:
        true_username = user_resp.json().get("username", username)
        
    repos = []
    url = f"https://api.bitbucket.org/2.0/repositories/{WORKSPACE}"
    
    print(f"\nFetching repository list from Bitbucket for workspace: {WORKSPACE}...")
    
    while url:
        response = requests.get(url, auth=(username, app_password))
        if response.status_code != 200:
            print(f"Failed to fetch repositories: {response.text}")
            break
            
        data = response.json()
        
        for repo in data.get('values', []):
            name = repo['name']
            slug = repo['slug']
            repos.append((name, slug))
                
        url = data.get('next')
        
    print(f"Found {len(repos)} repositories.")
    return repos, true_username


def main():
    print("=== Centralized Gitleaks Scanner ===")
    
    if WEBHOOK_URL == "YOUR_FORGE_WEB_TRIGGER_URL":
        print("WARNING: You must replace WEBHOOK_URL in this script with your actual Forge Web Trigger URL.")
        return
        
    username = os.environ.get("BOT_USER") or os.environ.get("BITBUCKET_USERNAME")
    if not username and sys.stdin.isatty():
        username = input("Enter your Bitbucket Username (e.g. email or handle): ")
        
    app_password = os.environ.get("BITBUCKET_TOKEN") or os.environ.get("BITBUCKET_APP_PASSWORD")
    if not app_password and sys.stdin.isatty():
        app_password = getpass.getpass("Enter your Bitbucket App Password/Token: ")
        
    webhook_secret = os.environ.get("WEBHOOK_SECRET")
    if not webhook_secret and sys.stdin.isatty():
        webhook_secret = input("Enter the WEBHOOK_SECRET for the Forge webhook: ")
    
    exclude_folders = DEFAULT_EXCLUDE_FOLDERS.copy()
    extra_folders = os.environ.get("EXCLUDE_FOLDERS")
    if extra_folders is None and sys.stdin.isatty():
        extra_folders = input("Enter extra folders to exclude (comma separated), or press Enter to skip: ")
    if extra_folders and extra_folders.strip():
        exclude_folders.extend([f.strip() for f in extra_folders.split(',') if f.strip()])
    
    print(f"Excluding folders: {exclude_folders}")
    
    exclude_repos = DEFAULT_EXCLUDE_REPOS.copy()
    extra_repos = os.environ.get("EXCLUDE_REPOS")
    if extra_repos and extra_repos.strip():
        exclude_repos.extend([r.strip().lower() for r in extra_repos.split(',') if r.strip()])
    
    if exclude_repos:
        print(f"Excluding repos: {exclude_repos}")
    
    repos, true_username = get_all_repositories(username, app_password)
    
    if not repos:
        print("No repositories found or authentication failed. Exiting.")
        return
        
    for name, slug in repos:
        if slug.lower() in exclude_repos or name.lower() in exclude_repos:
            print(f"\n--- Skipping {name} (excluded) ---")
            if WEBHOOK_URL and webhook_secret:
                payload = {
                    "repo": name,
                    "team": "Unassigned",
                    "count": 0,
                    "secrets": [],
                    "excluded": True
                }
                headers = {
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {webhook_secret}"
                }
                try:
                    requests.post(WEBHOOK_URL, json=payload, headers=headers, timeout=10)
                except Exception:
                    pass
            continue
        
        print(f"\n--- Processing {name} ({slug}) ---")
        
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_dir = os.path.join(temp_dir, slug)
            
            print(f"Cloning {name}...")
            if not clone_repository(slug, true_username, app_password, repo_dir):
                continue
            
            if not os.path.exists(repo_dir):
                print(f"Failed to clone {name}. Skipping.")
                continue
                
            if exclude_folders:
                import shutil
                for root, dirs, files in os.walk(repo_dir, topdown=False):
                    for d in dirs:
                        if d in exclude_folders:
                            target_dir = os.path.join(root, d)
                            try:
                                shutil.rmtree(target_dir)
                            except Exception:
                                pass
                
            run_gitleaks(repo_dir, name, webhook_secret, exclude_folders)

    print("\nAll repositories processed successfully!")

if __name__ == "__main__":
    main()
