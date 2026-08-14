# Folder

An open-source, serverless **Digital Asset Management (DAM)** software that helps you **store, organize, and share** files and folders. With **Folder**, you can securely share files, manage permissions, and even publish folders as a static website.

![Folder Preview](/public/folder-preview/0.0.png)
![Folder Preview](/public/folder-preview/6.0.png)
![Folder Preview](/public/folder-preview/1.0.png)

## Why Folder?

- **Alternative to Google Drive**: Store files, manage assets, and serve them locally.
- **Built for AI & Modern Workflows**: Direct file access for AI training or querying.
- **Developer-Friendly**: Deploy locally or easily migrate to the cloud.

## Architecture & Key Workflows

Folder uses a robust multi-tenant architecture designed to scale with enterprise requirements, specifically optimized to act as the foundational layer for sophisticated AI-driven Retrieval-Augmented Generation (RAG) pipelines.

- **Multi-Tenant Organization System:** Workspaces are isolated per organization, with granular department hierarchies. Every asset belongs to an organization, enabling segmented billing, security, and administrative control.
- **Advanced Role-Based Access Control (RBAC):** Custom permissions, spanning from organization-level super-admins to department heads and granular file-level read/write rules.
- **Smart Metadata & Deduplication:** Files are processed on upload to extract comprehensive asset metadata (content types, dimensions, durations, etc.) and generate MD5 hashes to prevent duplicate file uploads and reduce storage costs.
- **Google Drive Integration (Sync & Governance):** Deep integration with Google Drive, allowing administrators to enforce strict folder structures and naming conventions, mapping Drive architectures directly into Folder's internal routing.
- **AI/RAG Readiness:** Designed to feed structured data and assets into AI vector stores. Physical file storage is seamlessly segregated from metadata, laying the groundwork for multimodal semantic search capabilities.

## Tech Stack

- **Frontend**: Nuxt 3, Vue 3, TailwindCSS, Nuxt UI
- **Backend**: Nitro (Server Engine)
- **Database**: Local SQLite & Drizzle ORM (Future: Google Cloud SQL)
- **Storage**: Local File System (Future: Google Cloud Storage)
- **Authentication**: OAuth (Google, GitHub)
- **Deployment**: Local Node Server / Docker (Future: Google Cloud Platform)

## Features

- Intuitive file and folder management with instant directory tree updates
- Files and Folder uploads with metadata extraction and MD5 hash tracking
- Multi-tenant organization and department management
- Secure file sharing with customizable permissions and RBAC
- Public/Private visibility settings and Published Websites
- File previews for common formats
- Full Google Drive Folder sync and governance policies
- Dedicated Admin and Superadmin Portals
- Search functionality
- Responsive design for mobile and desktop
- Dark mode
- Authentication with Google and Github
- Custom domain support
- Locally deployable architecture (Cloud ready)

## Prerequisites

1. **Local Node.js Environment** (Future: Google Cloud Account)
2. **GitHub/Google Cloud Account** (for OAuth authentication)
3. **Domain name** (optional, for custom domains)


## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add some amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## Disclaimer

This project is still in development. **Use at your own risk.** See [DISCLAIMER](DISCLAIMER.md) for details.

## License

Read [LICENSE](LICENSE)
