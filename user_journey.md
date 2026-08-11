# Enterprise DAM User Journey

This document outlines the high-level user journeys for the primary stakeholders in the Digital Asset Management system.

## 1. The Superadmin / Organization Admin

**Goal:** Establish the organization, configure storage, and set up the overarching folder and permission structures.

1. **Sign Up & Org Creation:** The Admin logs in via Google/OAuth and completes their profile. They create the organization, selecting the storage backend (S3 bucket or Google Drive).
2. **Department Configuration:** The Admin creates Departments (e.g., Marketing, Legal, Design) and assigns Department Heads.
3. **Nomenclature & Standards:** The Admin establishes file naming conventions and custom metadata requirements to ensure all uploaded assets follow brand guidelines.
4. **Governance:** The Admin periodically reviews system usage, manages licenses, and audits file access logs.

## 2. The Department Head

**Goal:** Manage their department's assets, approve structural changes, and oversee their team's contributions.

1. **Onboarding:** Receives an invite, logs in, and completes their profile. They are automatically routed to their department's dashboard.
2. **Folder Architecture Approval:** When a team member requests a new folder, the Department Head receives a notification. They review the request (verifying it adheres to the folder taxonomy) and click **Approve** or **Reject**.
3. **Asset Review:** (Future Feature) Reviews newly uploaded assets for brand compliance before they are marked as "Published" or "Approved for use".
4. **Access Management:** Approves access requests for sensitive assets within their department's jurisdiction.

## 3. The Member / Uploader (e.g., Designer, Marketer)

**Goal:** Upload files, find existing assets, and share them with stakeholders.

1. **Upload & Tag:** The Member drags and drops a batch of images into the upload area. The system prompts them to fill out required metadata (campaign name, tags) and automatically applies the agreed-upon nomenclature.
2. **Folder Request:** If the appropriate folder doesn't exist, the Member creates a "Folder Request". They wait for the Department Head to approve it. Once approved, the folder appears, and they can move their files into it.
3. **Search & Retrieve:** The Member uses the search bar (filtering by tags or file type) to locate an old campaign logo.
4. **Share & Distribute:** The Member generates a secure, expirable share link to send the logo to an external contractor.

## 4. The External Guest / Contractor (Future State)

**Goal:** Access specific assets without navigating the entire DAM.

1. **Link Receipt:** Receives a shared link via email.
2. **Portal Access:** Clicks the link and enters a password (if required) to view a branded portal containing only the specific assets shared with them.
3. **Download:** Downloads the web-optimized or original files as needed.
