# 🔐 Gitleaks Security Dashboard

A premium, real-time **Atlassian Forge** application that provides organization-wide secret leak detection and management for Bitbucket Cloud. Built with Forge UI Kit 2, it scans every repository in your workspace using [Gitleaks](https://github.com/gitleaks/gitleaks) and presents the results in a beautiful, interactive dashboard embedded directly inside Bitbucket.

## ✨ Features

### Executive Dashboard
- **Real-time Metric Cards** — Total repos scanned, active threats (with pulsing alert), clean repos, ignored secrets, last scan time, and org health percentage
- **Organization Health Bar** — Visual Unicode progress bar showing your overall security posture
- **Interactive Charts** — Pie charts (secrets by repo, by type) and bar charts (secrets by team)

### Secret Management
- **Active Threats Tab** — View all detected secrets with team, repo, file, line, type, and direct source links
- **Bulk Ignore / Restore** — Select individual or all secrets, dismiss with categorized reasons, and restore as needed
- **Ignored Secrets Tab** — Track all dismissed secrets with their dismissal reasons and filter by category
- **Clean Repos / Excluded Repos Tabs** — See which repos are clean and which are excluded from scanning

### Filtering & Search
- **Global Search** — Filter across all tabs by repo, file, or secret type
- **Column Filters** — Dedicated filter fields for team, repo, file, line, type, and reason
- **Debounced Input** — Custom FilterField component prevents UI lag even with 400+ secrets

### Audit & Compliance
- **Activity Log** — Full audit trail of every ignore/restore action with user display name, timestamp, files affected, repositories, and reason
- **User Resolution** — Automatically resolves Atlassian account IDs to display names via Bitbucket API
- **CSV Export** — Copy formatted CSV data (with source links) for compliance reporting

### Automated Scanning
- **Python Scanner** (`scan.py`) — Clones every repo in your Bitbucket workspace, runs Gitleaks, and pushes results to the dashboard via authenticated webhook
- **CI/CD Pipeline Ready** — Includes Bitbucket Pipelines YAML for scheduled or manual organization-wide scans
- **Webhook Authentication** — Shared secret token validation for secure data ingestion

## 🏗️ Architecture

```
┌─────────────────────┐     ┌──────────────────────┐
│  Bitbucket Pipeline │     │   Manual Trigger     │
│  (Scheduled Scan)   │     │   (scan.py locally)  │
└────────┬────────────┘     └──────────┬───────────┘
         │                             │
         ▼                             ▼
┌──────────────────────────────────────────────────┐
│              scan.py                             │
│  • Fetches all repos via Bitbucket API           │
│  • Clones each repo (shallow, temp dir)          │
│  • Runs `gitleaks detect --no-git`               │
│  • Redacts secrets, generates fingerprints       │
│  • POSTs results to Forge Web Trigger            │
└────────────────────┬─────────────────────────────┘
                     │ HTTPS + Bearer Token
                     ▼
┌──────────────────────────────────────────────────┐
│         Forge Backend (resolvers/index.js)        │
│  • Validates webhook secret                      │
│  • Stores scan results in Forge KV Storage       │
│  • Manages ignore/restore with audit logging     │
│  • Resolves user display names via Bitbucket API │
└────────────────────┬─────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────┐
│       Forge Frontend (src/frontend/index.jsx)     │
│  • Executive metric cards with pulse animation   │
│  • Interactive tables, charts, filters           │
│  • Bulk ignore/restore modals                    │
│  • Activity log modal                            │
│  • CSV export modal                              │
└──────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Atlassian Forge CLI](https://developer.atlassian.com/platform/forge/getting-started/) (`npm install -g @forge/cli`)
- [Gitleaks](https://github.com/gitleaks/gitleaks) installed on your system
- Python 3.8+ (for the scanner script)
- A Bitbucket Cloud workspace with admin access

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/abhineetsagar/forge-gitleaks-security-dashboard
   cd gitleaks-security-dashboard
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Register your Forge app**
   ```bash
   forge register
   ```

4. **Deploy to your environment**
   ```bash
   forge deploy -e production
   ```

5. **Install on your Bitbucket workspace**
   ```bash
   forge install -e production
   ```

6. **Set the webhook secret**
   ```bash
   forge variables set WEBHOOK_SECRET your-secret-token -e production
   ```

### Running the Scanner

1. **Configure `scan.py`**
   - Update `WEBHOOK_URL` with your Forge Web Trigger URL (visible in the dashboard under "App Webtrigger Link")
   - Update `WORKSPACE` with your Bitbucket workspace slug
   - Update `REPO_TEAM_MAP` with your repository-to-team mappings

2. **Run locally**
   ```bash
   python3 scan.py
   ```

3. **Run via CI/CD** (see `bitbucket-pipelines.yml` for pipeline configuration)
   ```bash
   # Set these as pipeline variables:
   # BOT_USER, BITBUCKET_TOKEN, WEBHOOK_SECRET
   ```

## 📁 Project Structure

```
├── manifest.yml                 # Forge app manifest
├── package.json                 # Node.js dependencies
├── scan.py                      # Python scanner script
├── bitbucket-pipelines.yml      # CI/CD pipeline config
├── .gitleaksignore              # Global gitleaks ignore rules
└── src/
    ├── frontend/
    │   └── index.jsx            # React UI (Forge UI Kit 2)
    └── resolvers/
        └── index.js             # Backend resolvers + webhook handler
```

## 🔧 Configuration

### Environment Variables
| Variable | Description | Required |
|----------|-------------|----------|
| `WEBHOOK_SECRET` | Shared secret for webhook authentication | Yes |
| `BOT_USER` | Bitbucket username for API access (CI/CD) | For pipeline |
| `BITBUCKET_TOKEN` | Bitbucket app password (CI/CD) | For pipeline |
| `EXCLUDE_FOLDERS` | Comma-separated folders to skip | No |
| `EXCLUDE_REPOS` | Comma-separated repos to skip | No |

### Dismiss Categories
The dashboard supports these built-in dismissal reasons:
- False Positive
- Upstream dependency
- Sandbox/Localhost only
- Test files only
- Default environment config
- Others

## 🛡️ Security

- All secrets are **redacted** before storage (first 4 chars shown, rest masked)
- Webhook ingestion is protected by **Bearer token authentication**
- The Forge app runs in Atlassian's **secure sandbox** (no direct file system or network access)
- Audit logs track **every action** with user identity and timestamp

## 📄 License

MIT License — see [LICENSE](https://github.com/abhineetsagar/forge-gitleaks-security-dashboard/blob/main/LICENSE) for details.

## 🤝 Contributing

Contributions are welcome! Please open an issue or submit a pull request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 👤 Author

Built by **Abhineet Sagar** 
