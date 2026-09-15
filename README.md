# Abishek's Memories

A cinematic personal memory archive website with:

- Home, Gallery, Videos, Albums, Voices, Text, Private, About, Contact and Socials
- Admin login
- Admin upload system for photos, videos, voices and documents
- Admin text/story editor for memories and love stories
- Public/private visibility
- Private archive password
- Likes and comments
- Downloads
- Responsive dark cinematic UI
- No external API required

## 1. Requirements

Install Node.js 18+.

## 2. Setup

```bash
npm install
```

Copy `.env.example` to `.env` and replace the placeholder values:

```env
PORT=3000
SESSION_SECRET=use-a-long-random-secret

ADMIN_USERNAME=your-admin-username
ADMIN_PASSWORD=your-admin-password

PRIVATE_CONTENT_PASSWORD=your-private-password

SITE_NAME=Abishek's Memories
SITE_TAGLINE=My life. My memories. My story.
```

**Never commit `.env` to GitHub.** It is already ignored by `.gitignore`.

## 3. Run

```bash
npm start
```

Open:

- Website: http://localhost:3000
- Admin: http://localhost:3000/admin.html

## 4. Data and uploads

The server automatically creates:

- `data/content.json` — metadata, likes and comments
- `uploads/` — uploaded files

These are ignored by Git because they can contain private/personal content.

## 5. Important security notes

This starter is designed to be simple and self-contained. Before making a public production deployment:

- Use HTTPS.
- Set `cookie.secure=true` when running behind HTTPS.
- Use a strong random `SESSION_SECRET`.
- Use strong unique admin/private passwords.
- Add rate limiting / brute-force protection.
- For a larger site, move sessions and content metadata to a real database and files to private object storage.
- Back up `data/` and `uploads/`.
- Do not place secrets in frontend JavaScript.

## 6. Love story

Use **Admin → Add text memory**, select an album such as `Love Story`, and choose **Private** if you want it protected by the private archive password.

## 7. Deployment

This project can run on any Node.js host that supports persistent disk storage. If your host has an ephemeral filesystem, uploaded files and `data/content.json` will not survive redeploys/restarts; use persistent storage or object storage for production.
